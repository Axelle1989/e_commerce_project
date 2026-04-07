import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, onSnapshot, updateDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Order, OrderStatus, GeoPoint } from '../types';
import { MapPin, Truck, Store, CheckCircle2, Navigation, Bell, Phone, MessageSquare, Loader2, ArrowRight, CheckCircle, TrendingUp, ShieldAlert, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useLiveLocation } from '../hooks/useLiveLocation';
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

const greenIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

function ChangeView({ center }: { center: [number, number] }) {
  const map = useMap();
  map.setView(center, 14);
  return null;
}

export default function DriverActive() {
  const { orderId } = useParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<GeoPoint | null>(null);
  const lastGeocodedLocation = useRef<{lat: number, lng: number, address: string} | null>(null);
  const navigate = useNavigate();

  const [marketName, setMarketName] = useState('Marché au choix du livreur');
  const [showDefaultLocationMsg, setShowDefaultLocationMsg] = useState(false);
  
  const { location, error: locationError, requestPermission, permissionStatus } = useLiveLocation(order?.status);

  useEffect(() => {
    if (permissionStatus === 'granted' && !location) {
      const timer = setTimeout(() => {
        setShowDefaultLocationMsg(true);
      }, 10000);
      return () => clearTimeout(timer);
    } else {
      setShowDefaultLocationMsg(false);
    }
  }, [permissionStatus, location]);

  useEffect(() => {
    if (!orderId || !auth.currentUser) return;
    
    const unsubscribe = onSnapshot(doc(db, 'orders', orderId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as Order;
        setOrder({ id: docSnap.id, ...data } as Order);
        if (data.marketName) setMarketName(data.marketName);
      }
      setLoading(false);
    }, (error) => {
      console.error('DriverActive onSnapshot error:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [orderId]);

  useEffect(() => {
    if (location) {
      const updateLocationInFirestore = async () => {
        let address = lastGeocodedLocation.current?.address || '';
        const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

        // Only reverse geocode if moved > 50m or no address yet
        if (!lastGeocodedLocation.current || getDistance(location.latitude, location.longitude, lastGeocodedLocation.current.lat, lastGeocodedLocation.current.lng) > 50) {
          address = await reverseGeocode(location.latitude, location.longitude, apiKey);
          lastGeocodedLocation.current = { lat: location.latitude, lng: location.longitude, address };
        }

        const locationWithAddress = { ...location, address };
        setCurrentLocation(locationWithAddress);

        // Update Firestore
        if (auth.currentUser && orderId) {
          updateDoc(doc(db, 'orders', orderId), {
            driverLocation: locationWithAddress
          });
          updateDoc(doc(db, 'users', auth.currentUser.uid), {
            currentLocation: locationWithAddress
          });
        }
      };

      updateLocationInFirestore();
    }
  }, [location, orderId]);

  const updateStatus = async (newStatus: OrderStatus, message: string) => {
    if (!orderId || !order || !auth.currentUser) return;

    setUpdating(true);
    
    // Use current location from hook if available, otherwise try to get it
    const loc = location || currentLocation;

    try {
      const updateData: any = { status: newStatus };
      if (newStatus === 'at_market') {
        updateData.marketReachedAt = serverTimestamp();
        updateData.marketReachedLocation = loc;
        updateData.marketName = marketName.trim() || 'Marché au choix du livreur';
      }
      if (newStatus === 'delivering') {
        updateData.departureAt = serverTimestamp();
        updateData.departureLocation = loc;
        if (loc) updateData.driverLocation = loc;
      }
      if (newStatus === 'delivered') {
        updateData.deliveredAt = serverTimestamp();
        updateData.deliveredLocation = loc;
      }

      await updateDoc(doc(db, 'orders', orderId), updateData);

      // Add notification
      await addDoc(collection(db, 'notifications'), {
        orderId,
        userId: order.userId,
        driverId: auth.currentUser.uid,
        type: newStatus,
        message: message.replace('{market}', marketName || 'local'),
        timestamp: serverTimestamp(),
        sent: true
      });

      if (newStatus === 'delivered') {
        setTimeout(() => navigate('/driver'), 2000);
      }
    } catch (error) {
      console.error('Update status error:', error);
    } finally {
      setUpdating(false);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin h-10 w-10 text-benin-green" /></div>;
  if (!order) return <div className="text-center py-20 text-slate-500 font-black">Commande introuvable</div>;

  const buttons = [
    { 
      id: 'at_market', 
      label: 'Je suis au marché', 
      status: 'at_market', 
      message: `Le livreur est arrivé au marché {market}`,
      icon: Store, 
      color: 'bg-benin-green',
      active: order.status === 'accepted'
    },
    { 
      id: 'delivering', 
      label: 'En route vers le client', 
      status: 'delivering', 
      message: `Le livreur a quitté le marché {market} et vient vers vous`,
      icon: Navigation, 
      color: 'bg-benin-yellow',
      active: order.status === 'at_market'
    },
    { 
      id: 'delivered', 
      label: 'Livré', 
      status: 'delivered', 
      message: 'Le livreur est arrivé à votre adresse',
      icon: MapPin, 
      color: 'bg-benin-red',
      active: order.status === 'delivering'
    }
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-10 pb-20">
      <AnimatePresence>
        {(permissionStatus === 'prompt' || permissionStatus === 'denied' || locationError) && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/80 backdrop-blur-sm"
          >
            <div className="bg-white rounded-[40px] p-10 max-w-md w-full text-center space-y-8 shadow-2xl">
              <div className="w-20 h-20 bg-benin-green/10 rounded-3xl flex items-center justify-center mx-auto text-benin-green">
                {permissionStatus === 'denied' ? <ShieldAlert className="w-10 h-10 text-benin-red" /> : <Navigation className="w-10 h-10" />}
              </div>
              <div className="space-y-3">
                <h3 className="text-2xl font-black text-slate-900 tracking-tight">
                  {permissionStatus === 'denied' ? "Accès Refusé" : "Géolocalisation Requise"}
                </h3>
                <p className="text-slate-500 font-medium leading-relaxed">
                  {permissionStatus === 'denied' 
                    ? "Vous avez refusé l'accès à votre position. Veuillez l'activer dans les paramètres de votre navigateur pour continuer la livraison."
                    : "Nous avons besoin de votre position en temps réel pour que le client puisse suivre sa commande et pour valider vos étapes de livraison."}
                </p>
                {locationError && <p className="text-benin-red text-xs font-bold">{locationError}</p>}
              </div>
              <button
                onClick={requestPermission}
                className="w-full py-5 bg-benin-green text-white rounded-2xl font-black flex items-center justify-center gap-3 hover:bg-benin-green/90 transition-all active:scale-95 shadow-xl shadow-benin-green/20"
              >
                <RefreshCw className="w-5 h-5" />
                {permissionStatus === 'denied' ? "Réessayer" : "Autoriser l'accès"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col md:flex-row gap-10">
        {/* Left: Map Visual */}
        <div className="flex-1 space-y-8">
          <div className="bg-white p-10 rounded-[48px] border border-slate-100 shadow-xl shadow-slate-200/20">
              <div className="flex items-center justify-between mb-10">
                <div className="space-y-1">
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight">Livraison en Cours</h2>
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-widest">Cotonou, Bénin</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="flex items-center gap-3 px-4 py-2 bg-benin-green/10 text-benin-green rounded-full text-[10px] font-black uppercase tracking-widest animate-pulse border border-benin-green/20">
                    <span className="w-2 h-2 bg-benin-green rounded-full"></span>
                    En Direct
                  </div>
                  {currentLocation?.accuracy && (
                    <div className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest flex items-center gap-2 border ${currentLocation.accuracy < 50 ? 'bg-benin-green/5 text-benin-green border-benin-green/10' : 'bg-benin-yellow/5 text-benin-yellow border-benin-yellow/10'}`}>
                      Précision : {Math.round(currentLocation.accuracy)}m
                    </div>
                  )}
                </div>
              </div>

            {/* Real Map Representation */}
            <div className="relative h-96 bg-slate-50 rounded-[32px] overflow-hidden border border-slate-100 mb-10 z-10">
              {showDefaultLocationMsg && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-white/90 backdrop-blur-sm border border-benin-yellow/20 px-4 py-2 rounded-full shadow-lg flex items-center gap-2">
                  <div className="w-2 h-2 bg-benin-yellow rounded-full animate-pulse"></div>
                  <span className="text-[10px] font-black text-benin-yellow uppercase tracking-widest">Signal GPS Faible - Position Approximative</span>
                </div>
              )}
              <MapContainer 
                center={currentLocation ? [currentLocation.latitude, currentLocation.longitude] : [6.3654, 2.4183]} 
                zoom={14} 
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />
                
                {/* Driver Marker & Accuracy Circle */}
                {currentLocation && (
                  <>
                    <Circle
                      center={[currentLocation.latitude, currentLocation.longitude]}
                      radius={currentLocation.accuracy || 20}
                      pathOptions={{ fillColor: '#3b82f6', fillOpacity: 0.1, color: '#3b82f6', weight: 1 }}
                    />
                    <Marker position={[currentLocation.latitude, currentLocation.longitude]} icon={blueIcon}>
                      <Popup>
                        <div className="text-xs font-bold">
                          Vous (Livreur)
                          {currentLocation.accuracy && (
                            <p className="text-[10px] text-slate-400 mt-0.5 font-medium italic">
                              Précision: {Math.round(currentLocation.accuracy)}m
                            </p>
                          )}
                        </div>
                      </Popup>
                    </Marker>
                  </>
                )}

                {/* Client Marker */}
                <Marker position={[order.userLocation.latitude, order.userLocation.longitude]} icon={redIcon}>
                  <Popup>Client: {order.userLocation.address}</Popup>
                </Marker>

                {/* Market Marker */}
                {order.marketReachedLocation && (
                  <Marker position={[order.marketReachedLocation.latitude, order.marketReachedLocation.longitude]} icon={greenIcon}>
                    <Popup>Marché: {order.marketName}</Popup>
                  </Marker>
                )}

                {currentLocation && <ChangeView center={[currentLocation.latitude, currentLocation.longitude]} />}
              </MapContainer>
            </div>

            {/* Market Selection (Only if not already set or in accepted status) */}
            {order.status === 'accepted' && (
              <div className="mb-8 space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Store className="w-3 h-3" /> Quel marché avez-vous choisi ?
                </label>
                <input
                  type="text"
                  placeholder="Ex: Dantokpa, Ganhi, Porto-Novo..."
                  value={marketName}
                  onChange={(e) => setMarketName(e.target.value)}
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 font-bold text-slate-900 focus:border-benin-green focus:bg-white transition-all outline-none"
                />
              </div>
            )}

            {/* Action Buttons */}
            <div className="grid grid-cols-1 gap-4">
              {buttons.map((btn) => (
                <button
                  key={btn.id}
                  onClick={() => updateStatus(btn.status as OrderStatus, btn.message)}
                  disabled={updating || !btn.active}
                  className={`w-full py-6 rounded-2xl font-black flex items-center justify-center gap-4 transition-all active:scale-95 shadow-xl text-white ${
                    btn.active ? btn.color : 'bg-slate-100 text-slate-300 cursor-not-allowed shadow-none'
                  } hover:opacity-90 disabled:opacity-50`}
                >
                  <btn.icon className="w-6 h-6" />
                  {btn.label}
                </button>
              ))}
            </div>

            {order.status === 'delivered' && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full py-6 mt-6 rounded-2xl font-black flex items-center justify-center gap-4 bg-benin-green text-white shadow-2xl shadow-benin-green/20"
              >
                <CheckCircle className="w-6 h-6" />
                Livraison Terminée
              </motion.div>
            )}
          </div>
        </div>

        {/* Right: Order Info & Client */}
        <div className="w-full md:w-96 space-y-8">
          {/* Client Card */}
          <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm space-y-8">
            <h3 className="font-black text-slate-900 text-lg tracking-tight">Le Client</h3>
            <div className="flex items-center gap-5">
              <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center border border-slate-100 overflow-hidden shadow-sm">
                <img src={`https://picsum.photos/seed/${order.userId}/200`} alt="Client" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              </div>
              <div>
                <p className="font-black text-slate-900">Client #{order.userId.slice(-4)}</p>
                <p className="text-xs text-slate-500 font-medium leading-relaxed mt-1">{order.userLocation.address}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button className="flex items-center justify-center gap-2 py-4 bg-slate-50 text-slate-900 rounded-2xl text-xs font-black hover:bg-slate-100 transition-all border border-slate-100">
                <Phone className="w-4 h-4" /> Appeler
              </button>
              <button className="flex items-center justify-center gap-2 py-4 bg-slate-50 text-slate-900 rounded-2xl text-xs font-black hover:bg-slate-100 transition-all border border-slate-100">
                <MessageSquare className="w-4 h-4" /> Message
              </button>
            </div>
          </div>

          {/* Summary Card */}
          <div className="bg-slate-900 text-white p-10 rounded-[48px] shadow-2xl shadow-slate-900/30 space-y-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 blur-2xl"></div>
            <h3 className="font-black text-xl tracking-tight">Détails Panier</h3>
            <div className="space-y-4">
              {order.items.map((item, i) => (
                <div key={`${item.name}-${i}`} className="flex justify-between text-xs font-medium">
                  <div className="flex flex-col">
                    <span className="text-slate-400">{item.quantity}x {item.name}</span>
                    <span className="text-[10px] text-slate-500">{item.proposedPricePerUnit} FCFA</span>
                  </div>
                  <span className="font-black">{item.total} FCFA</span>
                </div>
              ))}
              <div className="pt-8 border-t border-white/10 flex justify-between items-center">
                <div className="space-y-1">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Total Client</p>
                  <p className="text-2xl font-black text-benin-green">{order.totalAmount} FCFA</p>
                  <p className="text-[10px] text-slate-400 font-medium">Inclut {order.deliveryFee}F livraison</p>
                </div>
                <div className="bg-benin-green/10 p-3 rounded-2xl">
                  <TrendingUp className="w-6 h-6 text-benin-green" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
