import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const DeleteUserSchema = z.object({
  targetUid: z.string().min(1),
  adminUid: z.string().min(1),
  idToken: z.string().min(1),
});

let adminApp: App | null = null;

function getAdminApp(): App {
  if (adminApp) return adminApp;
  if (getApps().length > 0) {
    adminApp = getApps()[0];
    return adminApp;
  }

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_KEY manquant : impossible d'initialiser Firebase Admin."
    );
  }

  const serviceAccount = JSON.parse(raw);
  adminApp = initializeApp({
    credential: cert(serviceAccount),
  });
  return adminApp;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée.' });
  }

  try {
    const { targetUid, adminUid, idToken } = DeleteUserSchema.parse(req.body);

    const app = getAdminApp();
    const auth = getAuth(app);
    const db = getFirestore(app);

    // 1. Vérifier que le token correspond bien à l'admin qui fait la demande
    const decoded = await auth.verifyIdToken(idToken);
    if (decoded.uid !== adminUid) {
      return res.status(403).json({ error: 'Jeton invalide pour cet administrateur.' });
    }

    // 2. Vérifier que l'appelant a bien le rôle admin dans Firestore
    const adminDoc = await db.collection('users').doc(adminUid).get();
    if (!adminDoc.exists || adminDoc.data()?.role !== 'admin') {
      return res.status(403).json({ error: 'Action réservée aux administrateurs.' });
    }

    // 3. Empêcher un admin de se supprimer lui-même par erreur via cet écran
    if (targetUid === adminUid) {
      return res.status(400).json({ error: 'Impossible de supprimer votre propre compte ici.' });
    }

    // 4. Supprimer le compte d'authentification (email/mot de passe, connexion, etc.)
    try {
      await auth.deleteUser(targetUid);
    } catch (authErr: any) {
      // Si le compte Auth n'existe déjà plus, on continue quand même le nettoyage Firestore
      if (authErr?.code !== 'auth/user-not-found') {
        throw authErr;
      }
    }

    // 5. Supprimer le document Firestore associé
    await db.collection('users').doc(targetUid).delete();

    return res.status(200).json({ success: true, message: 'Compte supprimé définitivement.' });
  } catch (err: any) {
    console.error('Erreur delete-user:', err?.message || err);
    return res.status(400).json({ error: err?.message || 'Erreur lors de la suppression.' });
  }
}
