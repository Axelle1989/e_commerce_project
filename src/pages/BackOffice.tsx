import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, doc, updateDoc, query, orderBy, limit, serverTimestamp, deleteDoc, getDoc, addDoc, onSnapshot } from 'firebase/firestore';
import { sendPasswordResetEmail } from 'firebase/auth';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { Order, UserProfile, Review, UserStatus, Dispute, AdminChat, AdminChatMessage } from '../types';
import { 
  LayoutDashboard, 
  ShoppingBag, 
  Users, 
  Truck, 
  CheckCircle, 
  ShieldCheck, 
  TrendingUp, 
  AlertCircle, 
  LogOut, 
  Calendar,
  Trash2,
  Bell,
  BarChart3,
  PieChart as PieChartIcon,
  Clock,
  XCircle,
  CalendarCheck,
  ShieldAlert,
  Settings,
  DollarSign,
  MapPin,
  Tag,
  Info,
  Loader2,
  Plus,
  MessageSquare,
  Send,
  Key
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ImageWithFallback from '../components/ImageWithFallback';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell } from 'recharts';

export default function BackOffice() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'orders' | 'users' | 'drivers' | 'reviews' | 'candidatures' | 'settings' | 'disputes' | 'chats'>('dashboard');
  const [userFilter, setUserFilter] = useState<'all' | 'client' | 'driver' | 'admin'>('all');
  const [orders, setOrders] = useState<Order[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [chats, setChats] = useState<AdminChat[]>([]);
  const [selectedChat, setSelectedChat] = useState<AdminChat | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deliverySettings, setDeliverySettings] = useState({ fixedFee: 500 });
  const [units, setUnits] = useState<{ id: string, label: string }[]>([]);
  const [newUnit, setNewUnit] = useState({ id: '', label: '' });
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingUnit, setSavingUnit] = useState(false);
  
  // Modals state
  const [showRejectionModal, setShowRejectionModal] = useState(false);
  const [showInterviewModal, setShowInterviewModal] = useState(false);
  const [showDeleteUserModal, setShowDeleteUserModal] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<UserProfile | null>(null);
  const [selectedUserToDelete, setSelectedUserToDelete] = useState<UserProfile | null>(null);
  const [deletingUser, setDeletingUser] = useState(false);
  
  // Rejection state
  const [rejectionReason, setRejectionReason] = useState('');
  const [inviteLater, setInviteLater] = useState(false);
  
  // Interview state
  const [interviewDate, setInterviewDate] = useState('');
  const [interviewTime, setInterviewTime] = useState('');
  const [interviewMessage, setInterviewMessage] = useState('Nous vous invitons à un entretien à notre agence');
  const [agencyAddress, setAgencyAddress] = useState('Agence CourseExpress, Cotonou, Bénin');
  const [agencyPhone, setAgencyPhone] = useState('+229 00 00 00 00');

  const [showNotifications, setShowNotifications] = useState(false);

  const pendingApplicationsCount = users.filter(u => u.role === 'driver' && u.status === 'pending_validation').length;
  const pendingDisputesCount = disputes.filter(d => d.status === 'pending').length;
  const unreadCount = notifications.filter(n => !n.read).length;

  const markNotificationAsRead = async (id: string) => {
    try {
      await updateDoc(doc(db, 'admin_notifications', id), { read: true });
      setNotifications(notifications.map(n => n.id === id ? { ...n, read: true } : n));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      if (!auth.currentUser) return;
      
      try {
        const orderSnap = await getDocs(query(collection(db, 'orders'), orderBy('createdAt', 'desc'))).catch(e => handleFirestoreError(e, OperationType.LIST, 'orders'));
        setOrders(orderSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order)));

        const userSnap = await getDocs(collection(db, 'users')).catch(e => handleFirestoreError(e, OperationType.LIST, 'users'));
        setUsers(userSnap.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile)));

        const reviewSnap = await getDocs(query(collection(db, 'reviews'), orderBy('createdAt', 'desc'))).catch(e => handleFirestoreError(e, OperationType.LIST, 'reviews'));
        setReviews(reviewSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Review)));

        const disputeSnap = await getDocs(query(collection(db, 'disputes'), orderBy('createdAt', 'desc'))).catch(e => handleFirestoreError(e, OperationType.LIST, 'disputes'));
        setDisputes(disputeSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Dispute)));

        const notifSnap = await getDocs(query(collection(db, 'admin_notifications'), orderBy('createdAt', 'desc'), limit(10))).catch(e => handleFirestoreError(e, OperationType.LIST, 'admin_notifications'));
        setNotifications(notifSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));

        const settingsSnap = await getDoc(doc(db, 'settings', 'delivery'));
        if (settingsSnap.exists()) {
          setDeliverySettings(settingsSnap.data() as any);
        }

        const unitSnap = await getDocs(collection(db, 'units')).catch(e => handleFirestoreError(e, OperationType.LIST, 'units'));
        setUnits(unitSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)));
      } catch (error) {
        console.error('Error fetching backoffice data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();

    // Listen to chats
    const unsubscribeChats = onSnapshot(collection(db, 'chats'), (snapshot) => {
      const chatsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AdminChat));
      setChats(chatsData.sort((a, b) => {
        const timeA = a.lastUpdated?.seconds || 0;
        const timeB = b.lastUpdated?.seconds || 0;
        return timeB - timeA;
      }));
    });

    return () => unsubscribeChats();
  }, []);

  useEffect(() => {
    if (selectedChat && activeTab === 'chats') {
      const chat = chats.find(c => c.id === selectedChat.id);
      if (chat && chat.unreadCountAdmin > 0) {
        updateDoc(doc(db, 'chats', chat.id), {
          unreadCountAdmin: 0
        });
      }
    }
  }, [selectedChat, chats, activeTab]);

  const sendAdminMessage = async () => {
    if (!newMessage.trim() || !selectedChat || !auth.currentUser) return;
    setSendingMessage(true);
    try {
      const message: AdminChatMessage = {
        senderId: 'admin',
        text: newMessage.trim(),
        timestamp: serverTimestamp(),
        read: false
      };

      await updateDoc(doc(db, 'chats', selectedChat.id), {
        messages: [...selectedChat.messages, message],
        lastMessage: newMessage.trim(),
        lastUpdated: serverTimestamp(),
        unreadCountLivreur: (selectedChat.unreadCountLivreur || 0) + 1
      });
      setNewMessage('');
    } catch (error) {
      console.error('Error sending admin message:', error);
    } finally {
      setSendingMessage(false);
    }
  };

  const chartData = useMemo(() => {
    const last7Days = Array.from({ length: 7 }).map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return d.toLocaleDateString('fr-FR', { weekday: 'short' });
    }).reverse();

    const salesByDay = orders.reduce((acc: any, order) => {
      if (!order.createdAt) return acc;
      const date = new Date(order.createdAt.seconds * 1000).toLocaleDateString('fr-FR', { weekday: 'short' });
      acc[date] = (acc[date] || 0) + order.totalAmount;
      return acc;
    }, {});

    return last7Days.map(day => ({
      name: day,
      total: salesByDay[day] || 0
    }));
  }, [orders]);

  const orderStatusData = useMemo(() => {
    const counts = orders.reduce((acc: any, order) => {
      acc[order.status] = (acc[order.status] || 0) + 1;
      return acc;
    }, {});

    return [
      { name: 'Payé', value: counts['pending'] || 0, color: '#008751' },
      { name: 'En cours', value: (counts['accepted'] || 0) + (counts['at_market'] || 0) + (counts['delivering'] || 0), color: '#FCD116' },
      { name: 'Livré', value: counts['delivered'] || 0, color: '#E8112D' },
    ].filter(d => d.value > 0);
  }, [orders]);

  const updateOrderStatus = async (orderId: string, newStatus: Order['status']) => {
    try {
      await updateDoc(doc(db, 'orders', orderId), { status: newStatus });
      setOrders(orders.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
    } catch (error) {
      console.error('Error updating order status:', error);
    }
  };

  const validateDriver = async (userId: string) => {
    if (!window.confirm('Voulez-vous vraiment valider ce livreur ?')) return;
    try {
      await updateDoc(doc(db, 'users', userId), { 
        status: 'active', 
        validatedAt: serverTimestamp() 
      });
      setUsers(users.map(u => u.uid === userId ? { ...u, status: 'active' } : u));
      // Simulate notification/email
      console.log('Notification envoyée: Votre compte a été validé');
    } catch (error) {
      console.error('Error validating driver:', error);
    }
  };

  const rejectDriver = async () => {
    if (!selectedDriver || !rejectionReason) return;
    try {
      // In a real app, we would also delete from Firebase Auth via a Cloud Function
      // Here we delete from Firestore as requested
      await deleteDoc(doc(db, 'users', selectedDriver.uid));
      setUsers(users.filter(u => u.uid !== selectedDriver.uid));
      
      // Simulate email with reason
      alert(`Email de rejet envoyé à ${selectedDriver.email} avec le motif: ${rejectionReason}`);
      if (inviteLater) {
        console.log('Invitation à postuler plus tard incluse');
      }
      
      setShowRejectionModal(false);
      setSelectedDriver(null);
      setRejectionReason('');
    } catch (error) {
      console.error('Error rejecting driver:', error);
    }
  };

  const scheduleInterview = async () => {
    if (!selectedDriver || !interviewDate || !interviewTime) return;
    try {
      const fullDate = new Date(`${interviewDate}T${interviewTime}`);
      const invitation = {
        date: interviewDate,
        time: interviewTime,
        message: interviewMessage,
        address: agencyAddress,
        status: 'pending' as const,
        sentAt: serverTimestamp()
      };

      await updateDoc(doc(db, 'users', selectedDriver.uid), {
        status: 'pending_interview',
        interviewDate: fullDate,
        interviewMessage,
        interviewAddress: agencyAddress,
        interviewContactPhone: agencyPhone,
        interviewInvitation: invitation
      });

      // Log action
      await addDoc(collection(db, 'admin_logs'), {
        action: 'schedule_interview',
        adminId: auth.currentUser?.uid,
        adminEmail: auth.currentUser?.email,
        targetUserId: selectedDriver.uid,
        targetUserEmail: selectedDriver.email,
        details: invitation,
        createdAt: serverTimestamp()
      });
      
      setUsers(users.map(u => u.uid === selectedDriver.uid ? { 
        ...u, 
        status: 'pending_interview',
        interviewDate: fullDate,
        interviewInvitation: invitation
      } : u));
      
      // Simulate notification/email
      console.log(`Entretien programmé pour ${selectedDriver.email} le ${fullDate.toLocaleString()}`);
      
      setShowInterviewModal(false);
      setSelectedDriver(null);
    } catch (error) {
      console.error('Error scheduling interview:', error);
    }
  };

  const toggleUserSuspension = async (user: UserProfile) => {
    try {
      const newStatus: UserStatus = user.status === 'suspended' ? 'active' : 'suspended';
      await updateDoc(doc(db, 'users', user.uid), { status: newStatus });
      setUsers(users.map(u => u.uid === user.uid ? { ...u, status: newStatus } : u));
    } catch (error) {
      console.error('Error toggling user status:', error);
    }
  };

  const deleteReview = async (reviewId: string) => {
    try {
      await deleteDoc(doc(db, 'reviews', reviewId));
      setReviews(reviews.filter(r => r.id !== reviewId));
    } catch (error) {
      console.error('Error deleting review:', error);
    }
  };

  const resetUserPassword = async (email: string) => {
    if (!window.confirm(`Envoyer un email de réinitialisation de mot de passe à ${email} ?`)) return;
    try {
      await sendPasswordResetEmail(auth, email);
      alert(`Email de réinitialisation envoyé à ${email}`);
    } catch (error: any) {
      console.error('Error resetting password:', error);
      alert(`Erreur: ${error.message}`);
    }
  };

  const deleteUserAccount = async () => {
    if (!selectedUserToDelete || !auth.currentUser) return;
    
    setDeletingUser(true);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const response = await fetch('/api/admin/delete-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUid: selectedUserToDelete.uid,
          adminUid: auth.currentUser.uid,
          idToken
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Erreur lors de la suppression');

      setUsers(users.filter(u => u.uid !== selectedUserToDelete.uid));
      setShowDeleteUserModal(false);
      setSelectedUserToDelete(null);
      // alert('Compte supprimé avec succès');
    } catch (error: any) {
      console.error('Error deleting user:', error);
      // alert(`Erreur: ${error.message}`);
    } finally {
      setDeletingUser(false);
    }
  };

  const saveDeliverySettings = async () => {
    setSavingSettings(true);
    try {
      await updateDoc(doc(db, 'settings', 'delivery'), deliverySettings);
      // alert('Paramètres enregistrés avec succès');
    } catch (error) {
      // If document doesn't exist, create it
      try {
        const { setDoc } = await import('firebase/firestore');
        await setDoc(doc(db, 'settings', 'delivery'), deliverySettings);
        // alert('Paramètres enregistrés avec succès');
      } catch (e) {
        console.error('Error saving settings:', e);
      }
    } finally {
      setSavingSettings(false);
    }
  };

  const addUnit = async () => {
    if (!newUnit.id || !newUnit.label) return;
    setSavingUnit(true);
    try {
      const { setDoc } = await import('firebase/firestore');
      await setDoc(doc(db, 'units', newUnit.id), { label: newUnit.label });
      setUnits([...units, { id: newUnit.id, label: newUnit.label }]);
      setNewUnit({ id: '', label: '' });
    } catch (error) {
      console.error('Error adding unit:', error);
    } finally {
      setSavingUnit(false);
    }
  };

  const deleteUnit = async (id: string) => {
    if (!window.confirm('Supprimer cette unité ?')) return;
    try {
      await deleteDoc(doc(db, 'units', id));
      setUnits(units.filter(u => u.id !== id));
    } catch (error) {
      console.error('Error deleting unit:', error);
    }
  };

  const handleResolveDispute = async (disputeId: string, orderId: string, decision: Dispute['status'], adminDecision: string) => {
    if (!auth.currentUser) return;
    try {
      await updateDoc(doc(db, 'disputes', disputeId), {
        status: decision,
        adminDecision,
        adminId: auth.currentUser.uid,
        resolvedAt: serverTimestamp()
      });

      let orderStatus: Order['status'] = 'delivering';
      if (decision === 'resolved_total_cancel') orderStatus = 'cancelled';
      
      await updateDoc(doc(db, 'orders', orderId), {
        status: orderStatus,
        proofStatus: decision === 'resolved_total_cancel' ? 'rejected' : 'approved'
      });

      setDisputes(disputes.map(d => d.id === disputeId ? { ...d, status: decision, adminDecision } : d));
      setOrders(orders.map(o => o.id === orderId ? { ...o, status: orderStatus } : o));

      alert("Litige résolu avec succès.");
    } catch (error) {
      console.error('Error resolving dispute:', error);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-benin-green"></div>
    </div>
  );

  const stats = [
    { label: 'Commandes', value: orders.length, icon: ShoppingBag, color: 'text-benin-green', bg: 'bg-benin-green/10' },
    { label: 'Livreurs', value: users.filter(u => u.role === 'driver').length, icon: Truck, color: 'text-benin-yellow', bg: 'bg-benin-yellow/10' },
    { label: 'Clients', value: users.filter(u => u.role === 'client').length, icon: Users, color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'C.A. Total', value: `${orders.reduce((sum, o) => sum + o.totalAmount, 0)} FCFA`, icon: TrendingUp, color: 'text-benin-red', bg: 'bg-benin-red/10' },
  ];

  const handleLogout = async () => {
    await auth.signOut();
    window.location.href = '/login';
  };

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans">
      {/* Sidebar Admin */}
      <aside className="w-80 bg-slate-900 text-white flex flex-col sticky top-0 h-screen overflow-y-auto">
        <div className="p-10">
          <div className="flex items-center gap-4 mb-12">
            <div className="bg-benin-green p-3 rounded-2xl shadow-xl shadow-benin-green/20">
              <ShieldCheck className="text-white w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tighter">Admin Panel</h1>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">CourseExpress Bénin</p>
            </div>
          </div>

          <nav className="space-y-2">
            {[
              { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
              { id: 'candidatures', label: 'Candidatures', icon: ShieldCheck, badge: pendingApplicationsCount },
              { id: 'drivers', label: 'Livreurs Actifs', icon: Truck },
              { id: 'orders', label: 'Commandes Clients', icon: ShoppingBag },
              { id: 'chats', label: 'Chats Livreurs', icon: MessageSquare, badge: chats.reduce((sum, c) => sum + (c.unreadCountAdmin || 0), 0) },
              { id: 'disputes', label: 'Litiges', icon: ShieldAlert, badge: pendingDisputesCount },
              { id: 'users', label: 'Utilisateurs', icon: Users },
              { id: 'reviews', label: 'Avis & Modération', icon: CheckCircle },
              { id: 'settings', label: 'Paramètres', icon: Settings },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`w-full flex items-center justify-between px-6 py-4 rounded-2xl text-sm font-black transition-all ${
                  activeTab === tab.id 
                    ? 'bg-benin-green text-white shadow-xl shadow-benin-green/20' 
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-4">
                  <tab.icon className="w-5 h-5" />
                  {tab.label}
                </div>
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className="bg-benin-red text-white text-[10px] px-2 py-0.5 rounded-full">
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        <div className="mt-auto p-10 space-y-6">
          <div className="p-6 bg-white/5 rounded-3xl border border-white/10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-benin-yellow rounded-xl flex items-center justify-center font-black text-slate-900 overflow-hidden">
                {auth.currentUser?.photoURL ? (
                  <ImageWithFallback 
                    src={auth.currentUser.photoURL} 
                    alt="" 
                    className="w-full h-full object-cover" 
                  />
                ) : (
                  auth.currentUser?.displayName?.split(' ').map(n => n[0]).join('') || 'AD'
                )}
              </div>
              <div>
                <p className="text-xs font-black">{auth.currentUser?.displayName || 'Administrateur'}</p>
                <p className="text-[10px] text-slate-500 font-medium">Super Admin</p>
              </div>
            </div>
            <button 
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 py-3 bg-benin-red/10 text-benin-red rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-benin-red/20 transition-all"
            >
              <LogOut className="w-4 h-4" /> Déconnexion
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-12 overflow-y-auto">
        <div className="max-w-6xl mx-auto space-y-12">
          <header className="flex items-center justify-between">
            <div>
              <h2 className="text-4xl font-black text-slate-900 tracking-tighter capitalize">
                {activeTab === 'dashboard' ? 'Vue d\'ensemble' : activeTab}
              </h2>
              <p className="text-slate-500 font-medium">Gestion centralisée de la plateforme.</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="relative">
                <button 
                  onClick={() => setShowNotifications(!showNotifications)}
                  className="p-3 bg-white rounded-2xl border border-slate-100 shadow-sm text-slate-400 hover:text-benin-green transition-all relative"
                >
                  <Bell className="w-6 h-6" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-benin-red text-white text-[10px] font-black flex items-center justify-center rounded-full border-2 border-white">
                      {unreadCount}
                    </span>
                  )}
                </button>

                {showNotifications && (
                  <div className="absolute right-0 mt-4 w-80 bg-white rounded-[32px] border border-slate-100 shadow-2xl shadow-slate-200/50 p-6 z-50 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-black text-slate-900">Notifications</h4>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{unreadCount} non lues</span>
                    </div>
                    <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                      {notifications.map(n => (
                        <div 
                          key={n.id} 
                          onClick={() => markNotificationAsRead(n.id)}
                          className={`p-4 rounded-2xl border transition-all cursor-pointer ${n.read ? 'bg-slate-50 border-slate-100 opacity-60' : 'bg-benin-green/5 border-benin-green/20'}`}
                        >
                          <p className="text-xs font-black text-slate-900 mb-1">
                            {n.type === 'new_driver_request' ? 'Nouveau Livreur' : 'Alerte Commande'}
                          </p>
                          <p className="text-[10px] text-slate-500 font-medium">
                            {n.message || (n.type === 'new_driver_request' ? `${n.driverName} attend sa validation.` : 'Une commande nécessite votre attention.')}
                          </p>
                        </div>
                      ))}
                      {notifications.length === 0 && (
                        <p className="text-center py-8 text-xs text-slate-400 italic">Aucune notification</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <div className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm">
                <Calendar className="w-5 h-5 text-slate-400" />
              </div>
              <div className="bg-white px-6 py-3 rounded-2xl border border-slate-100 shadow-sm text-xs font-black text-slate-900">
                {new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
              </div>
            </div>
          </header>

          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {activeTab === 'dashboard' && (
                <div className="space-y-12">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    {stats.map((stat) => (
                      <div key={stat.label} className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm flex items-center gap-6">
                        <div className={`${stat.bg} p-5 rounded-2xl`}>
                          <stat.icon className={`w-8 h-8 ${stat.color}`} />
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{stat.label}</p>
                          <p className="text-2xl font-black text-slate-900">{stat.value}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                    {/* Sales Chart */}
                    <div className="lg:col-span-2 bg-white p-10 rounded-[40px] border border-slate-100 shadow-sm space-y-8">
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <h3 className="text-2xl font-black text-slate-900 tracking-tight">Volume d'Affaires</h3>
                          <p className="text-xs text-slate-500 font-medium italic">Ventes sur les 7 derniers jours (FCFA)</p>
                        </div>
                        <div className="p-3 bg-slate-50 rounded-xl">
                          <BarChart3 className="w-5 h-5 text-slate-400" />
                        </div>
                      </div>
                      <div style={{ height: 400, width: '100%' }}>
                        <ResponsiveContainer width="100%" height={400}>
                          <AreaChart data={chartData}>
                            <defs>
                              <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#008751" stopOpacity={0.1}/>
                                <stop offset="95%" stopColor="#008751" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis 
                              dataKey="name" 
                              axisLine={false} 
                              tickLine={false} 
                              tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }}
                              dy={10}
                            />
                            <YAxis 
                              axisLine={false} 
                              tickLine={false} 
                              tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }}
                            />
                            <Tooltip 
                              contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontWeight: 900 }}
                            />
                            <Area type="monotone" dataKey="total" stroke="#008751" strokeWidth={4} fillOpacity={1} fill="url(#colorTotal)" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Status Breakdown */}
                    <div className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-sm space-y-8">
                      <div className="flex items-center justify-between">
                        <h3 className="text-2xl font-black text-slate-900 tracking-tight">Statuts</h3>
                        <PieChartIcon className="w-5 h-5 text-slate-400" />
                      </div>
                      <div style={{ height: 400, width: '100%' }}>
                        <ResponsiveContainer width="100%" height={400}>
                          <PieChart>
                            <Pie
                              data={orderStatusData}
                              innerRadius={60}
                              outerRadius={80}
                              paddingAngle={5}
                              dataKey="value"
                            >
                              {orderStatusData.map((entry) => (
                                <Cell key={`cell-${entry.name}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="space-y-3">
                        {orderStatusData.map((status) => (
                          <div key={`status-legend-${status.name}`} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: status.color }}></div>
                              <span className="text-xs font-black text-slate-600">{status.name}</span>
                            </div>
                            <span className="text-xs font-black text-slate-900">{status.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                    <div className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-sm space-y-8">
                      <h3 className="text-2xl font-black text-slate-900 tracking-tight">Dernières Commandes</h3>
                      <div className="space-y-4">
                        {orders.slice(0, 5).map(order => (
                          <div key={order.id} className="flex items-center justify-between p-5 bg-slate-50 rounded-[24px] border border-slate-100 group hover:bg-white hover:shadow-xl transition-all">
                            <div className="flex items-center gap-5">
                              <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm group-hover:bg-benin-green group-hover:text-white transition-colors">
                                <ShoppingBag className="w-6 h-6" />
                              </div>
                              <div>
                                <p className="font-black text-slate-900 text-sm">#{order.id.slice(-4)}</p>
                                <p className="text-xs text-slate-500 font-medium">{order.totalAmount} FCFA • {order.status}</p>
                              </div>
                            </div>
                            <button onClick={() => setActiveTab('orders')} className="text-benin-green text-xs font-black hover:underline">Détails</button>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-sm space-y-8">
                      <h3 className="text-2xl font-black text-slate-900 tracking-tight">Livreurs à Valider</h3>
                      <div className="space-y-4">
                        {users.filter(u => u.role === 'driver' && u.status === 'pending_validation').map(user => (
                          <div key={user.uid} className="flex items-center justify-between p-5 bg-slate-50 rounded-[24px] border border-slate-100">
                            <div className="flex items-center gap-5">
                              <div className="w-14 h-14 bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-100">
                                <ImageWithFallback src={user.photoURL || `https://picsum.photos/seed/${user.uid}/100`} alt="" className="w-full h-full object-cover" />
                              </div>
                              <div>
                                <p className="font-black text-slate-900 text-sm">{user.displayName}</p>
                                <p className="text-xs text-slate-500 font-medium">{user.phone}</p>
                              </div>
                            </div>
                            <button 
                              onClick={() => setActiveTab('drivers')}
                              className="bg-benin-green text-white px-5 py-2.5 rounded-xl text-xs font-black hover:bg-benin-green/90 transition-all shadow-lg shadow-benin-green/20"
                            >
                              Gérer
                            </button>
                          </div>
                        ))}
                        {users.filter(u => u.role === 'driver' && u.status === 'pending_validation').length === 0 && (
                          <div className="text-center py-12 space-y-4">
                            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto">
                              <Truck className="w-8 h-8 text-slate-200" />
                            </div>
                            <p className="text-slate-400 text-sm font-medium italic">Aucun livreur en attente</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'candidatures' && (
                <div className="space-y-8">
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-8">
                    <div className="space-y-2">
                      <h2 className="text-3xl font-black text-slate-900 tracking-tight">Candidatures Livreurs</h2>
                      <p className="text-slate-500 font-medium">Examinez les dossiers et gérez les nouveaux candidats.</p>
                    </div>
                  </div>

                  {/* Section: En attente de validation */}
                  <div className="space-y-6">
                    <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
                      <Clock className="w-5 h-5 text-benin-yellow" />
                      En attente de validation ({users.filter(u => u.role === 'driver' && u.status === 'pending_validation').length})
                    </h3>
                    <div className="grid grid-cols-1 gap-6">
                      {users.filter(u => u.role === 'driver' && u.status === 'pending_validation').map(user => (
                        <div key={user.uid} className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm space-y-6">
                          <div className="flex flex-col md:flex-row gap-8">
                            <div className="w-full md:w-48 space-y-4">
                              <div className="aspect-square bg-slate-50 rounded-2xl overflow-hidden border border-slate-100">
                                <ImageWithFallback 
                                  src={user.photoURL || `https://picsum.photos/seed/${user.uid}/200`} 
                                  alt="" 
                                  className="w-full h-full object-cover" 
                                />
                              </div>
                              <button 
                                onClick={() => window.open(user.idCardPhotoUrl, '_blank')}
                                className="w-full py-2 bg-slate-100 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all"
                              >
                                Voir ID Card
                              </button>
                            </div>

                            <div className="flex-1 space-y-6">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Candidat</p>
                                  <p className="text-lg font-black text-slate-900">{user.prenom} {user.nom}</p>
                                  <p className="text-xs text-slate-500 font-medium">{user.email}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Téléphone</p>
                                  <p className="text-lg font-black text-slate-900">{user.phone}</p>
                                </div>
                                <div className="md:col-span-2">
                                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Date de candidature</p>
                                  <p className="text-sm font-black text-slate-900">
                                    {user.createdAt?.seconds ? new Date(user.createdAt.seconds * 1000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Date inconnue'}
                                  </p>
                                </div>
                              </div>

                              <div className="pt-6 border-t border-slate-50 flex flex-wrap gap-3">
                                <button 
                                  onClick={() => validateDriver(user.uid)}
                                  className="flex-1 min-w-[140px] bg-benin-green text-white py-3 rounded-xl font-black text-xs shadow-lg shadow-benin-green/20 hover:bg-benin-green/90 transition-all flex items-center justify-center gap-2"
                                >
                                  <CheckCircle className="w-4 h-4" /> VALIDER
                                </button>
                                <button 
                                  onClick={() => {
                                    setSelectedDriver(user);
                                    setShowInterviewModal(true);
                                  }}
                                  className="flex-1 min-w-[140px] bg-benin-yellow text-slate-900 py-3 rounded-xl font-black text-xs shadow-lg shadow-benin-yellow/20 hover:bg-benin-yellow/90 transition-all flex items-center justify-center gap-2"
                                >
                                  <CalendarCheck className="w-4 h-4" /> RDV ENTRETIEN
                                </button>
                                <button 
                                  onClick={() => {
                                    setSelectedDriver(user);
                                    setShowRejectionModal(true);
                                  }}
                                  className="flex-1 min-w-[140px] bg-benin-red/10 text-benin-red py-3 rounded-xl font-black text-xs hover:bg-benin-red/20 transition-all flex items-center justify-center gap-2"
                                >
                                  <XCircle className="w-4 h-4" /> REJETER
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Section: Rendez-vous programmés */}
                  <div className="space-y-6 pt-12">
                    <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
                      <CalendarCheck className="w-5 h-5 text-benin-green" />
                      Rendez-vous programmés ({users.filter(u => u.role === 'driver' && (u.status === 'pending_interview' || u.status === 'interview_scheduled')).length})
                    </h3>
                    <div className="grid grid-cols-1 gap-6">
                      {users.filter(u => u.role === 'driver' && (u.status === 'pending_interview' || u.status === 'interview_scheduled')).map(user => (
                        <div key={user.uid} className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6">
                          <div className="flex items-center gap-6">
                            <div className="w-16 h-16 rounded-2xl overflow-hidden border border-slate-100">
                              <ImageWithFallback src={user.photoURL || `https://picsum.photos/seed/${user.uid}/100`} alt="" className="w-full h-full object-cover" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-black text-slate-900">{user.prenom} {user.nom}</p>
                                {user.interviewInvitation?.status === 'accepted' ? (
                                  <span className="bg-benin-green/10 text-benin-green text-[8px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest">Accepté</span>
                                ) : (
                                  <span className="bg-benin-yellow/10 text-benin-yellow text-[8px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest">En attente</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-benin-green text-xs font-black">
                                <Clock className="w-4 h-4" />
                                {user.interviewDate?.seconds ? new Date(user.interviewDate.seconds * 1000).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Date non définie'}
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-3">
                            <button 
                              onClick={() => validateDriver(user.uid)}
                              className="px-6 py-3 bg-benin-green text-white rounded-xl text-xs font-black hover:bg-benin-green/90 transition-all"
                            >
                              VALIDER
                            </button>
                            <button 
                              onClick={() => {
                                setSelectedDriver(user);
                                setShowRejectionModal(true);
                              }}
                              className="px-6 py-3 bg-benin-red/10 text-benin-red rounded-xl text-xs font-black hover:bg-benin-red/20 transition-all"
                            >
                              REJETER
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'drivers' && (
                <div className="space-y-8">
                  <h2 className="text-3xl font-black text-slate-900 tracking-tight">Livreurs Actifs</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {users.filter(u => u.role === 'driver' && u.status === 'active').map(user => (
                      <div key={user.uid} className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm space-y-4">
                        <div className="flex items-center gap-4">
                          <div className="w-14 h-14 rounded-2xl overflow-hidden border border-slate-100">
                            <ImageWithFallback src={user.photoURL || `https://picsum.photos/seed/${user.uid}/100`} alt="" className="w-full h-full object-cover" />
                          </div>
                          <div>
                            <p className="font-black text-slate-900">{user.displayName || `${user.prenom} ${user.nom}`}</p>
                            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Livreur Actif</p>
                          </div>
                        </div>
                        <div className="pt-4 border-t border-slate-50 flex justify-between items-center">
                          <div className="flex items-center gap-1 text-benin-yellow">
                            <span className="text-sm font-black">★</span>
                            <span className="text-xs font-black text-slate-900">{user.noteMoyenne || '5.0'}</span>
                          </div>
                          <button 
                            onClick={() => toggleUserSuspension(user)}
                            className="text-[10px] font-black text-benin-red uppercase tracking-widest hover:underline"
                          >
                            Suspendre
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'orders' && (
                <div className="space-y-8">
                  <h2 className="text-3xl font-black text-slate-900 tracking-tight">Gestion des Commandes</h2>
                  <div className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50 border-b border-slate-100">
                        <tr>
                          <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">ID / Client</th>
                          <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Destination</th>
                          <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Montant</th>
                          <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Statut</th>
                          <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {orders.map(order => (
                          <tr key={order.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-8 py-6">
                              <div className="space-y-1">
                                <p className="font-black text-slate-900 text-sm">#{order.id.slice(-6)}</p>
                                <p className="text-xs text-slate-500 font-medium">{order.items.length} articles</p>
                              </div>
                            </td>
                            <td className="px-8 py-6">
                              <div className="flex items-center gap-2">
                                <MapPin className="w-4 h-4 text-slate-400" />
                                <span className="text-sm font-black text-slate-900 truncate max-w-[150px]">{order.userLocation.address}</span>
                              </div>
                            </td>
                            <td className="px-8 py-6">
                              <span className="text-sm font-black text-slate-900">{order.totalAmount} FCFA</span>
                            </td>
                            <td className="px-8 py-6">
                              <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-full ${
                                order.status === 'delivered' ? 'bg-benin-green/10 text-benin-green' :
                                order.status === 'pending' ? 'bg-benin-yellow/10 text-benin-yellow' :
                                'bg-slate-100 text-slate-500'
                              }`}>
                                {order.status}
                              </span>
                            </td>
                            <td className="px-8 py-6 text-right">
                              <select 
                                value={order.status}
                                onChange={(e) => updateOrderStatus(order.id, e.target.value as Order['status'])}
                                className="bg-slate-50 border-none rounded-xl text-xs font-black px-4 py-2 focus:ring-2 focus:ring-benin-green outline-none"
                              >
                                <option value="pending">Payé</option>
                                <option value="accepted">Accepté</option>
                                <option value="at_market">Au Marché</option>
                                <option value="delivering">En Livraison</option>
                                <option value="delivered">Livré</option>
                                <option value="cancelled">Annulé</option>
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeTab === 'disputes' && (
                <div className="space-y-8">
                  <h2 className="text-3xl font-black text-slate-900 tracking-tight">Gestion des Litiges</h2>
                  <div className="grid grid-cols-1 gap-8">
                    {disputes.map(dispute => {
                      const order = orders.find(o => o.id === dispute.orderId);
                      const client = users.find(u => u.uid === dispute.clientId);
                      const driver = users.find(u => u.uid === dispute.driverId);

                      return (
                        <div key={dispute.id} className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-sm space-y-8">
                          <div className="flex flex-col md:flex-row justify-between gap-6">
                            <div className="space-y-4">
                              <div className="flex items-center gap-3">
                                <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${
                                  dispute.status === 'pending' ? 'bg-benin-red text-white' : 'bg-slate-100 text-slate-400'
                                }`}>
                                  {dispute.status === 'pending' ? 'En attente' : 'Résolu'}
                                </span>
                                <h3 className="text-xl font-black text-slate-900">Litige #{dispute.id.slice(-6)}</h3>
                              </div>
                              <p className="text-sm text-slate-600 font-medium bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                <span className="font-black text-slate-900">Raison:</span> {dispute.reason}
                              </p>
                            </div>
                            <div className="flex gap-4">
                              <div className="text-right">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Client</p>
                                <p className="text-sm font-black text-slate-900">{client?.displayName || 'Inconnu'}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Livreur</p>
                                <p className="text-sm font-black text-slate-900">{driver?.displayName || 'Inconnu'}</p>
                              </div>
                            </div>
                          </div>

                          {order && (
                            <div className="space-y-6">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-4">
                                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Preuves d'achat</h4>
                                  <div className="grid grid-cols-3 gap-3">
                                    {Object.values(order.itemsValidation || {}).map((val, i) => (
                                      val.proofPhotos.map((url, j) => (
                                        <div key={`${i}-${j}`} className="aspect-square rounded-xl overflow-hidden border border-slate-100 cursor-pointer" onClick={() => window.open(url, '_blank')}>
                                          <ImageWithFallback 
                                            src={url} 
                                            alt="" 
                                            className="w-full h-full object-cover" 
                                          />
                                        </div>
                                      ))
                                    ))}
                                  </div>
                                </div>
                                <div className="space-y-4">
                                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Détails Validation</h4>
                                  <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                                    {order.items.map((item, i) => {
                                      const val = (order.itemsValidation || {})[i];
                                      return (
                                        <div key={`item-val-${i}`} className={`p-3 rounded-xl border text-xs ${val?.clientApproved === false ? 'bg-benin-red/5 border-benin-red/10' : 'bg-slate-50 border-slate-100'}`}>
                                          <div className="flex justify-between font-black">
                                            <span>{item.name}</span>
                                            <span className={val?.clientApproved === false ? 'text-benin-red' : 'text-benin-green'}>
                                              {val?.clientApproved === false ? 'REFUSÉ' : 'ACCEPTÉ'}
                                            </span>
                                          </div>
                                          {val?.clientRemark && <p className="mt-1 italic text-slate-500">"{val.clientRemark}"</p>}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>

                              {dispute.status === 'pending' && (
                                <div className="pt-8 border-t border-slate-100 space-y-6">
                                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Décision de l'Administrateur</h4>
                                  <div className="flex flex-wrap gap-4">
                                    <button 
                                      onClick={() => handleResolveDispute(dispute.id, order.id, 'resolved_validated', 'Validation forcée par admin')}
                                      className="flex-1 py-4 bg-benin-green text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-benin-green/20"
                                    >
                                      Valider les achats
                                    </button>
                                    <button 
                                      onClick={() => handleResolveDispute(dispute.id, order.id, 'resolved_partial_cancel', 'Annulation partielle par admin')}
                                      className="flex-1 py-4 bg-benin-yellow text-slate-900 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-benin-yellow/20"
                                    >
                                      Annulation Partielle
                                    </button>
                                    <button 
                                      onClick={() => handleResolveDispute(dispute.id, order.id, 'resolved_total_cancel', 'Annulation totale par admin')}
                                      className="flex-1 py-4 bg-benin-red text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-benin-red/20"
                                    >
                                      Annulation Totale
                                    </button>
                                    {driver && (
                                      <button 
                                        onClick={() => toggleUserSuspension(driver)}
                                        className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest"
                                      >
                                        Suspendre Livreur
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {disputes.length === 0 && (
                      <div className="py-20 text-center space-y-4">
                        <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto">
                          <ShieldAlert className="w-10 h-10 text-slate-200" />
                        </div>
                        <p className="text-slate-400 font-medium italic">Aucun litige en cours</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'users' && (
                <div className="space-y-8">
                  <div className="flex items-center justify-between">
                    <h2 className="text-3xl font-black text-slate-900 tracking-tight">Gestion Utilisateurs</h2>
                    <div className="flex gap-2">
                      {['all', 'client', 'driver', 'admin'].map(r => (
                        <button 
                          key={r}
                          onClick={() => setUserFilter(r as any)}
                          className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${userFilter === r ? 'bg-slate-900 text-white' : 'bg-white text-slate-400 hover:text-slate-600 border border-slate-100'}`}
                        >
                          {r === 'all' ? 'Tous' : r === 'driver' ? 'Livreurs' : r === 'client' ? 'Clients' : 'Admins'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50 border-b border-slate-100">
                        <tr>
                          <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Utilisateur</th>
                          <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Rôle</th>
                          <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Statut</th>
                          <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {users.filter(u => userFilter === 'all' || u.role === userFilter).map(user => (
                          <tr key={user.uid} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-8 py-6">
                              <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl overflow-hidden border border-slate-100 shadow-sm">
                                  <ImageWithFallback 
                                    src={user.photoURL || `https://picsum.photos/seed/${user.uid}/100`} 
                                    alt="" 
                                    className="w-full h-full object-cover" 
                                  />
                                </div>
                                <div>
                                  <p className="font-black text-slate-900 text-sm">{user.displayName}</p>
                                  <p className="text-xs text-slate-500 font-medium">{user.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-8 py-6">
                              <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-full ${
                                user.role === 'admin' ? 'bg-purple-100 text-purple-700' :
                                user.role === 'driver' ? 'bg-benin-green/10 text-benin-green' : 'bg-slate-100 text-slate-700'
                              }`}>
                                {user.role}
                              </span>
                            </td>
                            <td className="px-8 py-6">
                              {user.status === 'suspended' ? (
                                <span className="flex items-center gap-2 text-xs font-black text-benin-red">
                                  <ShieldAlert className="w-4 h-4" /> Suspendu
                                </span>
                              ) : (
                                <span className="flex items-center gap-2 text-xs font-black text-benin-green">
                                  <ShieldCheck className="w-4 h-4" /> Actif
                                </span>
                              )}
                            </td>
                            <td className="px-8 py-6 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button 
                                  onClick={() => resetUserPassword(user.email)}
                                  className="p-2 bg-slate-100 text-slate-400 hover:text-benin-yellow hover:bg-benin-yellow/10 rounded-xl transition-all"
                                  title="Réinitialiser le mot de passe"
                                >
                                  <Key className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={() => toggleUserSuspension(user)}
                                  className={`px-4 py-2 rounded-xl text-[10px] font-black transition-all ${
                                    user.status === 'suspended' ? 'bg-benin-green text-white hover:bg-benin-green/90' : 'bg-benin-red/10 text-benin-red hover:bg-benin-red/20'
                                  }`}
                                >
                                  {user.status === 'suspended' ? 'Réactiver' : 'Suspendre'}
                                </button>
                                {user.uid !== auth.currentUser?.uid && (
                                  <button 
                                    onClick={() => {
                                      setSelectedUserToDelete(user);
                                      setShowDeleteUserModal(true);
                                    }}
                                    className="p-2 bg-slate-100 text-slate-400 hover:text-benin-red hover:bg-benin-red/10 rounded-xl transition-all"
                                    title="Supprimer le compte"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeTab === 'reviews' && (
                <div className="space-y-8">
                  <h2 className="text-3xl font-black text-slate-900 tracking-tight">Modération des Avis</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {reviews.map(review => (
                      <div key={review.id} className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm space-y-6 group hover:shadow-xl transition-all">
                        <div className="flex justify-between items-start">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-slate-50 rounded-2xl overflow-hidden border border-slate-100">
                              <ImageWithFallback src={`https://picsum.photos/seed/${review.userId}/100`} alt="" className="w-full h-full object-cover" />
                            </div>
                            <div>
                              <p className="font-black text-slate-900 text-sm">Client #{review.userId.slice(-4)}</p>
                              <div className="flex text-benin-yellow">
                                {Array.from({ length: 5 }).map((_, i) => (
                                  <span key={`star-${review.id}-${i}`} className="text-sm">{i < review.note ? '★' : '☆'}</span>
                                ))}
                              </div>
                            </div>
                          </div>
                          <button 
                            onClick={() => deleteReview(review.id)}
                            className="p-3 text-slate-200 hover:text-benin-red hover:bg-benin-red/5 rounded-xl transition-all"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                        <p className="text-sm text-slate-600 font-medium italic leading-relaxed">"{review.commentaire || 'Aucun commentaire'}"</p>
                        <div className="pt-6 border-t border-slate-50 flex justify-between items-center">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Livreur: {review.driverId.slice(-4)}</span>
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{new Date(review.createdAt?.seconds * 1000).toLocaleDateString()}</span>
                        </div>
                      </div>
                    ))}
                    {reviews.length === 0 && (
                      <div className="col-span-full py-20 text-center space-y-4">
                        <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto">
                          <CheckCircle className="w-10 h-10 text-slate-200" />
                        </div>
                        <p className="text-slate-400 font-medium italic">Aucun avis pour le moment</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {activeTab === 'chats' && (
                <div className="h-[calc(100vh-200px)] flex gap-8">
                  {/* Chat List */}
                  <div className="w-80 bg-white rounded-[40px] border border-slate-100 shadow-sm flex flex-col overflow-hidden">
                    <div className="p-6 border-b border-slate-50">
                      <h3 className="text-xl font-black text-slate-900">Conversations</h3>
                    </div>
                          <div className="flex-1 overflow-y-auto p-4 space-y-2">
                            {chats.map(chat => (
                              <button
                                key={chat.id}
                                onClick={() => setSelectedChat(chat)}
                                className={`w-full p-4 rounded-2xl flex items-center gap-4 transition-all ${
                                  selectedChat?.id === chat.id 
                                    ? 'bg-benin-green text-white shadow-lg shadow-benin-green/20' 
                                    : 'hover:bg-slate-50 text-slate-600'
                                }`}
                              >
                                <div className="w-10 h-10 rounded-xl overflow-hidden border border-white/20 shrink-0">
                                  <ImageWithFallback src={chat.livreurPhoto || `https://picsum.photos/seed/${chat.livreurId}/100`} alt="" className="w-full h-full object-cover" />
                                </div>
                          <div className="flex-1 text-left min-w-0">
                            <p className="font-black text-sm truncate">{chat.livreurName}</p>
                            <p className={`text-[10px] truncate ${selectedChat?.id === chat.id ? 'text-white/70' : 'text-slate-400'}`}>
                              {chat.lastMessage}
                            </p>
                          </div>
                          {chat.unreadCountAdmin > 0 && (
                            <span className="w-5 h-5 bg-benin-red text-white text-[10px] font-black flex items-center justify-center rounded-full border-2 border-white shrink-0">
                              {chat.unreadCountAdmin}
                            </span>
                          )}
                        </button>
                      ))}
                      {chats.length === 0 && (
                        <div className="text-center py-10">
                          <p className="text-xs text-slate-400 italic">Aucune conversation</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Chat Window */}
                  <div className="flex-1 bg-white rounded-[40px] border border-slate-100 shadow-sm flex flex-col overflow-hidden">
                    {selectedChat ? (
                      <>
                        <div className="p-6 border-b border-slate-50 flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl overflow-hidden border border-slate-100">
                              <ImageWithFallback src={selectedChat.livreurPhoto || `https://picsum.photos/seed/${selectedChat.livreurId}/100`} alt="" className="w-full h-full object-cover" />
                            </div>
                            <div>
                              <h3 className="font-black text-slate-900">{selectedChat.livreurName}</h3>
                              <p className="text-[10px] font-black text-benin-green uppercase tracking-widest">Livreur en ligne</p>
                            </div>
                          </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-8 space-y-6 bg-slate-50/50">
                          {selectedChat.messages.map((msg, i) => {
                            const isMe = msg.senderId === 'admin';
                            return (
                              <div key={`msg-${i}`} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[70%] space-y-1 ${isMe ? 'items-end' : 'items-start'}`}>
                                  <div className={`p-4 rounded-[24px] text-sm font-medium shadow-sm ${
                                    isMe 
                                      ? 'bg-slate-900 text-white rounded-tr-none' 
                                      : 'bg-white text-slate-900 rounded-tl-none border border-slate-100'
                                  }`}>
                                    {msg.text}
                                  </div>
                                  <div className={`flex items-center gap-2 px-2 ${isMe ? 'flex-row-reverse' : ''}`}>
                                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">
                                      {msg.timestamp?.seconds ? new Date(msg.timestamp.seconds * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '...'}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div className="p-6 border-t border-slate-50">
                          <div className="flex gap-4">
                            <input 
                              type="text"
                              value={newMessage}
                              onChange={(e) => setNewMessage(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && sendAdminMessage()}
                              placeholder="Écrivez votre réponse..."
                              className="flex-1 bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-sm font-medium focus:ring-2 focus:ring-benin-green outline-none transition-all"
                            />
                            <button 
                              onClick={sendAdminMessage}
                              disabled={!newMessage.trim() || sendingMessage}
                              className="bg-benin-green text-white p-4 rounded-2xl shadow-xl shadow-benin-green/20 hover:bg-benin-green/90 transition-all active:scale-95 disabled:opacity-50"
                            >
                              {sendingMessage ? <Loader2 className="w-6 h-6 animate-spin" /> : <Send className="w-6 h-6" />}
                            </button>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6">
                        <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center">
                          <MessageSquare className="w-12 h-12 text-slate-200" />
                        </div>
                        <div className="max-w-xs">
                          <h3 className="text-xl font-black text-slate-900">Support Livreurs</h3>
                          <p className="text-sm text-slate-500 font-medium">Sélectionnez une conversation pour commencer à discuter avec un livreur.</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'settings' && (
                <div className="space-y-8 max-w-2xl">
                  <h2 className="text-3xl font-black text-slate-900 tracking-tight">Paramètres Généraux</h2>
                  
                  <div className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-sm space-y-8">
                    <div className="flex items-center gap-4">
                      <div className="p-4 bg-benin-green/10 rounded-2xl">
                        <Truck className="w-8 h-8 text-benin-green" />
                      </div>
                      <div>
                        <h3 className="text-xl font-black text-slate-900 tracking-tight">Frais de Livraison</h3>
                        <p className="text-xs text-slate-500 font-medium">Configurez le montant fixe des frais de livraison</p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Montant Fixe (FCFA)</label>
                        <div className="relative">
                          <DollarSign className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                          <input 
                            type="number" 
                            value={deliverySettings.fixedFee}
                            onChange={(e) => setDeliverySettings({ ...deliverySettings, fixedFee: parseInt(e.target.value) || 0 })}
                            className="w-full bg-slate-50 border border-slate-100 rounded-2xl pl-16 pr-6 py-5 text-lg font-black focus:ring-2 focus:ring-benin-green outline-none"
                          />
                        </div>
                      </div>
                      
                      <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 flex items-start gap-4">
                        <Info className="w-5 h-5 text-slate-400 mt-1" />
                        <p className="text-xs text-slate-500 font-medium leading-relaxed">
                          Ce montant sera appliqué à toutes les commandes passées sur l'application. 
                          Vous pourrez ultérieurement configurer des frais variables basés sur la distance.
                        </p>
                      </div>
                    </div>

                    <button 
                      onClick={saveDeliverySettings}
                      disabled={savingSettings}
                      className="w-full py-5 bg-benin-green text-white rounded-2xl font-black text-sm shadow-xl shadow-benin-green/20 hover:bg-benin-green/90 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                    >
                      {savingSettings ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <ShieldCheck className="w-5 h-5" />
                      )}
                      ENREGISTRER LES PARAMÈTRES
                    </button>
                  </div>

                  <div className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-sm space-y-8">
                    <div className="flex items-center gap-4">
                      <div className="p-4 bg-benin-yellow/10 rounded-2xl">
                        <Tag className="w-8 h-8 text-benin-yellow" />
                      </div>
                      <div>
                        <h3 className="text-2xl font-black text-slate-900 tracking-tight">Gestion des Unités</h3>
                        <p className="text-xs text-slate-500 font-medium">Ajoutez ou supprimez les unités de mesure disponibles.</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ID de l'unité (ex: kg, litre)</label>
                          <input 
                            type="text" 
                            value={newUnit.id}
                            onChange={(e) => setNewUnit({ ...newUnit, id: e.target.value })}
                            className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-sm font-black outline-none focus:ring-2 focus:ring-benin-yellow"
                            placeholder="kg"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Libellé (ex: kilo (kg))</label>
                          <input 
                            type="text" 
                            value={newUnit.label}
                            onChange={(e) => setNewUnit({ ...newUnit, label: e.target.value })}
                            className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-sm font-black outline-none focus:ring-2 focus:ring-benin-yellow"
                            placeholder="kilo (kg)"
                          />
                        </div>
                        <button 
                          onClick={addUnit}
                          disabled={savingUnit || !newUnit.id || !newUnit.label}
                          className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-xs hover:bg-black transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          {savingUnit ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                          AJOUTER L'UNITÉ
                        </button>
                      </div>

                      <div className="space-y-4">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Unités Actuelles</label>
                        <div className="space-y-2 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                          {units.map(u => (
                            <div key={u.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                              <div>
                                <p className="text-sm font-black text-slate-900">{u.label}</p>
                                <p className="text-[10px] text-slate-400 font-medium">ID: {u.id}</p>
                              </div>
                              <button 
                                onClick={() => deleteUnit(u.id)}
                                className="p-2 text-slate-300 hover:text-benin-red transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                          {units.length === 0 && (
                            <p className="text-center py-8 text-xs text-slate-400 italic">Aucune unité configurée</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Rejection Modal */}
      <AnimatePresence>
        {showRejectionModal && selectedDriver && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowRejectionModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-[40px] shadow-2xl p-10 space-y-8"
            >
              <div className="flex items-center gap-4">
                <div className="p-4 bg-benin-red/10 rounded-2xl">
                  <XCircle className="w-8 h-8 text-benin-red" />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight">Rejeter la candidature</h3>
                  <p className="text-xs text-slate-500 font-medium">Candidat: {selectedDriver.prenom} {selectedDriver.nom}</p>
                </div>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Motif du rejet (Obligatoire)</label>
                  <textarea 
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Expliquez pourquoi la candidature est refusée..."
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-6 text-sm font-medium focus:ring-2 focus:ring-benin-red outline-none min-h-[120px]"
                  />
                </div>

                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${inviteLater ? 'bg-benin-green border-benin-green' : 'border-slate-200 group-hover:border-benin-green'}`}>
                    {inviteLater && <CheckCircle className="w-4 h-4 text-white" />}
                  </div>
                  <input 
                    type="checkbox" 
                    className="hidden" 
                    checked={inviteLater}
                    onChange={() => setInviteLater(!inviteLater)}
                  />
                  <span className="text-xs font-black text-slate-600">Envoyer une invitation à postuler plus tard</span>
                </label>
              </div>

              <div className="flex gap-4">
                <button 
                  onClick={() => setShowRejectionModal(false)}
                  className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black text-xs hover:bg-slate-200 transition-all"
                >
                  ANNULER
                </button>
                <button 
                  onClick={rejectDriver}
                  disabled={!rejectionReason}
                  className="flex-2 py-4 bg-benin-red text-white rounded-2xl font-black text-xs shadow-xl shadow-benin-red/20 hover:bg-benin-red/90 transition-all disabled:opacity-50"
                >
                  CONFIRMER LE REJET
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Interview Modal */}
      <AnimatePresence>
        {showInterviewModal && selectedDriver && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowInterviewModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-[40px] shadow-2xl p-10 space-y-8 overflow-y-auto max-h-[90vh]"
            >
              <div className="flex items-center gap-4">
                <div className="p-4 bg-benin-yellow/10 rounded-2xl">
                  <CalendarCheck className="w-8 h-8 text-benin-yellow" />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight">Programmer un entretien</h3>
                  <p className="text-xs text-slate-500 font-medium">Candidat: {selectedDriver.prenom} {selectedDriver.nom}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</label>
                  <input 
                    type="date" 
                    value={interviewDate}
                    onChange={(e) => setInterviewDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-sm font-black focus:ring-2 focus:ring-benin-yellow outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Heure</label>
                  <input 
                    type="time" 
                    value={interviewTime}
                    onChange={(e) => setInterviewTime(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-sm font-black focus:ring-2 focus:ring-benin-yellow outline-none"
                  />
                </div>
                <div className="md:col-span-2 space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Adresse de l'agence</label>
                  <input 
                    type="text" 
                    value={agencyAddress}
                    onChange={(e) => setAgencyAddress(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-sm font-black focus:ring-2 focus:ring-benin-yellow outline-none"
                  />
                </div>
                <div className="md:col-span-2 space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Téléphone de contact</label>
                  <input 
                    type="text" 
                    value={agencyPhone}
                    onChange={(e) => setAgencyPhone(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-sm font-black focus:ring-2 focus:ring-benin-yellow outline-none"
                  />
                </div>
                <div className="md:col-span-2 space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Message personnalisé</label>
                  <textarea 
                    value={interviewMessage}
                    onChange={(e) => setInterviewMessage(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-6 text-sm font-medium focus:ring-2 focus:ring-benin-yellow outline-none min-h-[100px]"
                  />
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  onClick={() => setShowInterviewModal(false)}
                  className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black text-xs hover:bg-slate-200 transition-all"
                >
                  ANNULER
                </button>
                <button 
                  onClick={scheduleInterview}
                  disabled={!interviewDate || !interviewTime}
                  className="flex-2 py-4 bg-benin-yellow text-slate-900 rounded-2xl font-black text-xs shadow-xl shadow-benin-yellow/20 hover:bg-benin-yellow/90 transition-all disabled:opacity-50"
                >
                  CONFIRMER LE RENDEZ-VOUS
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete User Modal */}
      <AnimatePresence>
        {showDeleteUserModal && selectedUserToDelete && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !deletingUser && setShowDeleteUserModal(false)}
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
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight">Supprimer le compte</h3>
                  <p className="text-xs text-slate-500 font-medium">Action irréversible</p>
                </div>
              </div>

              <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                <p className="text-sm text-slate-600 font-medium leading-relaxed">
                  Êtes-vous sûr de vouloir supprimer définitivement le compte de <span className="font-black text-slate-900">{selectedUserToDelete.displayName || selectedUserToDelete.email}</span> ?
                  <br /><br />
                  Toutes ses données personnelles, documents et fichiers seront effacés. Les commandes seront conservées anonymement.
                </p>
              </div>

              <div className="flex gap-4">
                <button 
                  onClick={() => setShowDeleteUserModal(false)}
                  disabled={deletingUser}
                  className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black text-xs hover:bg-slate-200 transition-all disabled:opacity-50"
                >
                  ANNULER
                </button>
                <button 
                  onClick={deleteUserAccount}
                  disabled={deletingUser}
                  className="flex-2 py-4 bg-benin-red text-white rounded-2xl font-black text-xs shadow-xl shadow-benin-red/20 hover:bg-benin-red/90 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {deletingUser ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  SUPPRIMER DÉFINITIVEMENT
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
