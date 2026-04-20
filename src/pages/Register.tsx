import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  signInWithPhoneNumber, 
  RecaptchaVerifier,
  ConfirmationResult
} from 'firebase/auth';
import { serverTimestamp, collection, addDoc, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { Truck, User, Mail, Phone, Lock, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { motion } from 'motion/react';
import PhoneInput, { isValidPhoneNumber } from 'react-phone-number-input';
import 'react-phone-number-input/style.css';

export default function Register() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'email' | 'phone'>('email');
  const [role, setRole] = useState<'client' | 'driver'>('client');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState<string | undefined>('+22901');
  const [nom, setNom] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  useEffect(() => {
    // Hidden recaptcha for phone auth
    if (mode === 'phone' && !window.recaptchaVerifier) {
      window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
        'size': 'invisible',
        'callback': () => {
          // reCAPTCHA solved
        }
      });
    }
  }, [mode]);

  const handleRegisterInput = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (password.length < 6) {
      setError("Le mot de passe doit contenir au moins 6 caractères.");
      setLoading(false);
      return;
    }

    if (mode === 'phone') {
      if (!phoneNumber || !isValidPhoneNumber(phoneNumber)) {
        setError("Format de numéro invalide.");
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
    }

    try {
      // 1. Check if user already exists in Firestore users or auth
      // (Auth check usually happens during signIn/createUser call, but we check Firestore first)
      const usersRef = collection(db, 'users');
      const normalizedPhone = mode === 'phone' ? phoneNumber?.replace(/\s/g, '') : null;
      const q = query(usersRef, where(mode === 'email' ? 'email' : 'phone', '==', mode === 'email' ? email : normalizedPhone));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        setError(`Cet ${mode === 'email' ? 'email' : 'numéro'} est déjà utilisé.`);
        setLoading(false);
        return;
      }

      if (mode === 'email') {
        // Envoi du code par Email (Simulé avec Firestore + Alert pour la démo)
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60000); // 10 mins

        const pendingRef = await addDoc(collection(db, 'pending_verifications'), {
          email,
          code,
          expiresAt,
          userData: { nom, role, password },
          createdAt: serverTimestamp()
        });

        console.log(`[DEMO] Code de vérification envoyé à ${email}: ${code}`);
        alert(`[DEMO] Pour l'email ${email}, votre code est : ${code}`);
        
        navigate('/verify', { state: { verificationId: pendingRef.id, email, mode: 'email' } });
      } else {
        // Phone Auth with Firebase
        const appVerifier = window.recaptchaVerifier;
        const result = await signInWithPhoneNumber(auth, phoneNumber!, appVerifier);
        
        const expiresAt = new Date(Date.now() + 10 * 60000);
        const pendingRef = await addDoc(collection(db, 'pending_verifications'), {
          phone: phoneNumber?.replace(/\s/g, ''),
          expiresAt,
          userData: { nom, role, password },
          createdAt: serverTimestamp()
        });

        window.confirmationResult = result;
        
        navigate('/verify', { state: { verificationId: pendingRef.id, phone: phoneNumber, mode: 'phone' } });
      }
    } catch (err: any) {
      console.error('Registration Error:', err);
      setError(err.message || "Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
      <div id="recaptcha-container"></div>
      
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md bg-white rounded-[48px] shadow-2xl shadow-slate-200/30 p-10 border border-slate-100"
      >
        <div className="flex flex-col items-center gap-6 mb-8">
          <div className="bg-benin-green p-5 rounded-3xl shadow-xl shadow-benin-green/20">
            <Truck className="text-white w-10 h-10" />
          </div>
          <div className="space-y-2 text-center">
            <h1 className="text-4xl font-black text-slate-900 tracking-tighter">Inscription</h1>
            <p className="text-slate-500 font-medium text-sm">CourseExpress : Livraisons rapides.</p>
          </div>
        </div>

        {/* Selection Email / Phone */}
        <div className="flex gap-2 p-2 bg-slate-50 rounded-[24px] mb-8 border border-slate-100">
          <button
            onClick={() => setMode('email')}
            className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-[18px] text-xs font-black uppercase tracking-widest transition-all ${
              mode === 'email' ? 'bg-white text-benin-green shadow-lg shadow-slate-200/50' : 'text-slate-400'
            }`}
          >
            <Mail className="w-4 h-4" />
            Email
          </button>
          <button
            onClick={() => setMode('phone')}
            className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-[18px] text-xs font-black uppercase tracking-widest transition-all ${
              mode === 'phone' ? 'bg-white text-benin-green shadow-lg shadow-slate-200/50' : 'text-slate-400'
            }`}
          >
            <Phone className="w-4 h-4" />
            Téléphone
          </button>
        </div>

        <form onSubmit={handleRegisterInput} className="space-y-5">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Je souhaite :</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="radio" 
                  name="role" 
                  checked={role === 'client'} 
                  onChange={() => setRole('client')}
                  className="accent-benin-green"
                />
                <span className={`text-xs font-bold ${role === 'client' ? 'text-slate-900' : 'text-slate-400'}`}>Commander</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="radio" 
                  name="role" 
                  checked={role === 'driver'} 
                  onChange={() => setRole('driver')}
                  className="accent-benin-green"
                />
                <span className={`text-xs font-bold ${role === 'driver' ? 'text-slate-900' : 'text-slate-400'}`}>Livrer</span>
              </label>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nom complet</label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
              <input
                type="text"
                required
                placeholder="Ex Nom Prénom"
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                className="w-full pl-11 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm focus:ring-2 focus:ring-benin-green outline-none transition-all"
              />
            </div>
          </div>

          {mode === 'email' ? (
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Adresse Email</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                <input
                  type="email"
                  required
                  placeholder="votre@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-11 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm focus:ring-2 focus:ring-benin-green outline-none transition-all"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Numéro de téléphone (Bénin)</label>
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

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Mot de passe</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
              <input
                type={showPassword ? "text" : "password"}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-11 pr-12 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm focus:ring-2 focus:ring-benin-green outline-none transition-all"
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
                S'inscrire
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </form>

        <div className="mt-8 text-center border-t border-slate-50 pt-8">
          <p className="text-xs font-medium text-slate-400">
            Déjà un compte ?{' '}
            <Link to="/login" className="text-benin-green font-black uppercase tracking-widest hover:underline ml-1">
              Se connecter
            </Link>
          </p>
        </div>
      </motion.div>

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

// Add types to window
declare global {
  interface Window {
    recaptchaVerifier: any;
    confirmationResult: any;
  }
}
