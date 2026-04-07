import React, { useState } from 'react';
import { signInWithPopup, GoogleAuthProvider, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { Truck, LogIn, Phone, Mail, Lock, User, Camera, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function Login() {
  const [role, setRole] = useState<'client' | 'driver'>('client');
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [photoURL, setPhotoURL] = useState('');
  const [idCardPhotoUrl, setIdCardPhotoUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError('');
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (!userDoc.exists()) {
        const finalRole = user.email?.toLowerCase() === 'axo.hossou@epitech.eu' ? 'admin' : role;
        const finalStatus = finalRole === 'admin' ? 'active' : (finalRole === 'driver' ? 'pending_validation' : 'active');
        
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
          createdAt: serverTimestamp()
        });
      }
    } catch (error: any) {
      console.error('Google Login Error:', error);
      let message = "Une erreur est survenue lors de la connexion avec Google.";
      if (error.code === 'auth/popup-closed-by-user') {
        message = "La fenêtre de connexion a été fermée.";
      } else if (error.code === 'auth/network-request-failed') {
        message = "Problème de connexion internet.";
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (isRegister) {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        const user = result.user;
        const finalRole = email.toLowerCase() === 'axo.hossou@epitech.eu' ? 'admin' : role;
        const finalStatus = finalRole === 'admin' ? 'active' : (finalRole === 'driver' ? 'pending_validation' : 'active');
        
        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          email: user.email,
          displayName: `${firstName} ${lastName}`.trim() || user.email?.split('@')[0],
          nom: lastName,
          prenom: firstName,
          phone,
          address,
          photoURL: photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`,
          idCardPhotoUrl,
          role: finalRole,
          status: finalStatus,
          noteMoyenne: 5,
          createdAt: serverTimestamp()
        });
      } else {
        const result = await signInWithEmailAndPassword(auth, email, password);
        const user = result.user;
        
        // Step 4: Check if user document exists, if not create it
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (!userDoc.exists()) {
          const finalRole = user.email?.toLowerCase() === 'axo.hossou@epitech.eu' ? 'admin' : 'client';
          const finalStatus = finalRole === 'admin' ? 'active' : 'active';
          
          await setDoc(doc(db, 'users', user.uid), {
            uid: user.uid,
            email: user.email,
            displayName: user.email?.split('@')[0],
            role: finalRole,
            status: finalStatus,
            noteMoyenne: 5,
            createdAt: serverTimestamp()
          });
        }
      }
    } catch (error: any) {
      console.error('Auth Error:', error);
      let message = "Une erreur est survenue.";
      
      switch (error.code) {
        case 'auth/invalid-email':
          message = "Email invalide";
          break;
        case 'auth/user-not-found':
          message = "Aucun utilisateur avec cet email";
          break;
        case 'auth/wrong-password':
          message = "Mot de passe incorrect";
          break;
        case 'auth/invalid-credential':
          message = "Identifiants incorrects (email ou mot de passe)";
          break;
        case 'auth/too-many-requests':
          message = "Trop de tentatives, réessayez plus tard";
          break;
        case 'auth/network-request-failed':
          message = "Vérifiez votre connexion internet";
          break;
        case 'auth/email-already-in-use':
          message = "Cet email est déjà utilisé par un autre compte.";
          break;
        case 'auth/weak-password':
          message = "Le mot de passe est trop court (min 6 caractères).";
          break;
        default:
          message = error.message;
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans">
      {/* Left Side: Image */}
      <div className="hidden lg:block w-1/2 relative overflow-hidden">
        <img 
          src="https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&q=80&w=1200" 
          alt="Marché Bénin" 
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-benin-green/40 to-slate-900/60 flex flex-col justify-end p-20 text-white">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <h2 className="text-6xl font-black tracking-tighter leading-none">
              Livrez plus, <br/> gagnez plus.
            </h2>
            <p className="text-xl font-medium text-white/80 max-w-md">
              Rejoignez la plus grande flotte de livraison à Cotonou et profitez d'une flexibilité totale.
            </p>
          </motion.div>
        </div>
      </div>

      {/* Right Side: Form */}
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
            <p className="text-slate-500 font-medium text-sm">La livraison de courses à Cotonou.</p>
          </div>
        </div>

        <div className="flex gap-2 p-2 bg-slate-50 rounded-[24px] mb-10 border border-slate-100">
          <button
            onClick={() => setRole('client')}
            className={`flex-1 py-3.5 rounded-[18px] text-xs font-black uppercase tracking-widest transition-all ${
              role === 'client' ? 'bg-white text-benin-green shadow-lg shadow-slate-200/50' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            Commander
          </button>
          <button
            onClick={() => setRole('driver')}
            className={`flex-1 py-3.5 rounded-[18px] text-xs font-black uppercase tracking-widest transition-all ${
              role === 'driver' ? 'bg-white text-benin-green shadow-lg shadow-slate-200/50' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            Livrer
          </button>
        </div>

        <form onSubmit={handleEmailAuth} className="space-y-6">
          <AnimatePresence mode="wait">
            {isRegister && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="grid grid-cols-2 gap-4 overflow-hidden"
              >
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Prénom</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      required
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="w-full pl-11 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm focus:ring-2 focus:ring-benin-green outline-none transition-all font-medium"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nom</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      required
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="w-full pl-11 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm focus:ring-2 focus:ring-benin-green outline-none transition-all font-medium"
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

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
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-11 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm focus:ring-2 focus:ring-benin-green outline-none transition-all font-medium"
              />
            </div>
          </div>

          {isRegister && role === 'driver' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="space-y-4 overflow-hidden"
            >
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Téléphone</label>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+229 ..."
                    className="w-full pl-11 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm focus:ring-2 focus:ring-benin-green outline-none transition-all font-medium"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Adresse</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Quartier, Maison..."
                    className="w-full pl-11 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm focus:ring-2 focus:ring-benin-green outline-none transition-all font-medium"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Photo de la pièce d'identité (URL)</label>
                <div className="relative">
                  <Camera className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="url"
                    required
                    value={idCardPhotoUrl}
                    onChange={(e) => setIdCardPhotoUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full pl-11 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm focus:ring-2 focus:ring-benin-green outline-none transition-all font-medium"
                  />
                </div>
              </div>
            </motion.div>
          )}

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
                {isRegister ? "Créer mon compte" : "Se connecter"}
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
          <button
            onClick={() => setIsRegister(!isRegister)}
            className="text-xs font-black text-benin-green hover:text-benin-green/80 uppercase tracking-widest transition-all"
          >
            {isRegister ? "Déjà un compte ? Se connecter" : "Pas encore de compte ? S'inscrire"}
          </button>
        </div>
      </motion.div>
    </div>
  </div>
);
}
