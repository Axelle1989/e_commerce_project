import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, onSnapshot, updateDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { UserProfile } from '../types';
import { Truck, ShieldCheck, CreditCard, ArrowRight, Loader2, AlertCircle, CheckCircle, Smartphone, Clock, CalendarCheck, XCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function DriverOnboarding() {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showRefusalConfirm, setShowRefusalConfirm] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!auth.currentUser) return;

    const unsubscribe = onSnapshot(doc(db, 'users', auth.currentUser.uid), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as UserProfile;
        setUserProfile(data);
        if (data.status === 'active') {
          navigate('/livreur');
        }
      } else {
        // If document is gone (deleted), force logout and redirect
        auth.signOut();
        navigate('/login');
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [navigate]);

  const handleAcceptInterview = async () => {
    if (!userProfile || !auth.currentUser) return;
    setActionLoading(true);
    try {
      await updateDoc(doc(db, 'users', auth.currentUser.uid), {
        'interviewInvitation.status': 'accepted',
        status: 'interview_scheduled'
      });

      // Notify admin
      await addDoc(collection(db, 'admin_logs'), {
        action: 'driver_accepted_interview',
        driverId: auth.currentUser.uid,
        driverEmail: auth.currentUser.email,
        createdAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error accepting interview:', error);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRefuseInterview = async () => {
    if (!userProfile || !auth.currentUser) return;
    setActionLoading(true);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const response = await fetch('/api/driver/refuse-interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: auth.currentUser.uid,
          idToken
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Erreur lors du refus');
      }

      // Success: backend deleted the user, onSnapshot will handle the redirect
      await auth.signOut();
      navigate('/login');
    } catch (error) {
      console.error('Error refusing interview:', error);
      setActionLoading(false);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin h-10 w-10 text-benin-green" /></div>;

  return (
    <div className="max-w-md mx-auto py-12 px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-[48px] border border-slate-100 shadow-2xl shadow-slate-200/20 p-10 space-y-10"
      >
        <div className="flex flex-col items-center text-center gap-6">
          <div className="bg-benin-green p-5 rounded-3xl shadow-xl shadow-benin-green/20">
            <Truck className="text-white w-10 h-10" />
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-black text-slate-900 tracking-tighter">Devenir Livreur</h1>
            <p className="text-slate-500 font-medium text-sm">Rejoignez la flotte CourseExpress à Cotonou.</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className={`p-6 rounded-3xl border flex items-center gap-5 transition-all ${
            userProfile?.status === 'active' ? 'bg-benin-green/5 border-benin-green/20' : 
            (userProfile?.status === 'pending_interview' || userProfile?.status === 'interview_scheduled') ? 'bg-benin-yellow/5 border-benin-yellow/20' :
            userProfile?.status === 'rejected' ? 'bg-benin-red/5 border-benin-red/20' :
            'bg-slate-50 border-slate-100'
          }`}>
            <div className={`p-3 rounded-2xl ${
              userProfile?.status === 'active' ? 'bg-benin-green text-white shadow-lg shadow-benin-green/20' : 
              (userProfile?.status === 'pending_interview' || userProfile?.status === 'interview_scheduled') ? 'bg-benin-yellow text-slate-900 shadow-lg shadow-benin-yellow/20' :
              userProfile?.status === 'rejected' ? 'bg-benin-red text-white shadow-lg shadow-benin-red/20' :
              'bg-slate-200 text-slate-400'
            }`}>
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <p className="font-black text-slate-900 text-sm">Statut du Profil</p>
              <p className="text-xs text-slate-500 font-medium">
                {userProfile?.status === 'active' ? 'Profil validé' : 
                 (userProfile?.status === 'pending_interview' || userProfile?.status === 'interview_scheduled') ? 'Entretien programmé' :
                 userProfile?.status === 'rejected' ? 'Profil rejeté' :
                 'En attente de validation admin'}
              </p>
            </div>
            {userProfile?.status === 'active' && <CheckCircle className="w-6 h-6 text-benin-green" />}
            {(userProfile?.status === 'pending_interview' || userProfile?.status === 'interview_scheduled') && <Clock className="w-6 h-6 text-benin-yellow" />}
            {userProfile?.status === 'rejected' && <AlertCircle className="w-6 h-6 text-benin-red" />}
          </div>
        </div>

        {userProfile?.status === 'pending_validation' && (
          <div className="bg-benin-yellow/10 p-5 rounded-3xl border border-benin-yellow/20 flex gap-4">
            <AlertCircle className="w-6 h-6 text-benin-yellow shrink-0" />
            <p className="text-xs text-slate-600 font-medium leading-relaxed">
              Votre profil est en cours d'examen. Un administrateur vous contactera sous 24h pour valider votre compte.
            </p>
          </div>
        )}

        {(userProfile?.status === 'pending_interview' || userProfile?.status === 'interview_scheduled') && (
          <div className="bg-benin-green/10 p-6 rounded-[32px] border border-benin-green/20 space-y-4">
            <div className="flex gap-4">
              <CalendarCheck className="w-6 h-6 text-benin-green shrink-0" />
              <p className="text-sm font-black text-benin-green">
                {userProfile.interviewInvitation?.status === 'accepted' ? 'Entretien accepté !' : 'Invitation à un entretien'}
              </p>
            </div>
            <div className="space-y-3 pl-10">
              <div className="bg-white/50 p-4 rounded-2xl space-y-2">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Date & Heure</p>
                <p className="text-sm font-black text-slate-900">
                  {userProfile.interviewDate?.seconds ? new Date(userProfile.interviewDate.seconds * 1000).toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : 'À confirmer'}
                </p>
              </div>
              <div className="bg-white/50 p-4 rounded-2xl space-y-2">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Lieu</p>
                <p className="text-sm font-black text-slate-900">{userProfile.interviewAddress || 'Agence CourseExpress'}</p>
              </div>
              <div className="bg-white/50 p-4 rounded-2xl space-y-2">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Message</p>
                <p className="text-xs text-slate-600 font-medium italic">"{userProfile.interviewMessage}"</p>
              </div>
              <div className="bg-white/50 p-4 rounded-2xl space-y-2">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Contact</p>
                <p className="text-sm font-black text-slate-900">{userProfile.interviewContactPhone}</p>
              </div>
            </div>

            {userProfile.interviewInvitation?.status === 'pending' && (
              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleAcceptInterview}
                  disabled={actionLoading}
                  className="flex-1 bg-benin-green text-white py-3 rounded-xl font-black text-xs shadow-lg shadow-benin-green/20 hover:bg-benin-green/90 transition-all flex items-center justify-center gap-2"
                >
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  ACCEPTER
                </button>
                <button
                  onClick={() => setShowRefusalConfirm(true)}
                  disabled={actionLoading}
                  className="flex-1 bg-benin-red/10 text-benin-red py-3 rounded-xl font-black text-xs hover:bg-benin-red/20 transition-all flex items-center justify-center gap-2"
                >
                  <XCircle className="w-4 h-4" />
                  REJETER
                </button>
              </div>
            )}
          </div>
        )}

        {(userProfile?.status as string) === 'rejected' && (
          <div className="bg-benin-red/10 p-5 rounded-3xl border border-benin-red/20 space-y-3">
            <div className="flex gap-4">
              <AlertCircle className="w-6 h-6 text-benin-red shrink-0" />
              <p className="text-sm font-black text-benin-red">Votre dossier a été rejeté</p>
            </div>
            <p className="text-xs text-slate-600 font-medium leading-relaxed pl-10">
              Raison : {userProfile.rejectionReason || 'Non spécifiée'}
            </p>
            <p className="text-[10px] text-slate-400 font-medium pl-10">
              Veuillez contacter le support pour plus d'informations.
            </p>
          </div>
        )}

        <button
          onClick={() => auth.signOut()}
          className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black flex items-center justify-center gap-3 hover:bg-black transition-all active:scale-95 shadow-xl shadow-slate-900/20"
        >
          Se déconnecter
        </button>

        {/* Demonstrative Section for Drivers */}
        <div className="pt-10 space-y-8 border-t border-slate-100">
          <div className="text-center space-y-2">
            <h3 className="text-xl font-black text-slate-900 tracking-tight">Pourquoi nous rejoindre ?</h3>
            <p className="text-xs text-slate-500 font-medium">Découvrez les avantages de CourseExpress.</p>
          </div>

          <div className="space-y-6">
            {[
              {
                title: "Flexibilité Totale",
                desc: "Travaillez quand vous voulez, où vous voulez à Cotonou.",
                img: "https://images.unsplash.com/photo-1585914924626-15adac1e6402?auto=format&fit=crop&q=80&w=800"
              },
              {
                title: "Gains Attractifs",
                desc: "Gardez 100% de vos pourboires et gagnez des bonus sur chaque course.",
                img: "https://images.unsplash.com/photo-1553729459-efe14ef6055d?auto=format&fit=crop&q=80&w=800"
              }
            ].map((benefit, i) => (
              <div key={i} className="bg-slate-50 rounded-[32px] overflow-hidden border border-slate-100 group">
                <div className="h-32 overflow-hidden">
                  <img src={benefit.img} alt={benefit.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                </div>
                <div className="p-6 space-y-1">
                  <h4 className="font-black text-slate-900 text-sm">{benefit.title}</h4>
                  <p className="text-[11px] text-slate-500 font-medium leading-relaxed">{benefit.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Refusal Confirmation Modal */}
      <AnimatePresence>
        {showRefusalConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !actionLoading && setShowRefusalConfirm(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-[40px] shadow-2xl p-10 space-y-8"
            >
              <div className="flex items-center gap-4">
                <div className="p-4 bg-benin-red/10 rounded-2xl">
                  <AlertCircle className="w-8 h-8 text-benin-red" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900 tracking-tight">Confirmer le rejet</h3>
                  <p className="text-xs text-slate-500 font-medium">Action irréversible</p>
                </div>
              </div>

              <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                <p className="text-sm text-slate-600 font-medium leading-relaxed">
                  Rejeter cette invitation entraînera la <span className="font-black text-slate-900">suppression définitive</span> de votre compte et de toutes vos données.
                  <br /><br />
                  Êtes-vous sûr de vouloir continuer ?
                </p>
              </div>

              <div className="flex gap-4">
                <button 
                  onClick={() => setShowRefusalConfirm(false)}
                  disabled={actionLoading}
                  className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black text-xs hover:bg-slate-200 transition-all disabled:opacity-50"
                >
                  ANNULER
                </button>
                <button 
                  onClick={handleRefuseInterview}
                  disabled={actionLoading}
                  className="flex-2 py-4 bg-benin-red text-white rounded-2xl font-black text-xs shadow-xl shadow-benin-red/20 hover:bg-benin-red/90 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                  REJETER & SUPPRIMER
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
