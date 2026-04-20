import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import Stripe from "stripe";
import dotenv from "dotenv";
import { initializeApp, getApps, getApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";

import firebaseConfig from "./firebase-applet-config.json" assert { type: "json" };

dotenv.config();

// Initialize Firebase Admin
if (!getApps().length) {
  try {
    console.log("Initializing Firebase Admin with Project ID:", firebaseConfig.projectId);
    initializeApp({
      projectId: firebaseConfig.projectId,
    });
    console.log("Firebase Admin initialized successfully");
  } catch (error) {
    console.error("Firebase Admin initialization error:", error);
  }
}

const db = getFirestore(firebaseConfig.firestoreDatabaseId);
const auth = getAuth();
const storage = getStorage();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder");

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Admin: Delete user account
  app.post("/api/admin/delete-user", async (req, res) => {
    try {
      const { targetUid, adminUid, idToken } = req.body;

      if (!targetUid || !adminUid || !idToken) {
        return res.status(400).json({ error: "Missing parameters" });
      }

      // 1. Verify admin token
      const decodedToken = await auth.verifyIdToken(idToken);
      if (decodedToken.uid !== adminUid) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      // 2. Verify admin role in Firestore
      const adminDoc = await db.collection("users").doc(adminUid).get();
      if (!adminDoc.exists || adminDoc.data()?.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: Admin access required" });
      }

      // 3. Prevent admin from deleting themselves
      if (targetUid === adminUid) {
        return res.status(400).json({ error: "You cannot delete your own admin account through this interface." });
      }

      // 4. Get target user info for storage cleanup
      const targetUserDoc = await db.collection("users").doc(targetUid).get();
      const targetUserData = targetUserDoc.data();

      // 5. Delete from Firebase Auth
      let authDeleted = false;
      try {
        await auth.deleteUser(targetUid);
        authDeleted = true;
      } catch (authError: any) {
        if (authError.code === 'auth/user-not-found') {
          console.warn(`User ${targetUid} not found in Firebase Auth, continuing with Firestore cleanup.`);
        } else {
          console.error("Auth deletion failed, proceeding with Firestore deactivation:", authError.message);
        }
      }

      // 6. Set Admin Custom Claim (as requested in step 4)
      try {
        await auth.setCustomUserClaims(adminUid, { admin: true });
      } catch (claimError: any) {
        console.warn("Could not set admin claim:", claimError.message);
      }

      // 7. Resilient Firestore Updates (Sequential to identify failures)
      try {
        // Update associated orders (as Client)
        const ordersSnapshot = await db.collection("orders").where("userId", "==", targetUid).get();
        for (const doc of ordersSnapshot.docs) {
          await doc.ref.update({ 
            userId: "deleted_user", 
            userDeleted: true,
            userOriginalInfo: {
              displayName: targetUserData?.displayName || "Compte supprimé",
              email: targetUserData?.email || "supprimé"
            }
          });
        }

        // Update associated orders (as Driver)
        const driverOrdersSnapshot = await db.collection("orders").where("driverId", "==", targetUid).get();
        for (const doc of driverOrdersSnapshot.docs) {
          await doc.ref.update({ 
            driverId: "deleted_driver",
            driverDeleted: true,
            driverOriginalName: targetUserData?.displayName || "Livreur supprimé"
          });
        }

        // Delete associated reviews
        const reviewsSnapshot = await db.collection("reviews").where("userId", "==", targetUid).get();
        for (const doc of reviewsSnapshot.docs) { await doc.ref.delete(); }
        const driverReviewsSnapshot = await db.collection("reviews").where("driverId", "==", targetUid).get();
        for (const doc of driverReviewsSnapshot.docs) { await doc.ref.delete(); }

        // Delete associated chats
        const chatsSnapshot = await db.collection("chats").where("livreurId", "==", targetUid).get();
        for (const doc of chatsSnapshot.docs) { await doc.ref.delete(); }

        // 8. Final User Document Update (Deactivation/Soft Delete)
        // We use set with merge: true to be extremely resilient
        await db.collection("users").doc(targetUid).set({
          status: 'suspended',
          active: false,
          suspended: true,
          isDeleted: true,
          deletedAt: FieldValue.serverTimestamp(),
          adminNote: "Supprimé/Désactivé par l'administrateur"
        }, { merge: true });

        // 9. Log the action
        await db.collection("admin_logs").add({
          adminId: adminUid,
          targetUserId: targetUid,
          targetUserEmail: targetUserData?.email || "inconnu",
          action: "delete_user_account",
          timestamp: FieldValue.serverTimestamp()
        });

      } catch (firestoreError: any) {
        console.error("Firestore cleanup error:", firestoreError);
        // We don't throw here to allow the response to return what was done
      }

      // 10. Delete Storage files (avatars, ID cards)
      const bucket = storage.bucket(firebaseConfig.storageBucket || "ai-studio-applet-webapp-42c27.firebasestorage.app");
      try {
        await bucket.deleteFiles({ prefix: `users/${targetUid}/` });
      } catch (storageError) {
        console.error("Storage cleanup error (might be empty):", storageError);
      }

      res.json({ success: true, message: "User account deleted successfully" });
    } catch (error: any) {
      console.error("Admin delete user error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Driver: Refuse interview and delete account
  app.post("/api/driver/refuse-interview", async (req, res) => {
    try {
      const { uid, idToken } = req.body;

      if (!uid || !idToken) {
        return res.status(400).json({ error: "Missing parameters" });
      }

      // 1. Verify token
      const decodedToken = await auth.verifyIdToken(idToken);
      if (decodedToken.uid !== uid) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      // 2. Verify user status in Firestore
      const userDoc = await db.collection("users").doc(uid).get();
      if (!userDoc.exists || userDoc.data()?.status !== "pending_interview") {
        return res.status(400).json({ error: "Invalid user status for this action" });
      }

      const userData = userDoc.data();

      // 3. Delete from Firebase Auth
      await auth.deleteUser(uid);

      // 4. Log to admin_logs
      await db.collection("admin_logs").add({
        action: 'driver_refused_interview',
        targetUserId: uid,
        targetUserEmail: userData?.email,
        details: { reason: 'Interview refused by driver' },
        createdAt: new Date()
      });

      // 5. Delete Firestore user document
      await db.collection("users").doc(uid).delete();

      // 6. Delete Storage files
      const bucketName = firebaseConfig.storageBucket || "ai-studio-applet-webapp-42c27.firebasestorage.app";
      const bucket = storage.bucket(bucketName);
      try {
        await bucket.deleteFiles({ prefix: `users/${uid}/` });
      } catch (storageError) {
        console.error("Storage cleanup error:", storageError);
      }

      res.json({ success: true, message: "Account deleted successfully" });
    } catch (error: any) {
      console.error("Refuse interview error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Admin: Get monthly stats for report
  app.post("/api/admin/monthly-stats", async (req, res) => {
    try {
      const { month, year, adminUid, idToken } = req.body;

      if (!month || !year || !adminUid || !idToken) {
        return res.status(400).json({ error: "Missing parameters" });
      }

      // 1. Verify admin token
      const decodedToken = await auth.verifyIdToken(idToken);
      if (decodedToken.uid !== adminUid) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      // 2. Verify admin role
      const adminDoc = await db.collection("users").doc(adminUid).get();
      if (!adminDoc.exists || adminDoc.data()?.role !== "admin") {
        return res.status(403).json({ error: "Forbidden" });
      }

      // 3. Calculate stats
      const usersSnapshot = await db.collection("users").get();
      const ordersSnapshot = await db.collection("orders").get();
      const disputesSnapshot = await db.collection("disputes").get();

      const stats = {
        newUsers: usersSnapshot.docs.filter(d => d.data().role === 'client').length,
        newDrivers: usersSnapshot.docs.filter(d => d.data().role === 'driver').length,
        totalOrders: ordersSnapshot.size,
        deliveredOrders: ordersSnapshot.docs.filter(d => d.data().status === 'delivered').length,
        cancelledOrders: ordersSnapshot.docs.filter(d => d.data().status === 'cancelled').length,
        totalRevenue: ordersSnapshot.docs.filter(d => d.data().status === 'delivered').reduce((acc, d) => acc + (d.data().totalAmount || 0), 0),
        disputesCount: disputesSnapshot.size
      };

      res.json({ stats });
    } catch (error: any) {
      console.error("Monthly stats error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Stripe Connect: Create an account link for drivers
  app.post("/api/stripe/create-account", async (req, res) => {
    try {
      const { email } = req.body;
      const account = await stripe.accounts.create({
        type: "express",
        email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
      });

      const accountLink = await stripe.accountLinks.create({
        account: account.id,
        refresh_url: `${process.env.APP_URL}/driver/onboarding/refresh`,
        return_url: `${process.env.APP_URL}/driver/onboarding/complete`,
        type: "account_onboarding",
      });

      res.json({ url: accountLink.url, accountId: account.id });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create a payment intent with a transfer to the driver
  app.post("/api/stripe/create-payment-intent", async (req, res) => {
    try {
      const { amount, driverAccountId, deliveryFee } = req.body;
      
      // In a real app, you'd calculate the amount on the server
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // amount in cents
        currency: "eur",
        payment_method_types: ["card"],
        application_fee_amount: 0, // Admin fee (0 in this case)
        transfer_data: {
          destination: driverAccountId,
        },
      });

      res.json({ clientSecret: paymentIntent.client_secret });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
