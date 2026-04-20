import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithPhoneNumber,
  RecaptchaVerifier
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { Truck, Mail, Lock, ArrowRight, Eye, EyeOff, Phone } from 'lucide-react';
import { motion } from 'motion/react';
import { BENIN_IMAGES } from '../constants/images';
import ImageWithFallback from '../components/ImageWithFallback';
import PhoneInput, { isValidPhoneNumber } from 'react-phone-number-input';
import 'react-phone-number-input/style.css';

export default function Login() {
  const [loginMode, setLoginMode] = useState<'email' | 'phone'>('email');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState<string | undefined>('+22901');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (loginMode === 'phone' && !window.recaptchaVerifier) {
      window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container-login', {
        'size': 'invisible',
        'callback': () => {
          // reCAPTCHA solved
        }
      });
    }
  }, [loginMode]);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError('');
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (!userDoc.exists()) {
        const finalRole = user.email?.toLowerCase() === 'axo.hossou@epitech.eu' ? 'admin' : 'client';
        
        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName || user.email?.split('@')[0],
          nom: user.displayName?.split(' ').slice(-1)[0] || '',
          prenom: user.displayName?.split(' ').slice(0, -1).join(' ') || '',
          photoURL: user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`,
          role: finalRole,
          status: 'active',
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

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    
    setLoading(true);
    setError('');

    try {
      if (loginMode === 'email') {
        const result = await signInWithEmailAndPassword(auth, email, password);
        const user = result.user;
        
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          if (userData.status === 'suspended' || userData.active === false) {
            setError("Compte suspendu ou supprimé.");
            setLoading(false);
            await auth.signOut();
            return;
          }
        }
      } else {
        // Phone Auth
        if (!phoneNumber || !isValidPhoneNumber(phoneNumber)) {
          setError("Numéro de téléphone invalide.");
          setLoading(false);
          return;
        }

        const digits = phoneNumber.replace(/\D/g, '');
        if (digits.startsWith('229')) {
          if (digits.length !== 13 || !digits.startsWith('22901')) {
             setError("Veuillez utiliser le nouveau format béninois : +229 01 XX XX XX XX");
             setLoading(false);
             return;
          }
        }

        const appVerifier = window.recaptchaVerifier;
        const result = await signInWithPhoneNumber(auth, phoneNumber, appVerifier);
        window.confirmationResult = result;
        
        navigate('/verify', { state: { phone: phoneNumber, mode: 'phone' } });
      }
    } catch (error: any) {
      console.error('Auth Error:', error);
      let message = "Une erreur est survenue.";
      switch (error.code) {
        case 'auth/invalid-email': message = "Email invalide"; break;
        case 'auth/user-not-found': message = "Aucun utilisateur trouvé."; break;
        case 'auth/wrong-password': message = "Mot de passe incorrect."; break;
        case 'auth/invalid-credential': message = "Identifiants incorrects."; break;
        default: message = error.message;
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans">
      <div id="recaptcha-container-login"></div>
      
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
          <div className="space-y-4 text-slate-900">
            <h2 className="text-6xl font-black tracking-tighter leading-none">
              Livrez plus, <br/> <span className="text-benin-green">gagnez plus.</span>
            </h2>
            <p className="text-xl font-medium text-slate-500">CourseExpress : La référence béninoise.</p>
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
              <p className="text-slate-500 font-medium text-sm">Connexion rapide et sécurisée.</p>
            </div>
          </div>

          {/* Mode Switcher */}
          <div className="flex gap-2 p-2 bg-slate-50 rounded-[24px] mb-8 border border-slate-100">
            <button
              onClick={() => setLoginMode('email')}
              className={`flex-1 py-3 rounded-[18px] text-[10px] font-black uppercase tracking-widest transition-all ${
                loginMode === 'email' ? 'bg-white text-benin-green shadow-lg' : 'text-slate-400'
              }`}
            >
              Email
            </button>
            <button
              onClick={() => setLoginMode('phone')}
              className={`flex-1 py-3 rounded-[18px] text-[10px] font-black uppercase tracking-widest transition-all ${
                loginMode === 'phone' ? 'bg-white text-benin-green shadow-lg' : 'text-slate-400'
              }`}
            >
              Téléphone
            </button>
          </div>

          <form onSubmit={handleAuth} className="space-y-6">
            {loginMode === 'email' ? (
              <>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
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
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
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
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 z-10"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Numéro de téléphone</label>
                <div className="phone-input-container">
                  <PhoneInput
                    international
                    defaultCountry="BJ"
                    value={phoneNumber}
                    onChange={setPhoneNumber}
                    className="w-full pl-4 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm focus-within:ring-2 focus-within:ring-benin-green transition-all"
                    placeholder="+229 01 XX XX XX XX"
                  />
                </div>
              </div>
            )}

            {loginMode === 'email' && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="text-[10px] font-black text-slate-400 hover:text-benin-green uppercase tracking-widest transition-all"
                >
                  Mot de passe oublié ?
                </button>
              </div>
            )}

            {error && <p className="text-xs font-black text-benin-red text-center uppercase tracking-widest leading-relaxed">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-4 bg-slate-900 text-white py-5 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-black transition-all active:scale-95 shadow-xl shadow-slate-900/20 disabled:opacity-50"
            >
              {loading ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              ) : (
                <>
                  {loginMode === 'email' ? "Se connecter" : "Recevoir le code SMS"}
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>

          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-4 bg-white border border-slate-100 py-4 rounded-2xl font-black text-xs uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition-all active:scale-95 disabled:opacity-50 shadow-sm mt-8"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google" />
            Continuer avec Google
          </button>

          <div className="mt-10 text-center pt-8 border-t border-slate-50">
            <p className="text-xs font-medium text-slate-400">
              Pas encore de compte ?{' '}
              <Link to="/register" className="text-benin-green font-black uppercase tracking-widest hover:underline ml-1">
                S'inscrire
              </Link>
            </p>
          </div>
        </motion.div>
      </div>

      <style>{`
        .phone-input-container .PhoneInputInput {
          background: transparent;
          border: none;
          outline: none;
          width: 100%;
          font-weight: 500;
          color: #0f172a;
          margin-left: 10px;
        }
        .phone-input-container .PhoneInputCountry {
          margin-right: 10px;
        }
      `}</style>
    </div>
  );
}
