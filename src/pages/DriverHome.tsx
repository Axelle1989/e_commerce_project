import { useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, getDoc, runTransaction, serverTimestamp, getDocs, addDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Order, UserProfile, GeoPoint } from '../types';
import { Truck, MapPin, Package, ArrowRight, Loader2, Navigation, TrendingUp, Star, Wallet, Map as MapIcon, List, Bell } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { reverseGeocode, getDistance } from '../lib/geocoding';

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
  const lastGeocodedLocation = useRef<{lat: number, lng: number, address: string} | null>(null);
  const navigate = useNavigate();
  const locationInterval = useRef<any>(null);

  useEffect(() => {
    if (!auth.currentUser) return;
    
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
            await updateDoc(doc(db, 'users', auth.currentUser.uid), {
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
          });
        }
      }
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
      if (locationInterval.current) clearInterval(locationInterval.current);
    };
  }, []);

  const totalEarnings = completedOrders.reduce((sum, o) => sum + (o.deliveryFee || 1000), 0);

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
      // alert(error);
      console.error('Accept order error:', error);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin h-10 w-10 text-benin-green" /></div>;

  return (
    <div className="max-w-4xl mx-auto space-y-10 pb-20">
      {/* Driver Stats Header */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-900 text-white p-8 rounded-[40px] shadow-2xl shadow-slate-900/20 space-y-4 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-benin-green/10 rounded-full blur-2xl -mr-12 -mt-12"></div>
          <div className="flex items-center gap-3 text-slate-400">
            <Wallet className="w-5 h-5" />
            <span className="text-[10px] font-black uppercase tracking-widest">Mes Gains</span>
          </div>
          <p className="text-3xl font-black text-benin-green">{totalEarnings} FCFA</p>
          <p className="text-[10px] text-slate-500 font-medium">{completedOrders.length} courses terminées</p>
        </div>

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

        <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm space-y-4 flex flex-col justify-center items-center text-center">
          <div className="w-16 h-16 bg-slate-50 rounded-2xl overflow-hidden border border-slate-100 shadow-sm">
            {driverProfile?.photoURL ? (
              <img src={driverProfile.photoURL} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-benin-yellow text-white">
                <Truck className="w-8 h-8" />
              </div>
            )}
          </div>
          <div>
            <p className="text-xl font-black text-slate-900">{driverProfile?.displayName || 'Livreur'}</p>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">En ligne</p>
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
        <div className="h-[600px] bg-white rounded-[40px] border border-slate-100 shadow-2xl overflow-hidden relative z-10">
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

                <div className="w-full max-w-2xl grid grid-cols-1 md:grid-cols-2 gap-6 mt-10">
                  {[
                    {
                      title: "Soyez rapide",
                      desc: "Acceptez les commandes dès qu'elles apparaissent pour maximiser vos gains.",
                      img: "https://images.unsplash.com/photo-1626228636612-b10f22839487?auto=format&fit=crop&q=80&w=800"
                    },
                    {
                      title: "Service 5 étoiles",
                      desc: "Un bon service client vous garantit de meilleurs pourboires.",
                      img: "https://images.unsplash.com/photo-1516733725897-1aa73b87c8e8?auto=format&fit=crop&q=80&w=800"
                    }
                  ].map((tip, i) => (
                    <div key={i} className="bg-white rounded-3xl overflow-hidden border border-slate-100 shadow-sm group">
                      <div className="h-24 overflow-hidden">
                        <img src={tip.img} alt={tip.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                      </div>
                      <div className="p-4 space-y-1">
                        <h4 className="font-black text-slate-900 text-xs">{tip.title}</h4>
                        <p className="text-[10px] text-slate-500 font-medium leading-relaxed">{tip.desc}</p>
                      </div>
                    </div>
                  ))}
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

                      <div className="pt-6 border-t border-slate-50">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Articles & Prix Proposés</p>
                        <div className="space-y-3">
                          {order.items.map((item, i) => (
                            <div key={`${item.name}-${i}`} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                              <div>
                                <p className="text-xs font-black text-slate-900">{item.quantity}x {item.name}</p>
                                <p className="text-[10px] text-slate-400 font-medium">{item.proposedPricePerUnit} FCFA</p>
                              </div>
                              <p className="text-xs font-black text-benin-green">{item.total} FCFA</p>
                            </div>
                          ))}
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
    </div>
  );
}
