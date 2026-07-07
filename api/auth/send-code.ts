import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import twilio from 'twilio';
import { BrevoClient } from '@getbrevo/brevo';
import { db } from '../../src/firebase.js';
import { collection, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore';

const SendCodeSchema = z.object({
  contact: z.string().min(5),
  mode: z.enum(['email', 'phone']),
});

let twilioClient: any = null;
const getTwilioClient = () => {
  if (!twilioClient) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token) {
      throw new Error('TWILIO_ACCOUNT_SID ou TWILIO_AUTH_TOKEN manquant');
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
      throw new Error('BREVO_API_KEY manquant');
    }
    brevoClient = new BrevoClient({ apiKey });
  }
  return brevoClient;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée.' });
  }

  try {
    const { contact, mode } = SendCodeSchema.parse(req.body);

    // 1. Générer code 6 chiffres
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60000); // 5 minutes

    // 2. Normalisation contact (Bénin +229)
    let target = contact;
    if (mode === 'phone') {
      target = contact.replace(/[^\d+]/g, '');
    }

    // 3. Stocker en DB (Firestore) d'abord pour garantir que la vérification fonctionne
    await addDoc(collection(db, 'otps'), {
      contact: target,
      code,
      expiresAt: Timestamp.fromDate(expiresAt),
      attempts: 0,
      createdAt: serverTimestamp(),
    });

    // 4. Tentative d'envoi selon le mode ou simulation directe si les clés sont absentes ou invalides
    let useSimulation = false;

    const isTwilioConfigured = !!(
      process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_ACCOUNT_SID.length > 10 &&
      !process.env.TWILIO_ACCOUNT_SID.includes('YOUR_')
    );

    const isBrevoConfigured = !!(
      process.env.BREVO_API_KEY &&
      process.env.BREVO_API_KEY.length > 20 &&
      !process.env.BREVO_API_KEY.includes('YOUR_')
    );

    if (mode === 'phone') {
      if (!isTwilioConfigured) {
        useSimulation = true;
      } else {
        try {
          const client = getTwilioClient();
          await client.messages.create({
            body: `Votre code de vérification CourseExpress est : ${code}. Il expire dans 5 minutes.`,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: target,
          });
        } catch (smsErr) {
          console.error('Erreur envoi Twilio:', smsErr);
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
            subject: 'Code de vérification - CourseExpress',
            htmlContent: `<html><body><h1>Code de vérification</h1><p>Votre code est : <strong>${code}</strong>. Il est valide 5 minutes.</p></body></html>`,
            sender: { name: 'CourseExpress', email: process.env.EMAIL_FROM || 'no-reply@courseexpress.bj' },
            to: [{ email: target }],
          });
        } catch (emailErr: any) {
          console.error('Erreur envoi Brevo:', emailErr?.body || emailErr?.message || emailErr);
          useSimulation = true;
        }
      }
    }

    if (useSimulation) {
      return res.status(200).json({
        success: true,
        message: `Code généré (Simulation active) : ${code}`,
        simulated: true,
        code,
      });
    }

    return res.status(200).json({ success: true, message: 'Code envoyé !' });
  } catch (err) {
    console.error('Erreur send-code:', err);
    return res.status(400).json({ error: 'Données invalides ou erreur serveur.' });
  }
}
