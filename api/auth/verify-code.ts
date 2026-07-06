import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { db } from '../../src/firebase';
import { collection, query, where, getDocs, deleteDoc, Timestamp } from 'firebase/firestore';

const VerifyCodeSchema = z.object({
  contact: z.string(),
  code: z.string().length(6),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée.' });
  }

  try {
    const { contact, code } = VerifyCodeSchema.parse(req.body);
    let target = contact;
    if (!contact.includes('@')) {
      target = contact.replace(/[^\d+]/g, '');
    }

    const q = query(
      collection(db, 'otps'),
      where('contact', '==', target),
      where('code', '==', code)
    );

    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return res.status(400).json({ error: 'Code invalide.' });
    }

    const otpDoc = querySnapshot.docs[0];
    const otpData = otpDoc.data();
    const now = Timestamp.now();

    // Vérifier expiration
    if (otpData.expiresAt.toMillis() < now.toMillis()) {
      await deleteDoc(otpDoc.ref);
      return res.status(400).json({ error: 'Code expiré.' });
    }

    // Succès : Supprimer l'OTP consommé
    await deleteDoc(otpDoc.ref);

    return res.status(200).json({ success: true, message: 'Vérification réussie !' });
  } catch (err) {
    console.error('Erreur verify-code:', err);
    return res.status(400).json({ error: 'Données invalides.' });
  }
}
