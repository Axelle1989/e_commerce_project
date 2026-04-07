import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import Stripe from "stripe";
import dotenv from "dotenv";
import { initializeApp, getApps, getApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";

dotenv.config();

// Initialize Firebase Admin
if (!getApps().length) {
  try {
    initializeApp({
      projectId: process.env.VITE_FIREBASE_PROJECT_ID || "ai-studio-applet-webapp-42c27",
    });
  } catch (error) {
    console.error("Firebase Admin initialization error:", error);
  }
}

const db = getFirestore();
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
      await auth.deleteUser(targetUid);

      // 6. Update associated orders
      const ordersSnapshot = await db.collection("orders").where("userId", "==", targetUid).get();
      const batch = db.batch();
      ordersSnapshot.docs.forEach(doc => {
        batch.update(doc.ref, { 
          userId: null, 
          userDeleted: true,
          userOriginalInfo: {
            displayName: targetUserData?.displayName || "Compte supprimé",
            email: targetUserData?.email || "supprimé"
          }
        });
      });
      await batch.commit();

      // 7. Delete Firestore user document
      await db.collection("users").doc(targetUid).delete();

      // 8. Delete Storage files (avatars, ID cards)
      // Note: In a real app, we'd list files in the user's folder.
      // Firebase Admin Storage SDK requires bucket name.
      const bucket = storage.bucket(process.env.VITE_FIREBASE_STORAGE_BUCKET || "ai-studio-applet-webapp-42c27.firebasestorage.app");
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
      const bucketName = process.env.VITE_FIREBASE_STORAGE_BUCKET || "ai-studio-applet-webapp-42c27.firebasestorage.app";
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
