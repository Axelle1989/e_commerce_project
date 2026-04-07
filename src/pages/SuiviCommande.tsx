import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, onSnapshot, addDoc, collection, serverTimestamp, getDoc, query, where, getDocs, limit } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Order, UserProfile } from '../types';
import { MapPin, Truck, Store, CheckCircle2, Navigation, Bell, Phone, MessageSquare, Star, Send, Loader2, X, Info, Calendar, Clock, ArrowRight, ArrowLeft, Package } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

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

const orangeIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-orange.png',
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

function ChangeView({ center, zoom = 14 }: { center: [number, number], zoom?: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [center, zoom, map]);
  return null;
}

export default function SuiviCommande() {
  const { orderId } = useParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [driver, setDriver] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [showDriverDetails, setShowDriverDetails] = useState(false);
  const [driverReviews, setDriverReviews] = useState<any[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [lastNotification, setLastNotification] = useState<any>(null);
  const [showNotification, setShowNotification] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!auth.currentUser) return;

    const fetchOrder = async () => {
      if (orderId && orderId !== 'active') {
        // Normal case: specific order ID
        const unsubscribe = onSnapshot(doc(db, 'orders', orderId), async (docSnap) => {
          if (docSnap.exists()) {
            const orderData = { id: docSnap.id, ...docSnap.data() } as Order;
            setOrder(orderData);

            if (orderData.driverId && (!driver || driver.uid !== orderData.driverId)) {
              const driverSnap = await getDoc(doc(db, 'users', orderData.driverId));
              if (driverSnap.exists()) {
                setDriver({ uid: driverSnap.id, ...driverSnap.data() } as UserProfile);
              }
            }
          } else {
            setOrder(null);
          }
          setLoading(false);
        }, (error) => {
          console.error('SuiviCommande onSnapshot error:', error);
          setLoading(false);
        });
        return unsubscribe;
      } else {
        // "active" case: find the most recent non-delivered order for this user
        const q = query(
          collection(db, 'orders'),
          where('userId', '==', auth.currentUser.uid),
          where('status', '!=', 'delivered'),
          limit(1)
        );
        
        const unsubscribe = onSnapshot(q, async (snap) => {
          if (!snap.empty) {
            const docSnap = snap.docs[0];
            const orderData = { id: docSnap.id, ...docSnap.data() } as Order;
            setOrder(orderData);

            if (orderData.driverId && (!driver || driver.uid !== orderData.driverId)) {
              const driverSnap = await getDoc(doc(db, 'users', orderData.driverId));
              if (driverSnap.exists()) {
                setDriver({ uid: driverSnap.id, ...driverSnap.data() } as UserProfile);
              }
            }
          } else {
            setOrder(null);
          }
          setLoading(false);
        }, (error) => {
          console.error('SuiviCommande active search error:', error);
          setLoading(false);
        });
        return unsubscribe;
      }
    };

    let unsub: any;
    fetchOrder().then(u => unsub = u);

    return () => { if (unsub) unsub(); };
  }, [orderId, driver?.uid]);

  useEffect(() => {
    if (!orderId || !auth.currentUser) return;

    const q = query(
      collection(db, 'notifications'),
      where('orderId', '==', orderId),
      where('userId', '==', auth.currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      snap.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const notif = change.doc.data();
          // Only show if it's recent (within last 30 seconds)
          const now = new Date().getTime();
          const notifTime = notif.timestamp?.toDate ? notif.timestamp.toDate().getTime() : now;
          
          if (now - notifTime < 30000) {
            setLastNotification(notif);
            setShowNotification(true);
            setTimeout(() => setShowNotification(false), 6000);
          }
        }
      });
    });

    return () => unsubscribe();
  }, [orderId]);

  useEffect(() => {
    if (showDriverDetails && driver?.uid) {
      const fetchReviews = async () => {
        setLoadingReviews(true);
        try {
          const q = query(collection(db, 'reviews'), where('driverId', '==', driver.uid), limit(5));
          const snap = await getDocs(q);
          setDriverReviews(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (e) {
          console.error('Error fetching driver reviews:', e);
        } finally {
          setLoadingReviews(false);
        }
      };
      fetchReviews();
    }
  }, [showDriverDetails, driver?.uid]);

  const handleSubmitReview = async () => {
    if (!order || !auth.currentUser || rating === 0) return;
    setSubmittingReview(true);
    try {
      await addDoc(collection(db, 'reviews'), {
        orderId: order.id,
        userId: auth.currentUser.uid,
        driverId: order.driverId,
        note: rating,
        commentaire: comment,
        createdAt: serverTimestamp()
      });
      setReviewSubmitted(true);
      setTimeout(() => navigate('/'), 3000);
    } catch (error) {
      console.error('Error submitting review:', error);
    } finally {
      setSubmittingReview(false);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin h-10 w-10 text-benin-green" /></div>;
  if (!order) return (
    <div className="max-w-md mx-auto text-center py-20 space-y-6">
      <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mx-auto">
        <Package className="w-12 h-12 text-slate-200" />
      </div>
      <div className="space-y-2">
        <h2 className="text-2xl font-black text-slate-900 tracking-tight">Aucune commande active</h2>
        <p className="text-slate-500 font-medium leading-relaxed">Vous n'avez pas de commande en cours de livraison pour le moment.</p>
      </div>
      <button 
        onClick={() => navigate('/')}
        className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black shadow-xl shadow-slate-900/20 hover:bg-benin-green transition-all active:scale-95 flex items-center justify-center gap-3"
      >
        Faire une course <ArrowRight className="w-5 h-5" />
      </button>
    </div>
  );

  const steps = [
    { id: 'pending', label: 'Payé', icon: CheckCircle2 },
    { id: 'accepted', label: 'Accepté', icon: Truck },
    { id: 'at_market', label: 'Au Marché', icon: Store },
    { id: 'delivering', label: 'En Route', icon: Navigation },
    { id: 'delivered', label: 'Livré', icon: MapPin },
  ];

  const currentStepIndex = steps.findIndex(s => s.id === order.status);

  const mapCenter: [number, number] = order.driverLocation 
    ? [order.driverLocation.latitude, order.driverLocation.longitude] 
    : [order.userLocation.latitude, order.userLocation.longitude];

  return (
    <div className="max-w-5xl mx-auto space-y-10 pb-20">
      <AnimatePresence>
        {showNotification && lastNotification && (
          <motion.div 
            key={lastNotification.id || lastNotification.timestamp}
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: -40 }}
            exit={{ opacity: 0, y: 100 }}
            className="fixed bottom-0 left-1/2 -translate-x-1/2 z-[200] w-full max-w-md px-6"
          >
            <div className="bg-slate-900 text-white p-6 rounded-3xl shadow-2xl flex items-center gap-4 border border-white/10">
              <div className="w-12 h-12 bg-benin-green rounded-2xl flex items-center justify-center shrink-0">
                <Bell className="w-6 h-6 animate-bounce" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-black text-benin-green uppercase tracking-widest">Notification</p>
                <p className="font-bold text-sm leading-tight">{lastNotification.message}</p>
              </div>
              <button onClick={() => setShowNotification(false)} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button 
        onClick={() => navigate('/')}
        className="flex items-center gap-3 text-slate-500 font-black hover:text-benin-green transition-colors group"
      >
        <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center border border-slate-100 shadow-sm group-hover:bg-benin-green group-hover:text-white transition-all">
          <ArrowLeft className="w-5 h-5" />
        </div>
        Retour à l'accueil
      </button>

      {order.status === 'pending' && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-benin-yellow/10 border border-benin-yellow/20 p-6 rounded-3xl flex items-center gap-4"
        >
          <div className="w-12 h-12 bg-benin-yellow rounded-2xl flex items-center justify-center text-white shrink-0 animate-pulse">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-black text-slate-900">En attente d'un livreur...</h3>
            <p className="text-sm text-slate-600 font-medium">Votre commande est visible par tous les livreurs à proximité. Soyez patient !</p>
          </div>
        </motion.div>
      )}

      <div className="flex flex-col lg:flex-row gap-10">
        {/* Left: Status & Map Visual */}
        <div className="flex-1 space-y-8">
          <div className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-2xl shadow-slate-200/50">
            <div className="flex items-center justify-between mb-10">
              <h2 className="text-3xl font-black text-slate-900 tracking-tighter">Suivi de Livraison</h2>
              <div className="flex flex-col items-end gap-2">
                <div className="flex items-center gap-2 px-4 py-1.5 bg-benin-green/10 text-benin-green rounded-full text-[10px] font-black uppercase tracking-widest animate-pulse">
                  <span className="w-2 h-2 bg-benin-green rounded-full"></span>
                  En Direct
                </div>
                {order.driverLocation?.accuracy && (
                  <div className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest flex items-center gap-2 border ${order.driverLocation.accuracy < 50 ? 'bg-benin-green/5 text-benin-green border-benin-green/10' : 'bg-benin-yellow/5 text-benin-yellow border-benin-yellow/10'}`}>
                    Précision : {Math.round(order.driverLocation.accuracy)}m
                  </div>
                )}
              </div>
            </div>

            {/* Real Map Representation */}
            <div className="relative h-80 bg-slate-50 rounded-[32px] overflow-hidden border border-slate-100 mb-6 z-10">
              <MapContainer 
                center={mapCenter} 
                zoom={14} 
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />
                
                {/* Client Marker */}
                <Marker position={[order.userLocation.latitude, order.userLocation.longitude]} icon={greenIcon}>
                  <Popup>Votre adresse de livraison</Popup>
                </Marker>

                {/* Driver Marker & Accuracy Circle */}
                {order.driverLocation && (
                  <>
                    <Circle
                      center={[order.driverLocation.latitude, order.driverLocation.longitude]}
                      radius={order.driverLocation.accuracy || 20}
                      pathOptions={{ fillColor: '#3b82f6', fillOpacity: 0.1, color: '#3b82f6', weight: 1 }}
                    />
                    <Marker position={[order.driverLocation.latitude, order.driverLocation.longitude]} icon={blueIcon}>
                      <Popup>
                        <div className="text-xs font-bold">
                          Livreur: {driver?.displayName || 'En route'}
                          {order.driverLocation.address && (
                            <p className="text-[10px] text-benin-green mt-1 font-black uppercase tracking-widest">
                              {order.driverLocation.address}
                            </p>
                          )}
                          {order.driverLocation.updatedAt && (
                            <p className="text-[10px] text-slate-500 mt-1 font-medium">
                              Mis à jour à {new Date(order.driverLocation.updatedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}
                            </p>
                          )}
                          {order.driverLocation.accuracy && (
                            <p className="text-[10px] text-slate-400 mt-0.5 font-medium italic">
                              Précision: {Math.round(order.driverLocation.accuracy)}m
                            </p>
                          )}
                        </div>
                      </Popup>
                    </Marker>
                  </>
                )}

                {/* Market Marker */}
                {order.marketReachedLocation && (
                  <Marker position={[order.marketReachedLocation.latitude, order.marketReachedLocation.longitude]} icon={orangeIcon}>
                    <Popup>Marché: {order.marketName}</Popup>
                  </Marker>
                )}

                <ChangeView center={mapCenter} />
              </MapContainer>
            </div>

            {/* Real-time Status Text */}
            <div className="mb-10 p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-4">
              <div className="w-10 h-10 bg-benin-green/10 rounded-xl flex items-center justify-center text-benin-green shrink-0">
                <Info className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Statut en direct</p>
                <p className="text-sm font-black text-slate-900">
                  {order.status === 'accepted' && "Le livreur a accepté votre commande et se prépare."}
                  {order.status === 'at_market' && `Le livreur est actuellement au marché ${order.marketName}.`}
                  {order.status === 'delivering' && "Le livreur a quitté le marché et est en route vers vous."}
                  {order.status === 'delivered' && "Votre commande a été livrée. Merci de votre confiance !"}
                  {order.status === 'pending' && "Nous recherchons le meilleur livreur pour vous."}
                </p>
              </div>
            </div>

            {/* Horizontal Stepper */}
            <div className="flex justify-between relative px-4">
              <div className="absolute top-6 left-0 right-0 h-1 bg-slate-100 -z-0 rounded-full"></div>
              <div 
                className="absolute top-6 left-0 h-1 bg-benin-green transition-all duration-1000 -z-0 rounded-full" 
                style={{ width: `${(currentStepIndex / (steps.length - 1)) * 100}%` }}
              ></div>
              
              {steps.map((step, i) => {
                const Icon = step.icon;
                const isActive = i <= currentStepIndex;
                const isCurrent = i === currentStepIndex;

                return (
                  <div key={step.id} className="flex flex-col items-center gap-4 relative z-10">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-500 ${
                      isActive ? 'bg-benin-green text-white shadow-xl shadow-benin-green/20' : 'bg-white text-slate-300 border-2 border-slate-100'
                    } ${isCurrent ? 'ring-8 ring-benin-green/10 scale-110' : ''}`}>
                      <Icon className="w-6 h-6" />
                    </div>
                    <span className={`text-[10px] font-black uppercase tracking-widest ${isActive ? 'text-benin-green' : 'text-slate-400'}`}>
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Rating Form after delivery */}
          <AnimatePresence>
            {order.status === 'delivered' && !reviewSubmitted && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-2xl shadow-slate-200/50 space-y-8"
              >
                <div className="text-center space-y-3">
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight">Comment s'est passée votre livraison ?</h3>
                  <p className="text-slate-500 font-medium">Notez votre livreur pour l'aider à s'améliorer au Bénin.</p>
                </div>

                <div className="flex justify-center gap-3">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={`star-rating-${star}`}
                      onClick={() => setRating(star)}
                      className="p-3 transition-all active:scale-90"
                    >
                      <Star className={`w-12 h-12 ${rating >= star ? 'fill-benin-yellow text-benin-yellow' : 'text-slate-100'}`} />
                    </button>
                  ))}
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Votre commentaire (optionnel)</label>
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Un petit mot sur la livraison..."
                    className="w-full p-6 bg-slate-50 border border-slate-100 rounded-[32px] text-sm focus:ring-4 focus:ring-benin-green/10 outline-none min-h-[120px] resize-none font-medium"
                  />
                </div>

                <button
                  onClick={handleSubmitReview}
                  disabled={rating === 0 || submittingReview}
                  className="w-full bg-benin-green text-white py-5 rounded-2xl font-black flex items-center justify-center gap-3 hover:bg-benin-green/90 transition-all active:scale-95 disabled:opacity-50 shadow-xl shadow-benin-green/20"
                >
                  {submittingReview ? <Loader2 className="animate-spin w-6 h-6" /> : <><Send className="w-6 h-6" /> Envoyer mon avis</>}
                </button>
              </motion.div>
            )}

            {reviewSubmitted && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-benin-green text-white p-10 rounded-[40px] text-center space-y-4 shadow-2xl shadow-benin-green/20"
              >
                <CheckCircle2 className="w-16 h-16 mx-auto" />
                <h3 className="text-2xl font-black">Merci pour votre avis !</h3>
                <p className="text-white/80 font-medium">Votre retour est précieux pour notre communauté au Bénin.</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Notifications / Log */}
          <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm space-y-6">
            <h3 className="font-black text-slate-900 flex items-center gap-3">
              <Bell className="w-5 h-5 text-benin-green" />
              Historique de livraison
            </h3>
            <div className="space-y-6">
              <AnimatePresence mode="popLayout">
                {order.status === 'delivered' && (
                  <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex gap-4">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 mt-2"></div>
                    <p className="text-sm text-slate-600 font-medium">
                      <span className="font-black text-slate-900">
                        {order.deliveredAt?.toDate ? order.deliveredAt.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Maintenant'}
                      </span> - Commande livrée ! Bon appétit !
                    </p>
                  </motion.div>
                )}
                {['delivering', 'delivered'].includes(order.status) && (
                  <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex gap-4">
                    <div className="w-2 h-2 rounded-full bg-benin-green mt-2"></div>
                    <p className="text-sm text-slate-600 font-medium">
                      <span className="font-black text-slate-900">
                        {order.departureAt?.toDate ? order.departureAt.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ''}
                      </span> Le livreur a quitté le marché {order.marketName} et arrive chez vous.
                    </p>
                  </motion.div>
                )}
                {['at_market', 'delivering', 'delivered'].includes(order.status) && (
                  <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex gap-4">
                    <div className="w-2 h-2 rounded-full bg-benin-green mt-2"></div>
                    <p className="text-sm text-slate-600 font-medium">
                      <span className="font-black text-slate-900">
                        {order.marketReachedAt?.toDate ? order.marketReachedAt.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ''}
                      </span> Le livreur est arrivé au marché {order.marketName}.
                    </p>
                  </motion.div>
                )}
                {['accepted', 'at_market', 'delivering', 'delivered'].includes(order.status) && (
                  <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex gap-4">
                    <div className="w-2 h-2 rounded-full bg-benin-green mt-2"></div>
                    <p className="text-sm text-slate-600 font-medium">
                      Commande acceptée par le livreur.
                    </p>
                  </motion.div>
                )}
                <div className="flex gap-4">
                  <div className="w-2 h-2 rounded-full bg-slate-200 mt-2"></div>
                  <p className="text-sm text-slate-600 font-medium">
                    <span className="font-black text-slate-900">
                      {order.createdAt?.toDate ? order.createdAt.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ''}
                    </span> - Commande payée et en attente d'un livreur.
                  </p>
                </div>
              </AnimatePresence>
            </div>
          </div>

          {/* Safety Section */}
          <div className="bg-benin-green/5 p-8 rounded-[40px] border border-benin-green/10 space-y-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-benin-green rounded-2xl flex items-center justify-center text-white shadow-lg shadow-benin-green/20">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-black text-slate-900 tracking-tight">Sécurité Garantie</h3>
                <p className="text-xs text-slate-500 font-medium">Votre livraison est entre de bonnes mains.</p>
              </div>
            </div>
            <div className="h-40 rounded-3xl overflow-hidden shadow-sm">
              <img src="https://images.unsplash.com/photo-1586769852836-bc069f19e1b6?auto=format&fit=crop&q=80&w=800" alt="Sécurité" className="w-full h-full object-cover" />
            </div>
            <p className="text-[11px] text-slate-600 font-medium leading-relaxed">
              Tous nos livreurs sont vérifiés et suivis en temps réel par GPS pour assurer une livraison sans encombre à Cotonou.
            </p>
          </div>
        </div>

        {/* Right: Order Info & Driver */}
        <div className="w-full lg:w-96 space-y-8">
          {/* Driver Card */}
          {order.driverId ? (
            <motion.div 
              whileHover={{ scale: 1.02 }}
              onClick={() => setShowDriverDetails(true)}
              className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm space-y-8 cursor-pointer group"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-black text-slate-900 text-xl tracking-tight">Votre Livreur</h3>
                <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-benin-green transition-colors" />
              </div>
              <div className="flex items-center gap-5">
                <div className="w-20 h-20 bg-slate-50 rounded-[24px] flex items-center justify-center border border-slate-100 overflow-hidden shadow-inner">
                  <img src={driver?.photoURL || "https://picsum.photos/seed/driver/200"} alt="Driver" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                </div>
                <div className="space-y-1">
                  <p className="font-black text-slate-900 text-lg">{driver?.displayName || 'Livreur CourseExpress'}</p>
                  <div className="flex items-center gap-1.5 text-benin-yellow">
                    <span className="text-sm font-black">{driver?.noteMoyenne?.toFixed(1) || '5.0'}</span>
                    <div className="flex">
                      {[1,2,3,4,5].map(i => <Star key={`driver-star-${i}`} className={`w-3 h-3 ${i <= Math.round(driver?.noteMoyenne || 5) ? 'fill-current' : 'text-slate-100'}`} />)}
                    </div>
                  </div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{driver?.totalDeliveries || 0} livraisons</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <a 
                  href={`tel:${driver?.phone}`}
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center justify-center gap-2 py-3.5 bg-slate-50 text-slate-600 rounded-2xl text-xs font-black hover:bg-slate-100 transition-all active:scale-95"
                >
                  <Phone className="w-4 h-4" /> Appeler
                </a>
                <button 
                  onClick={(e) => { e.stopPropagation(); setShowDriverDetails(true); }}
                  className="flex items-center justify-center gap-2 py-3.5 bg-slate-50 text-slate-600 rounded-2xl text-xs font-black hover:bg-slate-100 transition-all active:scale-95"
                >
                  <MessageSquare className="w-4 h-4" /> Message
                </button>
              </div>
            </motion.div>
          ) : (
            <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm flex flex-col items-center justify-center py-12 space-y-4">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center">
                <Truck className="w-8 h-8 text-slate-200" />
              </div>
              <p className="text-slate-400 font-black text-center text-sm uppercase tracking-widest">Recherche d'un livreur...</p>
            </div>
          )}

          {/* Summary Card */}
          <div className="bg-slate-900 text-white p-8 rounded-[40px] shadow-2xl shadow-slate-200/50 space-y-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-benin-green/10 rounded-full blur-3xl -mr-16 -mt-16"></div>
            <h3 className="font-black text-xl tracking-tight relative z-10">Détails Commande</h3>
            {order.marketName && (
              <div className="flex items-center gap-3 p-4 bg-white/5 rounded-2xl border border-white/10">
                <Store className="w-5 h-5 text-benin-yellow" />
                <div>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Marché cible</p>
                  <p className="text-sm font-black text-white">{order.marketName}</p>
                </div>
              </div>
            )}
            <div className="space-y-4 relative z-10">
              {order.items.map((item, i) => (
                <div key={`${item.name}-${i}`} className="flex justify-between text-sm">
                  <div className="flex flex-col">
                    <span className="text-slate-400 font-medium">{item.quantity}x {item.name}</span>
                    <span className="text-[10px] text-slate-500">{item.proposedPricePerUnit} FCFA</span>
                  </div>
                  <span className="font-black">{item.total} FCFA</span>
                </div>
              ))}
              <div className="pt-5 border-t border-white/10 flex justify-between items-center">
                <span className="text-sm font-black text-slate-400">Total Payé</span>
                <span className="text-3xl font-black text-benin-green">{order.totalAmount} FCFA</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Driver Details Modal */}
      <AnimatePresence>
        {showDriverDetails && driver && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDriverDetails(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-[48px] overflow-hidden shadow-2xl"
            >
              <button 
                onClick={() => setShowDriverDetails(false)}
                className="absolute top-8 right-8 p-3 bg-slate-100 rounded-full hover:bg-slate-200 transition-all z-10"
              >
                <X className="w-6 h-6 text-slate-900" />
              </button>

              <div className="p-10 space-y-10">
                <div className="flex flex-col items-center text-center space-y-4">
                  <div className="w-32 h-32 rounded-[40px] overflow-hidden border-4 border-slate-50 shadow-xl">
                    <img src={driver.photoURL || "https://picsum.photos/seed/driver/200"} alt="" className="w-full h-full object-cover" />
                  </div>
                  <div>
                    <h3 className="text-3xl font-black text-slate-900 tracking-tight">{driver.displayName}</h3>
                    <p className="text-benin-green font-black text-xs uppercase tracking-widest mt-1">Livreur Certifié</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-slate-50 p-6 rounded-3xl text-center space-y-1">
                    <Star className="w-6 h-6 text-benin-yellow mx-auto" />
                    <p className="text-lg font-black text-slate-900">{driver.noteMoyenne?.toFixed(1) || '5.0'}</p>
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Note</p>
                  </div>
                  <div className="bg-slate-50 p-6 rounded-3xl text-center space-y-1">
                    <Truck className="w-6 h-6 text-benin-green mx-auto" />
                    <p className="text-lg font-black text-slate-900">{driver.totalDeliveries || 0}</p>
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Courses</p>
                  </div>
                  <div className="bg-slate-50 p-6 rounded-3xl text-center space-y-1">
                    <Clock className="w-6 h-6 text-benin-yellow mx-auto" />
                    <p className="text-lg font-black text-slate-900">~25m</p>
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Temps Moy.</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <h4 className="font-black text-slate-900 flex items-center gap-3">
                    <MessageSquare className="w-5 h-5 text-benin-green" />
                    Avis Récents
                  </h4>
                  <div className="space-y-4">
                    {loadingReviews ? (
                      <div className="flex justify-center py-8"><Loader2 className="animate-spin w-8 h-8 text-benin-green" /></div>
                    ) : driverReviews.length > 0 ? (
                      driverReviews.map((rev) => (
                        <div key={rev.id} className="p-5 bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
                          <div className="flex justify-between items-center">
                            <div className="flex gap-1">
                              {[1,2,3,4,5].map(i => <Star key={`rev-star-${rev.id}-${i}`} className={`w-3 h-3 ${i <= rev.note ? 'fill-benin-yellow text-benin-yellow' : 'text-slate-200'}`} />)}
                            </div>
                            <span className="text-[10px] text-slate-400 font-medium">
                              {rev.createdAt?.toDate ? rev.createdAt.toDate().toLocaleDateString() : ''}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 font-medium italic">"{rev.commentaire}"</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-center text-slate-400 text-xs font-medium py-8 italic">Aucun avis pour le moment</p>
                    )}
                  </div>
                </div>

                <a 
                  href={`tel:${driver.phone}`}
                  className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black shadow-xl shadow-slate-900/20 hover:bg-black transition-all active:scale-95 flex items-center justify-center gap-3"
                >
                  <Phone className="w-6 h-6" /> CONTACTER LE LIVREUR ({driver.phone || 'Non renseigné'})
                </a>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
