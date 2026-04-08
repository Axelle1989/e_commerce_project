import React, { useState, useEffect } from 'react';
import { updateDoc, doc, collection, query, where, orderBy, onSnapshot, deleteDoc, writeBatch, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, listAll, deleteObject } from 'firebase/storage';
import { EmailAuthProvider, reauthenticateWithCredential, deleteUser } from 'firebase/auth';
import { db, auth, storage } from '../firebase';
import { UserProfile, Order } from '../types';
import { User, Camera, Loader2, CheckCircle, Mail, Phone, Shield, Package, Clock, MapPin, ChevronRight, Star, Calendar, Trash2, ShieldAlert, Key } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import ImageWithFallback from '../components/ImageWithFallback';

interface ProfileProps {
  user: UserProfile;
}

export default function Profile({ user }: ProfileProps) {
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  
  // Deletion state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteStep, setDeleteStep] = useState<'password' | 'confirm'>('password');
  const [password, setPassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const navigate = useNavigate();

  useEffect(() => {
    if (!auth.currentUser) return;

    const q = query(
      collection(db, 'orders'),
      where('userId', '==', auth.currentUser.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const ordersData = snap.docs.map(d => ({ id: d.id, ...d.data() } as Order));
      setOrders(ordersData);
      setLoadingOrders(false);
    }, (error) => {
      console.error('Error fetching user orders:', error);
      setLoadingOrders(false);
    });

    return () => unsubscribe();
  }, []);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !auth.currentUser) return;

    setUploading(true);
    try {
      const storageRef = ref(storage, `users/${auth.currentUser.uid}/avatar`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      
      await updateDoc(doc(db, 'users', auth.currentUser.uid), {
        photoURL: url
      });
      
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (error) {
      console.error('Error uploading avatar:', error);
    } finally {
      setUploading(false);
    }
  };

  const handleReauthenticate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser || !password) return;

    setDeleting(true);
    setDeleteError('');
    try {
      const credential = EmailAuthProvider.credential(auth.currentUser.email!, password);
      await reauthenticateWithCredential(auth.currentUser, credential);
      setDeleteStep('confirm');
    } catch (error: any) {
      console.error('Re-authentication error:', error);
      setDeleteError('Mot de passe incorrect. Veuillez réessayer.');
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!auth.currentUser) return;

    setDeleting(true);
    try {
      const uid = auth.currentUser.uid;
      const userEmail = auth.currentUser.email;
      const userDisplayName = auth.currentUser.displayName;

      // 1. Cleanup Firestore Data
      // Update orders to be anonymous
      const ordersSnap = await getDocs(query(collection(db, 'orders'), where('userId', '==', uid)));
      const batch = writeBatch(db);
      ordersSnap.docs.forEach(d => {
        batch.update(d.ref, { 
          userId: null, 
          userDeleted: true,
          userOriginalInfo: {
            displayName: userDisplayName || "Compte supprimé",
            email: userEmail || "supprimé"
          }
        });
      });
      await batch.commit();

      // Delete user document
      await deleteDoc(doc(db, 'users', uid));

      // 2. Cleanup Storage
      try {
        const userStorageRef = ref(storage, `users/${uid}`);
        const list = await listAll(userStorageRef);
        await Promise.all(list.items.map(item => deleteObject(item)));
      } catch (e) {
        console.error('Storage cleanup error:', e);
      }

      // 3. Delete Auth User
      await deleteUser(auth.currentUser);

      // 4. Redirect
      navigate('/login');
    } catch (error: any) {
      console.error('Account deletion error:', error);
      setDeleteError(`Erreur lors de la suppression: ${error.message}`);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-10 pb-20">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-black text-slate-900 tracking-tighter">Mon Profil</h1>
        <p className="text-slate-500 font-medium">Gérez vos informations personnelles et votre avatar.</p>
      </div>

      <div className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-sm space-y-10">
        <div className="flex flex-col items-center gap-6">
          <div className="relative group">
            <div className="w-32 h-32 rounded-[40px] bg-slate-50 border-4 border-white shadow-xl overflow-hidden flex items-center justify-center">
              {user.photoURL ? (
                <ImageWithFallback src={user.photoURL} alt="" className="w-full h-full object-cover" />
              ) : (
                <User className="w-12 h-12 text-slate-200" />
              )}
              {uploading && (
                <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center">
                  <Loader2 className="w-8 h-8 animate-spin text-benin-green" />
                </div>
              )}
            </div>
            <label className="absolute -bottom-2 -right-2 w-10 h-10 bg-benin-green text-white rounded-2xl flex items-center justify-center shadow-lg cursor-pointer hover:scale-110 transition-transform">
              <Camera className="w-5 h-5" />
              <input type="file" className="hidden" accept="image/*" onChange={handleAvatarUpload} disabled={uploading} />
            </label>
          </div>
          <div className="text-center">
            <h2 className="text-2xl font-black text-slate-900">{user.displayName || 'Utilisateur'}</h2>
            <span className="text-[10px] font-black uppercase tracking-widest bg-slate-100 text-slate-400 px-3 py-1 rounded-full">
              {user.role === 'driver' ? 'Livreur' : user.role === 'admin' ? 'Administrateur' : 'Client'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-slate-50">
          <div className="space-y-2 p-6 bg-slate-50 rounded-3xl border border-slate-100">
            <div className="flex items-center gap-3 text-slate-400 mb-2">
              <Mail className="w-4 h-4" />
              <span className="text-[10px] font-black uppercase tracking-widest">Email</span>
            </div>
            <p className="font-black text-slate-900">{user.email}</p>
          </div>
          <div className="space-y-2 p-6 bg-slate-50 rounded-3xl border border-slate-100">
            <div className="flex items-center gap-3 text-slate-400 mb-2">
              <Phone className="w-4 h-4" />
              <span className="text-[10px] font-black uppercase tracking-widest">Téléphone</span>
            </div>
            <p className="font-black text-slate-900">{user.phone || 'Non renseigné'}</p>
          </div>
        </div>

        {user.role === 'driver' && (
          <div className={`p-6 rounded-3xl border flex items-center justify-between ${user.status === 'active' ? 'bg-benin-green/5 border-benin-green/10' : 'bg-benin-yellow/5 border-benin-yellow/10'}`}>
            <div className="flex items-center gap-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${user.status === 'active' ? 'bg-benin-green text-white' : 'bg-benin-yellow text-white'}`}>
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <p className="font-black text-slate-900 text-sm">Statut Livreur</p>
                <p className={`text-xs font-medium ${user.status === 'active' ? 'text-benin-green' : 'text-benin-yellow'}`}>
                  {user.status === 'active' ? 'Compte validé' : 'En attente de validation'}
                </p>
              </div>
            </div>
            {user.status === 'active' && <CheckCircle className="w-6 h-6 text-benin-green" />}
          </div>
        )}

        <AnimatePresence>
          {success && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="bg-benin-green text-white p-4 rounded-2xl flex items-center justify-center gap-3 font-black text-sm shadow-xl shadow-benin-green/20"
            >
              <CheckCircle className="w-5 h-5" />
              Profil mis à jour avec succès !
            </motion.div>
          )}
        </AnimatePresence>

        {/* Danger Zone */}
        <div className="pt-10 border-t border-slate-100">
          <div className="bg-benin-red/5 border border-benin-red/10 rounded-[32px] p-8 space-y-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-benin-red/10 rounded-xl">
                <Trash2 className="w-6 h-6 text-benin-red" />
              </div>
              <div>
                <h3 className="font-black text-slate-900">Zone de danger</h3>
                <p className="text-xs text-slate-500 font-medium">Actions irréversibles sur votre compte</p>
              </div>
            </div>
            <p className="text-xs text-slate-600 font-medium leading-relaxed">
              La suppression de votre compte entraînera la perte définitive de toutes vos données, 
              historique de commandes et documents. Cette action ne peut pas être annulée.
            </p>
            <button 
              onClick={() => setShowDeleteModal(true)}
              className="w-full py-4 bg-benin-red/10 text-benin-red rounded-2xl font-black text-xs hover:bg-benin-red/20 transition-all flex items-center justify-center gap-2"
            >
              SUPPRIMER MON COMPTE
            </button>
          </div>
        </div>
      </div>

      {/* Order History Section */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <Package className="w-6 h-6 text-benin-green" />
            Historique des commandes
          </h2>
          <span className="text-xs font-black text-slate-400 uppercase tracking-widest bg-white px-3 py-1 rounded-full border border-slate-100">
            {orders.length} commandes
          </span>
        </div>

        <div className="space-y-4">
          {loadingOrders ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-benin-green" />
            </div>
          ) : orders.length > 0 ? (
            orders.map((order) => (
              <motion.div
                key={order.id}
                whileHover={{ scale: 1.01 }}
                onClick={() => navigate(`/suivi-commande/${order.id}`)}
                className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm hover:shadow-md transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                      order.status === 'delivered' ? 'bg-slate-50 text-slate-400' : 'bg-benin-green/10 text-benin-green'
                    }`}>
                      {order.status === 'delivered' ? <CheckCircle className="w-6 h-6" /> : <Clock className="w-6 h-6 animate-pulse" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-black text-slate-900">Commande #{order.id.slice(-4)}</p>
                        <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${
                          order.status === 'delivered' ? 'bg-slate-100 text-slate-400' : 'bg-benin-green text-white'
                        }`}>
                          {order.status === 'pending' ? 'En attente' : 
                           order.status === 'accepted' ? 'Acceptée' :
                           order.status === 'at_market' ? 'Au marché' :
                           order.status === 'delivering' ? 'En livraison' : 'Livrée'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 font-medium flex items-center gap-1 mt-1">
                        <Calendar className="w-3 h-3" />
                        {order.createdAt?.toDate ? order.createdAt.toDate().toLocaleDateString() : 'Récemment'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black text-slate-900">{order.totalAmount} FCFA</p>
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{order.items.length} articles</p>
                  </div>
                  <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-300 group-hover:bg-benin-green group-hover:text-white transition-all">
                    <ChevronRight className="w-5 h-5" />
                  </div>
                </div>
                
                <div className="mt-4 pt-4 border-t border-slate-50 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-400">
                    <MapPin className="w-3 h-3" />
                    <span className="text-[10px] font-medium truncate max-w-[200px]">{order.userLocation.address}</span>
                  </div>
                  {order.status === 'delivered' && (
                    <div className="flex items-center gap-1 text-benin-yellow">
                      <Star className="w-3 h-3 fill-current" />
                      <span className="text-[10px] font-black">Noter la livraison</span>
                    </div>
                  )}
                </div>
              </motion.div>
            ))
          ) : (
            <div className="bg-white p-12 rounded-[40px] border border-slate-100 text-center space-y-4">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto">
                <Package className="w-8 h-8 text-slate-200" />
              </div>
              <p className="text-slate-400 font-medium italic">Aucune commande passée pour le moment.</p>
              <button 
                onClick={() => navigate('/')}
                className="text-benin-green font-black text-sm hover:underline"
              >
                Commencer mes courses
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Delete Account Modal */}
      <AnimatePresence>
        {showDeleteModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !deleting && setShowDeleteModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-[40px] shadow-2xl p-10 space-y-8"
            >
              <div className="flex items-center gap-4">
                <div className="p-4 bg-benin-red/10 rounded-2xl">
                  <ShieldAlert className="w-8 h-8 text-benin-red" />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight">Supprimer mon compte</h3>
                  <p className="text-xs text-slate-500 font-medium">Action irréversible</p>
                </div>
              </div>

              {deleteStep === 'password' ? (
                <form onSubmit={handleReauthenticate} className="space-y-6">
                  <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                    <p className="text-sm text-slate-600 font-medium leading-relaxed">
                      Pour des raisons de sécurité, veuillez saisir votre mot de passe actuel pour confirmer la suppression.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Mot de passe actuel</label>
                    <div className="relative">
                      <Key className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                      <input 
                        type="password" 
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl pl-16 pr-6 py-5 text-sm font-black focus:ring-2 focus:ring-benin-red outline-none"
                      />
                    </div>
                  </div>

                  {deleteError && (
                    <p className="text-xs font-black text-benin-red text-center">{deleteError}</p>
                  )}

                  <div className="flex gap-4">
                    <button 
                      type="button"
                      onClick={() => setShowDeleteModal(false)}
                      disabled={deleting}
                      className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black text-xs hover:bg-slate-200 transition-all disabled:opacity-50"
                    >
                      ANNULER
                    </button>
                    <button 
                      type="submit"
                      disabled={deleting || !password}
                      className="flex-2 py-4 bg-benin-red text-white rounded-2xl font-black text-xs shadow-xl shadow-benin-red/20 hover:bg-benin-red/90 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {deleting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <CheckCircle className="w-4 h-4" />
                      )}
                      CONTINUER
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-8">
                  <div className="p-6 bg-benin-red/5 rounded-3xl border border-benin-red/10">
                    <p className="text-sm text-benin-red font-black leading-relaxed text-center">
                      DERNIÈRE CONFIRMATION
                      <br /><br />
                      Êtes-vous absolument sûr ? Toutes vos données seront supprimées définitivement.
                    </p>
                  </div>

                  <div className="flex gap-4">
                    <button 
                      onClick={() => setShowDeleteModal(false)}
                      disabled={deleting}
                      className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black text-xs hover:bg-slate-200 transition-all disabled:opacity-50"
                    >
                      ANNULER
                    </button>
                    <button 
                      onClick={handleDeleteAccount}
                      disabled={deleting}
                      className="flex-2 py-4 bg-benin-red text-white rounded-2xl font-black text-xs shadow-xl shadow-benin-red/20 hover:bg-benin-red/90 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {deleting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                      OUI, SUPPRIMER TOUT
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
