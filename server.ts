import express from "express";
import cors from "cors";
import path from "path";
import { createServer as createViteServer } from "vite";
import { z } from "zod";
import twilio from "twilio";
import { BrevoClient } from "@getbrevo/brevo";
import { db } from "./src/firebase"; // On réutilise l'instance Firestore existante
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs, 
  deleteDoc, 
  serverTimestamp,
  Timestamp 
} from "firebase/firestore";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // --- CONFIGURATION CLIENTS (Lazy initialization) ---
  let twilioClient: any = null;
  const getTwilioClient = () => {
    if (!twilioClient) {
      const sid = process.env.TWILIO_ACCOUNT_SID;
      const token = process.env.TWILIO_AUTH_TOKEN;
      if (!sid || !token) {
        throw new Error("TWILIO_ACCOUNT_SID ou TWILIO_AUTH_TOKEN manquant");
      }
      const twilioFactory = (twilio as any).default || twilio;
      twilioClient = twilioFactory(sid, token);
    }
    return twilioClient;
  };

  let brevoClient: BrevoClient | null = null;
  const getBrevoClient = () => {
    if (!brevoClient) {
      const apiKey = process.env.BREVO_API_KEY;
      if (!apiKey) {
        throw new Error("BREVO_API_KEY manquant");
      }
      brevoClient = new BrevoClient({
        apiKey: apiKey,
      });
    }
    return brevoClient;
  };

  // --- SCHÉMAS DE VALIDATION ---
  const SendCodeSchema = z.object({
    contact: z.string().min(5),
    mode: z.enum(["email", "phone"]),
  });

  const VerifyCodeSchema = z.object({
    contact: z.string(),
    code: z.string().length(6),
  });

  // --- ROUTES API ---

  /**
   * POST /api/auth/send-code
   * Génère et envoie un OTP (Email ou SMS)
   */
  app.post("/api/auth/send-code", async (req, res) => {
    try {
      const { contact, mode } = SendCodeSchema.parse(req.body);
      
      // 1. Générer code 6 chiffres
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 5 * 60000); // 5 minutes

      // 2. Normalisation contact (Bénin +229)
      let target = contact;
      if (mode === "phone") {
        target = contact.replace(/[^\d+]/g, "");
      }

      // 3. Stocker en DB (Firestore) d'abord pour garantir que la vérification fonctionne
      await addDoc(collection(db, "otps"), {
        contact: target,
        code,
        expiresAt: Timestamp.fromDate(expiresAt),
        attempts: 0,
        createdAt: serverTimestamp()
      });

      // 4. Tentative d'envoi selon le mode ou simulation directe si les clés sont absentes ou invalides
      let useSimulation = false;

      const isTwilioConfigured = !!(
        process.env.TWILIO_ACCOUNT_SID && 
        process.env.TWILIO_AUTH_TOKEN && 
        process.env.TWILIO_ACCOUNT_SID.length > 10 && 
        !process.env.TWILIO_ACCOUNT_SID.includes("YOUR_")
      );

      const isBrevoConfigured = !!(
        process.env.BREVO_API_KEY && 
        process.env.BREVO_API_KEY.length > 20 && 
        !process.env.BREVO_API_KEY.includes("YOUR_")
      );

      if (mode === "phone") {
        if (!isTwilioConfigured) {
          useSimulation = true;
        } else {
          try {
            const client = getTwilioClient();
            await client.messages.create({
              body: `Votre code de vérification CourseExpress est : ${code}. Il expire dans 5 minutes.`,
              from: process.env.TWILIO_PHONE_NUMBER,
              to: target
            });
          } catch (smsErr) {
            useSimulation = true;
          }
        }
      } else {
        if (!isBrevoConfigured) {
          useSimulation = true;
        } else {
          try {
            const client = getBrevoClient();
            await client.transactionalEmails.sendTransacEmail({
              subject: "Code de vérification - CourseExpress",
              htmlContent: `<html><body><h1>Code de vérification</h1><p>Votre code est : <strong>${code}</strong>. Il est valide 5 minutes.</p></body></html>`,
              sender: { name: "CourseExpress", email: process.env.EMAIL_FROM || "no-reply@courseexpress.bj" },
              to: [{ email: target }]
            });
          } catch (emailErr) {
            useSimulation = true;
          }
        }
      }

      if (useSimulation) {
        return res.json({
          success: true,
          message: `Code généré (Simulation active) : ${code}`,
          simulated: true,
          code
        });
      }

      res.json({ success: true, message: "Code envoyé !" });
    } catch (err) {
      res.status(400).json({ error: "Données invalides ou erreur serveur." });
    }
  });

  /**
   * POST /api/auth/verify-code
   * Vérifie le code fourni
   */
  app.post("/api/auth/verify-code", async (req, res) => {
    try {
      const { contact, code } = VerifyCodeSchema.parse(req.body);
      let target = contact;
      if (!contact.includes("@")) {
        target = contact.replace(/[^\d+]/g, "");
      }

      const q = query(
        collection(db, "otps"), 
        where("contact", "==", target),
        where("code", "==", code)
      );
      
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        return res.status(400).json({ error: "Code invalide." });
      }

      const otpDoc = querySnapshot.docs[0];
      const otpData = otpDoc.data();
      const now = Timestamp.now();

      // Vérifier expiration
      if (otpData.expiresAt.toMillis() < now.toMillis()) {
        await deleteDoc(otpDoc.ref);
        return res.status(400).json({ error: "Code expiré." });
      }

      // Sécurité : Trop de tentatives (si le code était mauvais, mais ici on a trouvé le match)
      // On peut ajouter une logique de "attempts" lors d'un non-match si nécessaire.

      // Succès : Supprimer l'OTP consommé
      await deleteDoc(otpDoc.ref);

      res.json({ success: true, message: "Vérification réussie !" });
    } catch (err) {
      res.status(400).json({ error: "Données invalides." });
    }
  });

  // --- MIDDLEWARE VITE ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => res.sendFile(path.join(distPath, "index.html")));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Serveur multi-canal actif sur http://localhost:${PORT}`);
  });
}

startServer();
