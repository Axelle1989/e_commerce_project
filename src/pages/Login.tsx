import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signInWithEmailAndPassword,
  sendPasswordResetEmail 
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { Truck, Mail, Lock, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { motion } from 'motion/react';
import { BENIN_IMAGES } from '../constants/images';
import ImageWithFallback from '../components/ImageWithFallback';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError('');
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // Check if user document exists, if not create it
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (!userDoc.exists()) {
        const finalRole = user.email?.toLowerCase() === 'axo.hossou@epitech.eu' ? 'admin' : 'client';
        const finalStatus = finalRole === 'admin' ? 'active' : 'active';
        
        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName || user.email?.split('@')[0],
          nom: user.displayName?.split(' ').slice(-1)[0] || '',
          prenom: user.displayName?.split(' ').slice(0, -1).join(' ') || '',
          photoURL: user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`,
          role: finalRole,
          status: finalStatus,
          noteMoyenne: 5,
          createdAt: serverTimestamp(),
          emailVerified: true
        });
      }
    } catch (error: any) {
      console.error('Google Login Error:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError("Veuillez saisir votre adresse email.");
      return;
    }
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      alert(`Un lien de réinitialisation a été envoyé à ${email}`);
    } catch (error: any) {
      console.error('Password reset error:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    
    setLoading(true);
    setError('');
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      const user = result.user;
      
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (!userDoc.exists()) {
        const isDefaultAdmin = user.email?.toLowerCase() === 'axo.hossou@epitech.eu';
        const finalRole = isDefaultAdmin ? 'admin' : 'client';
        
        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          email: user.email,
          displayName: user.email?.split('@')[0],
          role: finalRole,
          status: 'active',
          emailVerified: true,
          noteMoyenne: 5,
          createdAt: serverTimestamp()
        });
      } else {
        const userData = userDoc.data();
        if (userData.status === 'suspended' || userData.active === false) {
          setError("Votre compte a été suspendu ou supprimé par l'administrateur.");
          setLoading(false);
          await auth.signOut();
          return;
        }
        if (userData.status === 'pending_email_verification') {
          navigate('/verify', { state: { verificationId: userData.uid, email: userData.email, mode: 'email' } });
          setLoading(false);
          return;
        }
      }
    } catch (error: any) {
      console.error('Auth Error:', error);
      let message = "Une erreur est survenue.";
      switch (error.code) {
        case 'auth/invalid-email': message = "Email invalide"; break;
        case 'auth/user-not-found': message = "Aucun utilisateur avec cet email"; break;
        case 'auth/wrong-password': message = "Mot de passe incorrect"; break;
        case 'auth/invalid-credential': message = "Identifiants incorrects."; break;
        default: message = error.message;
      }
      setError(message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans">
      <div className="hidden lg:flex w-1/2 bg-benin-green/5 flex-col justify-center p-20 border-r border-slate-100 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <ImageWithFallback 
            src={BENIN_IMAGES.market.dantokpa} 
            alt="Background" 
            className="w-full h-full object-cover"
          />
        </div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-8"
        >
          <div className="w-20 h-20 bg-benin-green rounded-3xl flex items-center justify-center shadow-2xl shadow-benin-green/20">
            <Truck className="text-white w-10 h-10" />
          </div>
          <div className="space-y-4">
            <h2 className="text-6xl font-black tracking-tighter leading-none text-slate-900">
              Livrez plus, <br/> <span className="text-benin-green">gagnez plus.</span>
            </h2>
          </div>
        </motion.div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 lg:p-20">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md bg-white rounded-[48px] shadow-2xl shadow-slate-200/30 p-10 border border-slate-100"
        >
          <div className="flex flex-col items-center gap-6 mb-10">
            <div className="bg-benin-green p-5 rounded-3xl shadow-xl shadow-benin-green/20">
              <Truck className="text-white w-10 h-10" />
            </div>
            <div className="space-y-2 text-center">
              <h1 className="text-4xl font-black text-slate-900 tracking-tighter">CourseExpress</h1>
              <p className="text-slate-500 font-medium text-sm">Connexion à votre compte.</p>
            </div>
          </div>

          <form onSubmit={handleEmailAuth} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Email</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-11 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm focus:ring-2 focus:ring-benin-green outline-none transition-all font-medium"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Mot de passe</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-11 pr-12 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm focus:ring-2 focus:ring-benin-green outline-none transition-all font-medium"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleForgotPassword}
                className="text-[10px] font-black text-slate-400 hover:text-benin-green uppercase tracking-widest transition-all"
              >
                Mot de passe oublié ?
              </button>
            </div>

            {error && <p className="text-xs font-black text-benin-red text-center uppercase tracking-widest">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-4 bg-slate-900 text-white py-5 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-black transition-all active:scale-95 shadow-xl shadow-slate-900/20 disabled:opacity-50"
            >
              {loading ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              ) : (
                <>
                  Se connecter
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>

          <div className="relative my-10">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-100"></div>
            </div>
            <div className="relative flex justify-center text-[10px] uppercase tracking-[0.2em] font-black text-slate-300">
              <span className="bg-white px-6">Ou continuer avec</span>
            </div>
          </div>

          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-4 bg-white border border-slate-100 py-4 rounded-2xl font-black text-xs uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition-all active:scale-95 disabled:opacity-50 shadow-sm"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google" />
            Google
          </button>

          <div className="mt-10 text-center">
            <p className="text-xs font-medium text-slate-400">
              Pas encore de compte ?{' '}
              <Link to="/register" className="text-benin-green font-black uppercase tracking-widest hover:underline">
                S'inscrire
              </Link>
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
