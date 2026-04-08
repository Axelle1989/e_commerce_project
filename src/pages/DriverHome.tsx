import { useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, getDoc, runTransaction, serverTimestamp, getDocs, addDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Order, UserProfile, GeoPoint } from '../types';
import { Truck, MapPin, Package, ArrowRight, Loader2, Navigation, TrendingUp, Star, Wallet, Map as MapIcon, List, Bell, MessageSquare, Send, Clock, User, CheckCircle, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { reverseGeocode, getDistance } from '../lib/geocoding';
import { AdminChat, AdminChatMessage } from '../types';
import { BENIN_IMAGES } from '../constants/images';
import ImageWithFallback from '../components/ImageWithFallback';

// Fix Leaflet icon issue using CDN
const DefaultIcon = L.icon({
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

const blueIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const redIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

function ChangeView({ center }: { center: [number, number] }) {
  const map = useMap();
  map.setView(center, 13);
  return null;
}

// Haversine distance in km
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

export default function DriverHome() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [driverProfile, setDriverProfile] = useState<UserProfile | null>(null);
  const [completedOrders, setCompletedOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [currentLocation, setCurrentLocation] = useState<GeoPoint | null>(null);
  const [activeTab, setActiveTab] = useState<'missions' | 'gains' | 'chat'>('missions');
  const [adminChat, setAdminChat] = useState<AdminChat | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const lastGeocodedLocation = useRef<{lat: number, lng: number, address: string} | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const locationInterval = useRef<any>(null);

  useEffect(() => {
    if (activeTab === 'chat' && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeTab, adminChat?.messages]);

  useEffect(() => {
    if (!auth.currentUser) return;
    
    // Listen to Admin Chat
    const chatQuery = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', auth.currentUser.uid)
    );

    const unsubscribeChat = onSnapshot(chatQuery, (snapshot) => {
      if (!snapshot.empty) {
        const chatDoc = snapshot.docs[0];
        setAdminChat({ id: chatDoc.id, ...chatDoc.data() } as AdminChat);
        
        // Mark as read if active
        if (activeTab === 'chat') {
          const data = chatDoc.data() as AdminChat;
          if (data.unreadCountLivreur > 0) {
            updateDoc(doc(db, 'chats', chatDoc.id), {
              unreadCountLivreur: 0
            });
          }
        }
      }
    });

    // Fetch driver profile
    const fetchProfile = async () => {
      const docSnap = await getDoc(doc(db, 'users', auth.currentUser!.uid));
      if (docSnap.exists()) {
        const data = docSnap.data() as UserProfile;
        setDriverProfile({ uid: docSnap.id, ...data } as UserProfile);
        if (data.currentLocation) setCurrentLocation(data.currentLocation);
      }
    };
    fetchProfile();

    // Location tracking
    const updateLocation = () => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(async (pos) => {
          const { latitude, longitude, accuracy } = pos.coords;
          
          let address = lastGeocodedLocation.current?.address || '';
          const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

          // Only reverse geocode if moved > 50m or no address yet
          if (!lastGeocodedLocation.current || getDistance(latitude, longitude, lastGeocodedLocation.current.lat, lastGeocodedLocation.current.lng) > 50) {
            address = await reverseGeocode(latitude, longitude, apiKey);
            lastGeocodedLocation.current = { lat: latitude, lng: longitude, address };
          }

          const newLoc = { 
            latitude, 
            longitude, 
            accuracy,
            address,
            updatedAt: new Date().toISOString()
          };
          setCurrentLocation(newLoc);
          
          if (auth.currentUser) {
            updateDoc(doc(db, 'users', auth.currentUser.uid), {
              currentLocation: newLoc
            });
          }
        }, (err) => {
          console.error("DriverHome geolocation error:", err);
        }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
      }
    };

    updateLocation();
    locationInterval.current = setInterval(updateLocation, 5000); // Every 5s

    let unsubscribePending: (() => void) | null = null;

    const qActive = query(
      collection(db, 'orders'),
      where('driverId', '==', auth.currentUser.uid),
      where('status', 'in', ['accepted', 'at_market', 'delivering'])
    );

    const unsubscribeActive = onSnapshot(qActive, (activeSnap) => {
      if (!activeSnap.empty) {
        // Driver has an active order
        if (unsubscribePending) {
          unsubscribePending();
          unsubscribePending = null;
        }
        const activeData = { id: activeSnap.docs[0].id, ...activeSnap.docs[0].data() } as Order;
        setActiveOrder(activeData);
        setOrders([activeData]);
        setLoading(false);
      } else {
        // No active order, listen to pending ones
        setActiveOrder(null);
        if (!unsubscribePending) {
          const qPending = query(collection(db, 'orders'), where('status', '==', 'pending'));
          unsubscribePending = onSnapshot(qPending, (pendingSnap) => {
            const ordersData = pendingSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
            setOrders(ordersData);
            setLoading(false);
          }, (error) => {
            console.error("DriverHome pending snapshot error:", error);
            setLoading(false);
          });
        }
      }
    }, (error) => {
      console.error("DriverHome active snapshot error:", error);
      setLoading(false);
    });

    // Fetch completed orders for earnings
    const qCompleted = query(
      collection(db, 'orders'), 
      where('driverId', '==', auth.currentUser.uid),
      where('status', '==', 'delivered')
    );
    const unsubscribeCompleted = onSnapshot(qCompleted, (snapshot) => {
      const completedData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
      setCompletedOrders(completedData);
    });

    return () => {
      unsubscribeActive();
      if (unsubscribePending) unsubscribePending();
      unsubscribeCompleted();
      unsubscribeChat();
      if (locationInterval.current) clearInterval(locationInterval.current);
    };
  }, [activeTab]);

  const totalEarnings = driverProfile?.totalGains || 0;
  const currentSolde = driverProfile?.solde || 0;

  const sendMessage = async () => {
    if (!newMessage.trim() || !auth.currentUser || !driverProfile) return;
    setSendingMessage(true);
    try {
      const message: AdminChatMessage = {
        senderId: auth.currentUser.uid,
        text: newMessage.trim(),
        timestamp: serverTimestamp(),
        read: false
      };

      if (adminChat) {
        await updateDoc(doc(db, 'chats', adminChat.id), {
          messages: [...adminChat.messages, message],
          lastMessage: newMessage.trim(),
          lastUpdated: serverTimestamp(),
          unreadCountAdmin: (adminChat.unreadCountAdmin || 0) + 1
        });
      } else {
        // Create new chat with admin
        await addDoc(collection(db, 'chats'), {
          participants: [auth.currentUser.uid, 'admin'],
          livreurId: auth.currentUser.uid,
          livreurName: driverProfile.displayName || `${driverProfile.prenom} ${driverProfile.nom}`,
          livreurPhoto: driverProfile.photoURL || '',
          messages: [message],
          lastMessage: newMessage.trim(),
          lastUpdated: serverTimestamp(),
          unreadCountAdmin: 1,
          unreadCountLivreur: 0
        });
      }
      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setSendingMessage(false);
    }
  };

  const acceptOrder = async (orderId: string) => {
    if (!auth.currentUser || !driverProfile) return;
    
    try {
      await runTransaction(db, async (transaction) => {
        // Check if driver already has an active order inside transaction
        const qActive = query(
          collection(db, 'orders'),
          where('driverId', '==', auth.currentUser!.uid),
          where('status', 'in', ['accepted', 'at_market', 'delivering'])
        );
        const activeOrdersSnap = await getDocs(qActive);
        if (!activeOrdersSnap.empty) {
          throw "Vous avez déjà une commande en cours.";
        }

        const orderRef = doc(db, 'orders', orderId);
        const orderSnap = await transaction.get(orderRef);
        
        if (!orderSnap.exists()) throw "La commande n'existe plus.";
        if (orderSnap.data().status !== 'pending') throw "Cette commande a déjà été acceptée par un autre livreur.";
        
        const driverName = driverProfile.displayName || `${driverProfile.prenom} ${driverProfile.nom}`;
        
        transaction.update(orderRef, {
          status: 'accepted',
          driverId: auth.currentUser!.uid,
          driverName: driverName,
          driverLocation: currentLocation || { latitude: 6.3654, longitude: 2.4183 },
          acceptedAt: serverTimestamp()
        });

        // Add notification for the client
        const notificationRef = doc(collection(db, 'notifications'));
        transaction.set(notificationRef, {
          orderId: orderId,
          userId: orderSnap.data().userId,
          driverId: auth.currentUser!.uid,
          type: 'accepted',
          message: `Votre commande a été acceptée par ${driverName}`,
          timestamp: serverTimestamp(),
          read: false
        });
      });
      
      navigate(`/driver/active/${orderId}`);
    } catch (error) {
      console.error('Accept order error:', error);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin h-10 w-10 text-benin-green" /></div>;

  return (
    <div className="max-w-4xl mx-auto space-y-10 pb-20">
      {/* Tab Navigation */}
      <div className="flex bg-white p-2 rounded-[32px] border border-slate-100 shadow-sm sticky top-4 z-[1100]">
        {[
          { id: 'missions', label: 'Missions', icon: Package },
          { id: 'gains', label: 'Gains', icon: Wallet },
          { id: 'chat', label: 'Chat Admin', icon: MessageSquare, badge: adminChat?.unreadCountLivreur }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex-1 flex items-center justify-center gap-3 py-4 rounded-2xl text-xs font-black uppercase tracking-widest transition-all relative ${
              activeTab === tab.id 
                ? 'bg-slate-900 text-white shadow-xl shadow-slate-900/20' 
                : 'text-slate-400 hover:bg-slate-50'
            }`}
          >
            <tab.icon className="w-5 h-5" />
            <span className="hidden md:inline">{tab.label}</span>
            {tab.badge !== undefined && tab.badge > 0 && (
              <span className="absolute top-3 right-4 w-5 h-5 bg-benin-red text-white text-[10px] flex items-center justify-center rounded-full border-2 border-white">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'missions' && (
          <motion.div
            key="missions"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-10"
          >
            {/* Driver Stats Header (Simplified for Missions) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm space-y-4">
                <div className="flex items-center gap-3 text-slate-400">
                  <Star className="w-5 h-5 text-benin-yellow" />
                  <span className="text-[10px] font-black uppercase tracking-widest">Ma Note</span>
                </div>
                <p className="text-3xl font-black text-slate-900">{driverProfile?.noteMoyenne?.toFixed(1) || '5.0'}</p>
                <div className="flex gap-1">
                  {[1,2,3,4,5].map(i => <Star key={`star-${i}`} className={`w-3 h-3 ${i <= Math.round(driverProfile?.noteMoyenne || 5) ? 'fill-benin-yellow text-benin-yellow' : 'text-slate-100'}`} />)}
                </div>
              </div>

              <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm flex items-center gap-6">
                <div className="w-16 h-16 bg-slate-50 rounded-2xl overflow-hidden border border-slate-100 shadow-sm">
                  {driverProfile?.photoURL ? (
                    <ImageWithFallback src={driverProfile.photoURL} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-benin-yellow text-white">
                      <Truck className="w-8 h-8" />
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-xl font-black text-slate-900">{driverProfile?.displayName || 'Livreur'}</p>
                  <p className="text-[10px] font-black text-benin-green uppercase tracking-widest">En ligne • {completedOrders.length} missions</p>
                </div>
              </div>
            </div>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-2">
                <h2 className="text-4xl font-black text-slate-900 tracking-tighter">
                  {activeOrder ? 'Votre Commande en Cours' : 'Commandes Disponibles'}
                </h2>
                <p className="text-slate-500 font-medium">
                  {activeOrder ? 'Terminez cette livraison pour en voir d\'autres.' : 'Nouvelles opportunités à proximité.'}
                </p>
              </div>
              
              {!activeOrder && (
                <div className="flex bg-white p-1 rounded-2xl border border-slate-100 shadow-sm">
                  <button 
                    onClick={() => setViewMode('list')}
                    className={`flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-black transition-all ${viewMode === 'list' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    <List className="w-4 h-4" /> Liste
                  </button>
                  <button 
                    onClick={() => setViewMode('map')}
                    className={`flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-black transition-all ${viewMode === 'map' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    <MapIcon className="w-4 h-4" /> Carte
                  </button>
                </div>
              )}
            </div>

            {viewMode === 'map' ? (
              <div 
                onClick={() => setViewMode('map')}
                className="h-[300px] md:h-[400px] bg-white rounded-[40px] border border-slate-100 overflow-hidden relative"
              >
                <MapContainer center={currentLocation ? [currentLocation.latitude, currentLocation.longitude] : [6.3654, 2.4183]} zoom={13} style={{ height: '100%', width: '100%' }}>
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  />
                  
                  {currentLocation && (
                    <Marker position={[currentLocation.latitude, currentLocation.longitude]} icon={blueIcon}>
                      <Popup>Vous êtes ici</Popup>
                    </Marker>
                  )}

                  {orders.map(order => (
                    <Marker 
                      key={order.id} 
                      position={[order.userLocation.latitude, order.userLocation.longitude]} 
                      icon={redIcon}
                    >
                      <Popup>
                        <div className="p-2 space-y-3 min-w-[200px]">
                          <p className="font-black text-slate-900 text-lg">{order.totalAmount} FCFA</p>
                          <p className="text-xs text-slate-500">{order.userLocation.address}</p>
                          <button 
                            onClick={() => acceptOrder(order.id)}
                            className="w-full bg-benin-green text-white py-2 rounded-lg font-black text-[10px] uppercase tracking-widest"
                          >
                            Accepter
                          </button>
                        </div>
                      </Popup>
                    </Marker>
                  ))}
                  
                  {currentLocation && <ChangeView center={[currentLocation.latitude, currentLocation.longitude]} />}
                </MapContainer>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <AnimatePresence mode="popLayout">
                  {orders.length === 0 ? (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="col-span-full py-24 bg-white rounded-[40px] border border-slate-100 border-dashed flex flex-col items-center justify-center gap-6"
                    >
                      <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center">
                        <Package className="w-10 h-10 text-slate-200" />
                      </div>
                      <div className="text-center space-y-2">
                        <p className="text-slate-900 font-black text-xl">Calme plat pour le moment</p>
                        <p className="text-slate-400 font-medium">Les nouvelles commandes apparaîtront ici en temps réel.</p>
                      </div>
                    </motion.div>
                  ) : (
                    orders.map(order => {
                      const distance = currentLocation ? calculateDistance(
                        currentLocation.latitude, currentLocation.longitude,
                        order.userLocation.latitude, order.userLocation.longitude
                      ) : null;

                      return (
                        <motion.div
                          key={order.id}
                          layout
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className="bg-white rounded-[40px] border border-slate-100 shadow-xl shadow-slate-200/20 overflow-hidden flex flex-col group hover:shadow-2xl transition-all"
                        >
                          <div className="p-8 flex-1 space-y-8">
                            <div className="flex justify-between items-start">
                              <div className="space-y-1">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total à Gagner (Min)</p>
                                <p className="text-3xl font-black text-slate-900">{order.totalAmount} FCFA</p>
                                <p className="text-[10px] text-benin-green font-black uppercase tracking-widest">Inclut {order.deliveryFee}F de livraison</p>
                              </div>
                              <div className="bg-benin-green p-4 rounded-2xl shadow-lg shadow-benin-green/20">
                                <TrendingUp className="w-6 h-6 text-white" />
                              </div>
                            </div>

                            <div className="space-y-6">
                              <div className="flex items-start gap-4">
                                <div className="w-10 h-10 rounded-xl bg-benin-green/10 flex items-center justify-center shrink-0 border border-benin-green/20">
                                  <MapPin className="w-5 h-5 text-benin-green" />
                                </div>
                                <div className="space-y-0.5">
                                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Destination</p>
                                  <p className="text-sm font-black text-slate-900">{order.userLocation.address || 'Adresse de livraison'}</p>
                                  {distance !== null && (
                                    <p className="text-[10px] font-black text-benin-yellow uppercase tracking-widest">À {distance.toFixed(1)} km</p>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="flex border-t border-slate-100">
                            {activeOrder?.id === order.id ? (
                              <button
                                onClick={() => navigate(`/driver/active/${order.id}`)}
                                className="flex-1 bg-benin-green text-white py-6 font-black hover:bg-benin-green/90 transition-all flex items-center justify-center gap-3 active:scale-95"
                              >
                                Continuer la livraison
                                <ArrowRight className="w-5 h-5" />
                              </button>
                            ) : (
                              <>
                                <button
                                  onClick={() => setViewMode('map')}
                                  className="flex-1 bg-white text-slate-900 py-6 font-black hover:bg-slate-50 transition-all flex items-center justify-center gap-3 active:scale-95 border-r border-slate-100"
                                >
                                  <MapIcon className="w-5 h-5" />
                                  Carte
                                </button>
                                <button
                                  onClick={() => acceptOrder(order.id)}
                                  className="flex-[2] bg-slate-900 text-white py-6 font-black hover:bg-black transition-all flex items-center justify-center gap-3 active:scale-95"
                                >
                                  Accepter
                                  <ArrowRight className="w-5 h-5" />
                                </button>
                              </>
                            )}
                          </div>
                        </motion.div>
                      );
                    })
                  )}
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        )}

        {activeTab === 'gains' && (
          <motion.div
            key="gains"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-10"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="bg-slate-900 text-white p-10 rounded-[48px] shadow-2xl shadow-slate-900/20 space-y-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-48 h-48 bg-benin-green/10 rounded-full blur-3xl -mr-24 -mt-24"></div>
                <div className="flex items-center gap-3 text-slate-400">
                  <Wallet className="w-6 h-6" />
                  <span className="text-xs font-black uppercase tracking-widest">Solde Actuel</span>
                </div>
                <p className="text-5xl font-black text-benin-green">{currentSolde} FCFA</p>
                <button className="w-full py-5 bg-benin-green text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-benin-green/20 hover:bg-benin-green/90 transition-all active:scale-95">
                  Demander un retrait
                </button>
              </div>

              <div className="bg-white p-10 rounded-[48px] border border-slate-100 shadow-sm space-y-6">
                <div className="flex items-center gap-3 text-slate-400">
                  <TrendingUp className="w-6 h-6 text-benin-yellow" />
                  <span className="text-xs font-black uppercase tracking-widest">Gains Totaux</span>
                </div>
                <p className="text-5xl font-black text-slate-900">{totalEarnings} FCFA</p>
                <p className="text-sm text-slate-500 font-medium">Cumul de toutes vos missions terminées</p>
              </div>
            </div>

            <div className="space-y-6">
              <h3 className="text-2xl font-black text-slate-900 tracking-tight">Historique des Gains</h3>
              <div className="space-y-4">
                {completedOrders.length === 0 ? (
                  <div className="py-20 text-center bg-white rounded-[40px] border border-slate-100 border-dashed">
                    <p className="text-slate-400 font-medium italic">Aucun gain enregistré pour le moment.</p>
                  </div>
                ) : (
                  completedOrders.map(order => (
                    <div key={order.id} className="bg-white p-6 rounded-3xl border border-slate-100 flex items-center justify-between group hover:shadow-lg transition-all">
                      <div className="flex items-center gap-5">
                        <div className="w-12 h-12 bg-benin-green/10 rounded-2xl flex items-center justify-center text-benin-green">
                          <CheckCircle className="w-6 h-6" />
                        </div>
                        <div>
                          <p className="font-black text-slate-900">Mission #{order.id.slice(-6)}</p>
                          <p className="text-xs text-slate-500 font-medium">
                            {order.deliveredAt?.seconds ? new Date(order.deliveredAt.seconds * 1000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Date inconnue'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-black text-benin-green">+{order.deliveryFee || 1000} FCFA</p>
                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Livraison</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'chat' && (
          <motion.div
            key="chat"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-white rounded-[48px] border border-slate-100 shadow-2xl overflow-hidden flex flex-col h-[700px]"
          >
            {/* Chat Header */}
            <div className="p-8 bg-slate-900 text-white flex items-center gap-4">
              <div className="w-12 h-12 bg-benin-green rounded-2xl flex items-center justify-center">
                <ShieldCheck className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="font-black text-lg">Support Administrateur</h3>
                <p className="text-[10px] font-black text-benin-green uppercase tracking-widest">En ligne • Réponse rapide</p>
              </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-8 space-y-6 bg-slate-50">
              {(!adminChat || adminChat.messages.length === 0) ? (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
                  <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-sm">
                    <MessageSquare className="w-10 h-10 text-slate-200" />
                  </div>
                  <div className="max-w-xs">
                    <p className="text-slate-900 font-black">Besoin d'aide ?</p>
                    <p className="text-xs text-slate-500 font-medium">Envoyez un message à l'administration pour toute question ou problème.</p>
                  </div>
                </div>
              ) : (
                adminChat.messages.map((msg, i) => {
                  const isMe = msg.senderId === auth.currentUser?.uid;
                  return (
                    <div key={i} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] space-y-1 ${isMe ? 'items-end' : 'items-start'}`}>
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
                          {isMe && (
                            <span className={`text-[8px] font-black uppercase tracking-widest ${msg.read ? 'text-benin-green' : 'text-slate-300'}`}>
                              {msg.read ? 'Lu' : 'Envoyé'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-6 bg-white border-t border-slate-100">
              <div className="flex gap-4">
                <input 
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                  placeholder="Écrivez votre message ici..."
                  className="flex-1 bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-sm font-medium focus:ring-2 focus:ring-benin-green outline-none transition-all"
                />
                <button 
                  onClick={sendMessage}
                  disabled={!newMessage.trim() || sendingMessage}
                  className="bg-benin-green text-white p-4 rounded-2xl shadow-xl shadow-benin-green/20 hover:bg-benin-green/90 transition-all active:scale-95 disabled:opacity-50"
                >
                  {sendingMessage ? <Loader2 className="w-6 h-6 animate-spin" /> : <Send className="w-6 h-6" />}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
