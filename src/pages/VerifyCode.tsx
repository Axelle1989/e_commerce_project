import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  updateProfile,
  onAuthStateChanged
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  deleteDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { Mail, CheckCircle2, ArrowRight, ShieldCheck, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';

export default function VerifyCode() {
  const location = useLocation();
  const navigate = useNavigate();
  const { verificationId, email, phone, mode } = location.state || {};

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!verificationId) {
      navigate('/register');
    }
  }, [verificationId, navigate]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (mode === 'email') {
        const pendingRef = doc(db, 'pending_verifications', verificationId);
        const pendingSnap = await getDoc(pendingRef);

        if (!pendingSnap.exists()) {
          setError("Session de vérification expirée ou invalide.");
          setLoading(false);
          return;
        }

        const data = pendingSnap.data();
        const now = new Date();
        if (data.expiresAt.toDate() < now) {
          setError("Le code a expiré. Veuillez recommencer.");
          setLoading(false);
          return;
        }

        if (code !== data.code) {
          setError("Code incorrect.");
          setLoading(false);
          return;
        }

        // Code OK - Create Account
        const { nom, role, password } = data.userData;
        const userCred = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCred.user;

        await updateProfile(user, { displayName: nom });

        // Save to users collection
        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          email: user.email,
          displayName: nom,
          nom: nom,
          role: role,
          status: role === 'driver' ? 'pending_validation' : 'active',
          emailVerified: true,
          phoneVerified: false,
          createdAt: serverTimestamp()
        });

        // Delete pending verification
        await deleteDoc(pendingRef);
        
        setSuccess(true);
        setTimeout(() => navigate('/'), 2000);
      } else {
        // Phone Verification
        if (!window.confirmationResult) {
          setError("Session de téléphone perdue. Veuillez recommencer.");
          setLoading(false);
          return;
        }

        const result = await window.confirmationResult.confirm(code);
        const user = result.user;

        // Fetch user data from pending
        const pendingRef = doc(db, 'pending_verifications', verificationId);
        const pendingSnap = await getDoc(pendingRef);
        
        if (pendingSnap.exists()) {
          const data = pendingSnap.data();
          const { nom, role, password } = data.userData;

          // If they provided a password, we can set it if they don't have one
          // Note: updatePassword only works for authenticated users
          if (password) {
             // In a real app, you might want to link an email later
          }

          // Create/Update profile
          await setDoc(doc(db, 'users', user.uid), {
            uid: user.uid,
            phone: user.phoneNumber,
            displayName: nom,
            nom: nom,
            role: role,
            status: role === 'driver' ? 'pending_validation' : 'active',
            emailVerified: false,
            phoneVerified: true,
            createdAt: serverTimestamp()
          }, { merge: true });

          await deleteDoc(pendingRef);
        }

        setSuccess(true);
        setTimeout(() => navigate('/'), 2000);
      }
    } catch (err: any) {
      console.error('Verification Error:', err);
      if (err.code === 'auth/invalid-verification-code') {
        setError("Code SMS invalide.");
      } else {
        setError(err.message || "Une erreur est survenue.");
      }
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-benin-green flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-[40px] p-12 text-center shadow-2xl space-y-6"
        >
          <div className="flex justify-center">
            <div className="bg-benin-green/10 p-6 rounded-full">
              <CheckCircle2 className="w-16 h-16 text-benin-green" />
            </div>
          </div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">Compte Vérifié !</h2>
          <p className="text-slate-500 font-medium">Bienvenue sur CourseExpress. Redirection en cours...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md bg-white rounded-[48px] shadow-2xl shadow-slate-200/30 p-10 border border-slate-100"
      >
        <div className="flex flex-col items-center gap-6 mb-10">
          <div className="bg-benin-yellow p-5 rounded-3xl shadow-xl shadow-benin-yellow/20">
            <ShieldCheck className="text-white w-10 h-10" />
          </div>
          <div className="space-y-2 text-center">
            <h1 className="text-3xl font-black text-slate-900 tracking-tighter">Vérification</h1>
            <p className="text-slate-500 font-medium text-sm">
              Saisissez le code envoyé à <br />
              <span className="text-slate-900 font-bold">{email || phone}</span>
            </p>
          </div>
        </div>

        <form onSubmit={handleVerify} className="space-y-8">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 text-center block">Code de validation (6 chiffres)</label>
            <input
              type="text"
              maxLength={6}
              required
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="w-full text-center text-4xl font-black tracking-[0.5em] py-6 bg-slate-50 border border-slate-100 rounded-3xl focus:ring-4 focus:ring-benin-yellow/20 outline-none transition-all"
            />
          </div>

          {error && <p className="text-xs font-black text-benin-red text-center uppercase tracking-widest">{error}</p>}

          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="w-full flex items-center justify-center gap-4 bg-slate-900 text-white py-5 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-black transition-all active:scale-95 shadow-xl shadow-slate-900/20 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                Vérifier et créer mon compte
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </form>

        <div className="mt-10 text-center">
          <button
            onClick={() => navigate('/register')}
            className="text-xs font-black text-slate-400 hover:text-slate-600 uppercase tracking-widest transition-all"
          >
            Retour / Modifier les infos
          </button>
        </div>
      </motion.div>
    </div>
  );
}
