import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  createUserWithEmailAndPassword, 
  updateProfile,
  signInWithPhoneNumber
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  deleteDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { CheckCircle2, ArrowRight, ShieldCheck, Loader2, RefreshCw } from 'lucide-react';
import { motion } from 'motion/react';

export default function VerifyCode() {
  const location = useLocation();
  const navigate = useNavigate();
  const { verificationId, email, phone, mode } = location.state || {};

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [resendTimer, setResendTimer] = useState(60);

  useEffect(() => {
    if (!verificationId && mode !== 'phone') {
      navigate('/register');
    }
  }, [verificationId, mode, navigate]);

  useEffect(() => {
    let timer: any;
    if (resendTimer > 0) {
      timer = setInterval(() => setResendTimer(prev => prev - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [resendTimer]);

  const handleResend = () => {
    if (resendTimer > 0) return;
    setResendTimer(60);
    alert("Un nouveau code a été envoyé !");
    // In a real app, you would trigger the Firebase or EmailJS send logic here again.
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (mode === 'email') {
        const pendingRef = doc(db, 'pending_verifications', verificationId);
        const pendingSnap = await getDoc(pendingRef);

        if (!pendingSnap.exists()) {
          setError("Session de vérification expirée.");
          setLoading(false);
          return;
        }

        const data = pendingSnap.data();
        if (code !== data.code) {
          setError("Code de vérification incorrect.");
          setLoading(false);
          return;
        }

        const { nom, role, password } = data.userData;
        const userCred = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCred.user;

        await updateProfile(user, { displayName: nom });

        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          email: user.email,
          displayName: nom,
          role: role,
          status: role === 'driver' ? 'pending_validation' : 'active',
          emailVerified: true,
          phoneVerified: false,
          createdAt: serverTimestamp()
        });

        await deleteDoc(pendingRef);
        setSuccess(true);
        setTimeout(() => navigate('/'), 2000);
      } else {
        // Phone Verification
        if (!window.confirmationResult) {
          setError("Session expirée. Veuillez réessayer de vous connecter.");
          setLoading(false);
          return;
        }

        const result = await window.confirmationResult.confirm(code);
        const user = result.user;

        // Check if this is a registration or just a login
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        
        if (!userDoc.exists() && verificationId) {
          // Registration flow
          const pendingRef = doc(db, 'pending_verifications', verificationId);
          const pendingSnap = await getDoc(pendingRef);
          
          if (pendingSnap.exists()) {
            const data = pendingSnap.data();
            const { nom, role } = data.userData;

            await setDoc(doc(db, 'users', user.uid), {
              uid: user.uid,
              phone: user.phoneNumber,
              displayName: nom,
              role: role,
              status: role === 'driver' ? 'pending_validation' : 'active',
              emailVerified: false,
              phoneVerified: true,
              createdAt: serverTimestamp()
            });

            await deleteDoc(pendingRef);
          }
        }

        setSuccess(true);
        setTimeout(() => navigate('/'), 2000);
      }
    } catch (err: any) {
      console.error('Verification error:', err);
      let message = "Une erreur est survenue lors de la vérification.";
      
      switch (err.code) {
        case 'auth/invalid-verification-code':
          message = "Le code saisi est incorrect.";
          break;
        case 'auth/operation-not-allowed':
          message = "La connexion par Email/Mot de passe n'est pas activée dans la console Firebase. Veuillez contacter l'administrateur.";
          break;
        case 'auth/email-already-in-use':
          message = "Cette adresse email est déjà utilisée par un autre compte.";
          break;
        case 'auth/weak-password':
          message = "Le mot de passe est trop faible.";
          break;
        default:
          message = err.message || message;
      }
      
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-benin-green flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-[48px] p-12 text-center shadow-2xl max-w-sm w-full space-y-6"
        >
          <div className="flex justify-center">
            <div className="bg-benin-green/10 p-6 rounded-full animate-bounce">
              <CheckCircle2 className="w-16 h-16 text-benin-green" />
            </div>
          </div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">Vérifié !</h2>
          <p className="text-slate-500 font-medium">Votre accès est maintenant activé. Redirection...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white rounded-[48px] shadow-2xl shadow-slate-200/30 p-10 border border-slate-100"
      >
        <div className="flex flex-col items-center gap-6 mb-10">
          <div className="bg-benin-yellow p-5 rounded-3xl shadow-xl shadow-benin-yellow/20">
            <ShieldCheck className="text-white w-10 h-10" />
          </div>
          <div className="space-y-2 text-center">
            <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">Vérification</h1>
            <p className="text-slate-500 font-medium text-sm leading-relaxed">
              Nous avons envoyé un code de sécurité à <br />
              <span className="text-slate-900 font-bold">{email || phone}</span>
            </p>
          </div>
        </div>

        <form onSubmit={handleVerify} className="space-y-8">
          <div className="space-y-4">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center block">Saisissez les 6 chiffres</label>
            <input
              type="text"
              maxLength={6}
              required
              placeholder="••••••"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="w-full text-center text-4xl font-black tracking-[0.4em] py-6 bg-slate-50 border border-slate-100 rounded-3xl focus:ring-4 focus:ring-benin-yellow/20 outline-none transition-all placeholder:text-slate-200"
            />
          </div>

          {error && <p className="text-xs font-black text-benin-red text-center uppercase tracking-widest leading-relaxed">{error}</p>}

          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="w-full flex items-center justify-center gap-4 bg-slate-900 text-white py-5 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-black transition-all active:scale-95 shadow-xl shadow-slate-900/20 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin text-white" />
            ) : (
              <>
                Valider le code
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </form>

        <div className="mt-10 flex flex-col items-center gap-6">
          <button
            onClick={handleResend}
            disabled={resendTimer > 0}
            className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all disabled:text-slate-300 text-benin-green hover:text-benin-green/80"
          >
            <RefreshCw className={`w-3 h-3 ${resendTimer > 0 ? '' : 'animate-spin'}`} />
            {resendTimer > 0 ? `Renvoyer le code (${resendTimer}s)` : "Renvoyer le code maintenant"}
          </button>

          <button
            onClick={() => navigate(-1)}
            className="text-[10px] font-black text-slate-400 hover:text-slate-600 uppercase tracking-widest transition-all"
          >
            Modifier les informations
          </button>
        </div>
      </motion.div>
    </div>
  );
}
