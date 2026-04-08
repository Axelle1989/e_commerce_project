import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, onSnapshot, updateDoc, addDoc, collection, serverTimestamp, runTransaction, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, auth, storage } from '../firebase';
import { Order, OrderStatus, GeoPoint, UserProfile } from '../types';
import { MapPin, Truck, Store, CheckCircle2, Navigation, Bell, Phone, MessageSquare, Loader2, ArrowRight, CheckCircle, TrendingUp, ShieldAlert, RefreshCw, Camera, X, Image as ImageIcon, Video, AlertCircle, User, XCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useLiveLocation } from '../hooks/useLiveLocation';
import { reverseGeocode, getDistance } from '../lib/geocoding';
import Chat from '../components/Chat';
import { ItemValidation } from '../types';
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
  const [uploadingProof, setUploadingProof] = useState(false);
  const [showProofModal, setShowProofModal] = useState(false);
  const [uploadingItemProof, setUploadingItemProof] = useState<{index: number, type: 'photo' | 'video'} | null>(null);
  const [activeTab, setActiveTab] = useState<'mission' | 'chat'>('mission');
  const [pendingUploads, setPendingUploads] = useState<number>(0);
  const [showSkipJustification, setShowSkipJustification] = useState<number | null>(null);
  const [skipJustification, setSkipJustification] = useState('');
  
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

    // Enforce proof of purchase before delivering (unless skipped)
    const hasProofs = order.proofPhotos && order.proofPhotos.length > 0;
    const hasSkipped = order.itemsValidation && Object.values(order.itemsValidation).some(v => v.skippedProof);
    
    if (newStatus === 'delivering' && !hasProofs && !hasSkipped) {
      alert("Veuillez ajouter au moins une photo de preuve d'achat ou justifier l'absence de preuve.");
      return;
    }

    if (pendingUploads > 0) {
      if (!window.confirm(`Il y a encore ${pendingUploads} téléchargement(s) en cours. Voulez-vous continuer quand même ?`)) {
        return;
      }
    }

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
      if (newStatus === 'shopping_completed') {
        updateData.shoppingCompletedAt = serverTimestamp();
        // Validate that all items have price and quantity
        const validations = order.itemsValidation || {};
        const allValid = order.items.every((_, i) => {
          const v = validations[i];
          return v && v.driverActualPrice > 0 && v.driverActualQuantity > 0 && v.proofPhotos.length > 0;
        });

        if (!allValid) {
          alert("Veuillez remplir les informations d'achat et ajouter au moins une photo pour CHAQUE article.");
          return;
        }
      }
      if (newStatus === 'delivering') {
        updateData.departureAt = serverTimestamp();
        updateData.departureLocation = loc;
        if (loc) updateData.driverLocation = loc;
      }
      if (newStatus === 'delivered') {
        updateData.deliveredAt = serverTimestamp();
        updateData.deliveredLocation = loc;
        
        // Update driver's balance and total gains
        await runTransaction(db, async (transaction) => {
          const driverRef = doc(db, 'users', auth.currentUser!.uid);
          const driverDoc = await transaction.get(driverRef);
          if (!driverDoc.exists()) return;
          
          const driverData = driverDoc.data() as UserProfile;
          const earnings = order.deliveryFee || 0;
          
          transaction.update(driverRef, {
            solde: (driverData.solde || 0) + earnings,
            totalGains: (driverData.totalGains || 0) + earnings
          });
          
          // Also update the order in the same transaction
          transaction.update(doc(db, 'orders', orderId), updateData);
        });
      } else {
        await updateDoc(doc(db, 'orders', orderId), updateData);
      }

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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !orderId || !auth.currentUser) return;

    setPendingUploads(prev => prev + 1);
    setUploadingProof(true);

    const uploadPromise = (async () => {
      let timeoutReached = false;
      const timeout = setTimeout(() => {
        timeoutReached = true;
        console.warn('Upload taking too long, continuing in background');
        setUploadingProof(false); // Allow UI to continue
      }, 10000);

      try {
        let finalFile: Blob | File = file;
        if (file.type.startsWith('image/')) {
          finalFile = await compressImage(file, 500 * 1024);
        } else if (file.type.startsWith('video/')) {
          if (file.size > 5 * 1024 * 1024) {
            alert("La vidéo est trop lourde (Max 5Mo).");
            setPendingUploads(prev => prev - 1);
            setUploadingProof(false);
            clearTimeout(timeout);
            return;
          }
        }
        
        const storageRef = ref(storage, `orders/${orderId}/proofs/${Date.now()}_${file.name}`);
        await uploadBytes(storageRef, finalFile);
        const downloadURL = await getDownloadURL(storageRef);

        const orderRef = doc(db, 'orders', orderId);
        const orderSnap = await getDoc(orderRef);
        if (orderSnap.exists()) {
          const currentData = orderSnap.data() as Order;
          const currentPhotos = currentData.proofPhotos || [];
          await updateDoc(orderRef, {
            proofPhotos: [...currentPhotos, downloadURL],
            proofStatus: 'submitted'
          });
        }

        // Notify client
        await addDoc(collection(db, 'notifications'), {
          orderId,
          userId: order.userId,
          driverId: auth.currentUser!.uid,
          type: 'proof_added',
          message: "Le livreur a ajouté des preuves d'achat pour votre commande.",
          timestamp: serverTimestamp(),
          read: false
        });

      } catch (error) {
        console.error('Error uploading proof:', error);
        alert("Erreur lors de l'envoi de la photo.");
      } finally {
        setPendingUploads(prev => prev - 1);
        if (!timeoutReached) setUploadingProof(false);
        clearTimeout(timeout);
      }
    })();
  };

  const handleItemFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, itemIndex: number, type: 'photo' | 'video') => {
    const file = e.target.files?.[0];
    if (!file || !orderId || !auth.currentUser || !order) return;

    setPendingUploads(prev => prev + 1);
    setUploadingItemProof({ index: itemIndex, type });

    const uploadPromise = (async () => {
      let timeoutReached = false;
      const timeout = setTimeout(() => {
        timeoutReached = true;
        setUploadingItemProof(null); // Allow UI to continue
      }, 10000);

      try {
        let finalFile: Blob | File = file;
        if (type === 'photo') {
          finalFile = await compressImage(file, 500 * 1024);
        } else if (type === 'video') {
          if (file.size > 5 * 1024 * 1024) {
            alert("La vidéo est trop lourde (Max 5Mo).");
            setPendingUploads(prev => prev - 1);
            setUploadingItemProof(null);
            clearTimeout(timeout);
            return;
          }
        }
        
        const storageRef = ref(storage, `orders/${orderId}/items/${itemIndex}/${Date.now()}_${file.name}`);
        await uploadBytes(storageRef, finalFile);
        const downloadURL = await getDownloadURL(storageRef);

        const orderRef = doc(db, 'orders', orderId);
        const orderSnap = await getDoc(orderRef);
        if (orderSnap.exists()) {
          const currentOrder = orderSnap.id === orderId ? { ...orderSnap.data(), id: orderSnap.id } as Order : order;
          const validations = { ...(currentOrder.itemsValidation || {}) };
          if (!validations[itemIndex]) {
            validations[itemIndex] = {
              itemId: itemIndex.toString(),
              clientApproved: null,
              driverActualPrice: order.items[itemIndex].proposedPricePerUnit,
              driverActualQuantity: order.items[itemIndex].quantity,
              proofPhotos: [],
              proofLocation: location || currentLocation || undefined,
              proofTimestamp: new Date()
            };
          }

          if (type === 'photo') {
            validations[itemIndex].proofPhotos = [...validations[itemIndex].proofPhotos, downloadURL];
          } else {
            validations[itemIndex].proofVideoUrl = downloadURL;
          }

          await updateDoc(orderRef, {
            itemsValidation: validations
          });
        }

      } catch (error) {
        console.error('Error uploading item proof:', error);
        alert("Erreur lors de l'envoi du fichier.");
      } finally {
        setPendingUploads(prev => prev - 1);
        if (!timeoutReached) setUploadingItemProof(null);
        clearTimeout(timeout);
      }
    })();
  };

  const updateItemValidation = async (index: number, field: string, value: any) => {
    if (!orderId || !order) return;
    const validations = { ...(order.itemsValidation || {}) };
    if (!validations[index]) {
      validations[index] = {
        itemId: index.toString(),
        clientApproved: null,
        driverActualPrice: order.items[index].proposedPricePerUnit,
        driverActualQuantity: order.items[index].quantity,
        proofPhotos: [],
        proofLocation: location || currentLocation || undefined,
        proofTimestamp: new Date()
      };
    }
    validations[index] = { ...validations[index], [field]: value };
    await updateDoc(doc(db, 'orders', orderId), {
      itemsValidation: validations
    });
  };

  const compressImage = (file: File, maxSizeBytes: number = 500 * 1024): Promise<Blob> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // Max dimension 1200px
          const maxDim = 1200;
          if (width > height && width > maxDim) {
            height *= maxDim / width;
            width = maxDim;
          } else if (height > maxDim) {
            width *= maxDim / height;
            height = maxDim;
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          
          let quality = 0.7;
          const attemptCompression = () => {
            canvas.toBlob((blob) => {
              if (blob && blob.size > maxSizeBytes && quality > 0.1) {
                quality -= 0.1;
                attemptCompression();
              } else {
                resolve(blob || file);
              }
            }, 'image/jpeg', quality);
          };
          attemptCompression();
        };
      };
    });
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
      id: 'shopping_completed', 
      label: 'Achats terminés', 
      status: 'shopping_completed', 
      message: `Le livreur a terminé ses achats. Vérifiez et validez.`,
      icon: CheckCircle2, 
      color: 'bg-benin-green',
      active: order.status === 'at_market'
    },
    { 
      id: 'delivering', 
      label: 'En route vers le client', 
      status: 'delivering', 
      message: `Le livreur a quitté le marché {market} et vient vers vous`,
      icon: Navigation, 
      color: 'bg-benin-yellow',
      active: order.status === 'shopping_completed' && order.proofStatus === 'approved' // Wait for client approval
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
      {/* Tabs */}
      <div className="flex bg-white p-2 rounded-3xl border border-slate-100 shadow-sm">
        <button 
          onClick={() => setActiveTab('mission')}
          className={`flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-3 ${
            activeTab === 'mission' ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/20' : 'text-slate-400 hover:bg-slate-50'
          }`}
        >
          <Truck className="w-5 h-5" /> Mission
        </button>
        <button 
          onClick={() => setActiveTab('chat')}
          className={`flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-3 relative ${
            activeTab === 'chat' ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/20' : 'text-slate-400 hover:bg-slate-50'
          }`}
        >
          <MessageSquare className="w-5 h-5" /> Chat
          {order.chatMessages && order.chatMessages.length > 0 && (
            <span className="absolute top-3 right-1/4 w-2 h-2 bg-benin-red rounded-full animate-pulse" />
          )}
        </button>
      </div>

      {activeTab === 'chat' ? (
        <Chat orderId={orderId!} userRole="driver" messages={order.chatMessages || []} />
      ) : (
        <>
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

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
            {/* Left Column: Map & Status */}
            <div className="lg:col-span-2 space-y-10">
              {/* Map Card */}
              <div className="bg-white rounded-[48px] border border-slate-100 shadow-xl overflow-hidden h-[400px] relative">
                <MapContainer 
                  center={[order.userLocation.latitude, order.userLocation.longitude]} 
                  zoom={14} 
                  className="h-full w-full"
                >
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  <Marker position={[order.userLocation.latitude, order.userLocation.longitude]} icon={redIcon}>
                    <Popup>Client: {order.userLocation.address}</Popup>
                  </Marker>
                  {currentLocation && (
                    <Marker position={[currentLocation.latitude, currentLocation.longitude]} icon={blueIcon}>
                      <Popup>Vous êtes ici</Popup>
                    </Marker>
                  )}
                  {currentLocation && <ChangeView center={[currentLocation.latitude, currentLocation.longitude]} />}
                </MapContainer>
                
                <div className="absolute top-6 left-6 right-6 flex justify-between items-start pointer-events-none">
                  <div className="bg-white/90 backdrop-blur-md p-4 rounded-3xl shadow-xl pointer-events-auto border border-white">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Destination</p>
                    <p className="text-sm font-black text-slate-900 truncate max-w-[200px]">{order.userLocation.address}</p>
                  </div>
                </div>
              </div>

              {/* Shopping List Section (Only when at_market or shopping_completed) */}
              {(order.status === 'at_market' || order.status === 'shopping_completed' || order.status === 'disputed') && (
                <div className="bg-white p-10 rounded-[48px] border border-slate-100 shadow-xl space-y-8">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-benin-green/10 rounded-2xl flex items-center justify-center text-benin-green">
                        <CheckCircle2 className="w-6 h-6" />
                      </div>
                      <div>
                        <h2 className="text-2xl font-black text-slate-900 tracking-tight">Liste de courses</h2>
                        <p className="text-xs text-slate-500 font-medium">Validez chaque article avec prix et photos</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    {order.items.map((item, index) => {
                      const validation = (order.itemsValidation || {})[index];
                      const isUploading = uploadingItemProof?.index === index;

                      return (
                        <div key={index} className="p-8 bg-slate-50 rounded-[32px] border border-slate-100 space-y-6">
                          <div className="flex items-center justify-between">
                            <div>
                              <h3 className="text-lg font-black text-slate-900">{item.name}</h3>
                              <p className="text-xs text-slate-500 font-medium">
                                Commandé : {item.quantity} {item.unit} • {item.proposedPricePerUnit} FCFA/{item.unit}
                              </p>
                            </div>
                            {validation?.clientApproved === true && (
                              <span className="bg-benin-green text-white px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest">Validé par client</span>
                            )}
                            {validation?.clientApproved === false && (
                              <span className="bg-benin-red text-white px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest">Refusé par client</span>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Prix réel payé (FCFA)</label>
                              <input 
                                type="number"
                                value={validation?.driverActualPrice || ''}
                                onChange={(e) => updateItemValidation(index, 'driverActualPrice', Number(e.target.value))}
                                disabled={order.status !== 'at_market'}
                                className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-3 text-sm font-black focus:ring-2 focus:ring-benin-green outline-none disabled:opacity-50"
                                placeholder="Ex: 150"
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Quantité réelle</label>
                              <input 
                                type="number"
                                value={validation?.driverActualQuantity || ''}
                                onChange={(e) => updateItemValidation(index, 'driverActualQuantity', Number(e.target.value))}
                                disabled={order.status !== 'at_market'}
                                className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-3 text-sm font-black focus:ring-2 focus:ring-benin-green outline-none disabled:opacity-50"
                                placeholder={`Ex: ${item.quantity}`}
                              />
                            </div>
                          </div>

                          <div className="space-y-4">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Preuves d'achat</p>
                            <div className="flex flex-wrap gap-3">
                              {validation?.proofPhotos.map((url, i) => (
                                <div key={i} className="relative w-20 h-20 rounded-2xl overflow-hidden border border-slate-200">
                                  <ImageWithFallback src={url} alt="" className="w-full h-full object-cover" />
                                  {order.status === 'at_market' && (
                                    <button 
                                      onClick={() => {
                                        const newPhotos = validation.proofPhotos.filter((_, idx) => idx !== i);
                                        updateItemValidation(index, 'proofPhotos', newPhotos);
                                      }}
                                      className="absolute top-1 right-1 bg-benin-red text-white p-1 rounded-lg shadow-lg"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              ))}
                              {validation?.proofVideoUrl && (
                                <div className="relative w-20 h-20 rounded-2xl overflow-hidden border border-slate-200 bg-slate-900 flex items-center justify-center">
                                  <Video className="w-6 h-6 text-white" />
                                  {order.status === 'at_market' && (
                                    <button 
                                      onClick={() => updateItemValidation(index, 'proofVideoUrl', null)}
                                      className="absolute top-1 right-1 bg-benin-red text-white p-1 rounded-lg shadow-lg"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              )}
                              
                              {order.status === 'at_market' && (
                                <div className="flex flex-wrap gap-3">
                                  <label className="w-20 h-20 rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center gap-1 text-slate-400 hover:border-benin-green hover:text-benin-green transition-all cursor-pointer">
                                    {uploadingItemProof?.index === index && uploadingItemProof?.type === 'photo' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
                                    <span className="text-[8px] font-black uppercase">Photo</span>
                                    <input type="file" className="hidden" accept="image/*" onChange={(e) => handleItemFileUpload(e, index, 'photo')} disabled={!!uploadingItemProof} />
                                  </label>
                                  <label className="w-20 h-20 rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center gap-1 text-slate-400 hover:border-benin-green hover:text-benin-green transition-all cursor-pointer">
                                    {uploadingItemProof?.index === index && uploadingItemProof?.type === 'video' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Video className="w-5 h-5" />}
                                    <span className="text-[8px] font-black uppercase">Vidéo</span>
                                    <input type="file" className="hidden" accept="video/*" onChange={(e) => handleItemFileUpload(e, index, 'video')} disabled={!!uploadingItemProof} />
                                  </label>
                                  
                                  <button 
                                    onClick={() => setShowSkipJustification(index)}
                                    className="w-20 h-20 rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center gap-1 text-slate-400 hover:border-benin-red hover:text-benin-red transition-all"
                                  >
                                    <XCircle className="w-5 h-5" />
                                    <span className="text-[8px] font-black uppercase">Sauter</span>
                                  </button>
                                </div>
                              )}

                              <AnimatePresence>
                                {showSkipJustification === index && (
                                  <motion.div 
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="space-y-3 bg-white p-4 rounded-2xl border border-slate-100"
                                  >
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Justification (ex: marché bondé)</p>
                                    <textarea 
                                      value={skipJustification}
                                      onChange={(e) => setSkipJustification(e.target.value)}
                                      className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs font-medium outline-none focus:ring-2 focus:ring-benin-red"
                                      rows={2}
                                    />
                                    <div className="flex gap-2">
                                      <button 
                                        onClick={() => {
                                          updateItemValidation(index, 'skippedProof', true);
                                          updateItemValidation(index, 'skipJustification', skipJustification);
                                          setShowSkipJustification(null);
                                          setSkipJustification('');
                                        }}
                                        className="flex-1 py-2 bg-benin-red text-white rounded-xl text-[10px] font-black uppercase"
                                      >
                                        Confirmer
                                      </button>
                                      <button 
                                        onClick={() => setShowSkipJustification(null)}
                                        className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-xl text-[10px] font-black uppercase"
                                      >
                                        Annuler
                                      </button>
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          </div>
                          
                            {validation?.skippedProof && (
                              <div className="p-4 bg-slate-100 border border-slate-200 rounded-2xl flex items-start gap-3">
                                <ShieldAlert className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                                <div>
                                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Preuve sautée</p>
                                  <p className="text-xs font-medium text-slate-600 italic">"{validation.skipJustification}"</p>
                                </div>
                              </div>
                            )}
                            
                            {validation?.clientRemark && (
                            <div className="p-4 bg-benin-yellow/10 border border-benin-yellow/20 rounded-2xl flex items-start gap-3">
                              <AlertCircle className="w-4 h-4 text-benin-yellow shrink-0 mt-0.5" />
                              <div>
                                <p className="text-[10px] font-black text-benin-yellow uppercase tracking-widest">Remarque du client</p>
                                <p className="text-xs font-medium text-slate-700">{validation.clientRemark}</p>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Status Actions */}
              <div className="bg-white p-10 rounded-[48px] border border-slate-100 shadow-xl space-y-8">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-benin-yellow/10 rounded-2xl flex items-center justify-center text-benin-yellow">
                    <TrendingUp className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">Progression</h2>
                    <p className="text-xs text-slate-500 font-medium">Mettez à jour le statut de la livraison</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {buttons.map((btn) => (
                    <button
                      key={btn.id}
                      onClick={() => updateStatus(btn.status as OrderStatus, btn.message)}
                      disabled={!btn.active || updating}
                      className={`p-6 rounded-3xl flex flex-col items-center gap-4 transition-all ${
                        btn.active 
                          ? `${btn.color} text-white shadow-xl shadow-slate-900/10 hover:scale-105` 
                          : 'bg-slate-50 text-slate-300 border border-slate-100'
                      }`}
                    >
                      <btn.icon className={`w-8 h-8 ${btn.active ? 'animate-bounce' : ''}`} />
                      <span className="text-[10px] font-black uppercase tracking-widest text-center">{btn.label}</span>
                    </button>
                  ))}
                </div>
                
                {order.status === 'shopping_completed' && (
                  <div className="p-6 bg-benin-yellow/5 border border-benin-yellow/10 rounded-3xl flex items-center gap-4">
                    <Loader2 className="w-6 h-6 text-benin-yellow animate-spin" />
                    <p className="text-sm font-medium text-slate-600">
                      En attente de la validation du client. Vous recevrez une notification dès qu'il aura vérifié vos achats.
                    </p>
                  </div>
                )}

                {order.status === 'disputed' && (
                  <div className="p-6 bg-benin-red/5 border border-benin-red/10 rounded-3xl flex items-center gap-4">
                    <ShieldAlert className="w-6 h-6 text-benin-red" />
                    <p className="text-sm font-medium text-slate-600">
                      Un litige a été ouvert par le client. Un administrateur va intervenir pour médiation. Utilisez le chat pour discuter avec le client.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Order Summary & Customer */}
            <div className="space-y-10">
              {/* Customer Card */}
              <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-xl space-y-6">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-200 overflow-hidden">
                    <User className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-900">Client</h3>
                    <p className="text-xs text-slate-500 font-medium">#{order.userId.slice(-6)}</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2">
                    <Phone className="w-4 h-4" /> Appeler
                  </button>
                  <button 
                    onClick={() => setActiveTab('chat')}
                    className="flex-1 py-4 bg-benin-green text-white rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2"
                  >
                    <MessageSquare className="w-4 h-4" /> Chat
                  </button>
                </div>
              </div>

              {/* Summary Card */}
              <div className="bg-slate-900 p-8 rounded-[40px] text-white space-y-8 shadow-2xl shadow-slate-900/30">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-black tracking-tight">Résumé</h3>
                  <span className="text-[10px] font-black uppercase tracking-widest bg-white/10 px-3 py-1 rounded-full">
                    {order.items.length} articles
                  </span>
                </div>

                <div className="space-y-4">
                  {order.items.map((item, i) => (
                    <div key={i} className="flex justify-between items-start group">
                      <div className="space-y-1">
                        <p className="font-black text-sm group-hover:text-benin-green transition-colors">{item.name}</p>
                        <p className="text-[10px] text-slate-400 font-medium">{item.quantity} {item.unit} x {item.proposedPricePerUnit} FCFA</p>
                      </div>
                      <p className="font-black text-sm">{item.total} FCFA</p>
                    </div>
                  ))}
                </div>

                <div className="pt-6 border-t border-white/10 space-y-4">
                  <div className="flex justify-between text-slate-400 text-xs font-medium">
                    <span>Sous-total</span>
                    <span>{order.subTotal} FCFA</span>
                  </div>
                  <div className="flex justify-between text-slate-400 text-xs font-medium">
                    <span>Livraison</span>
                    <span>{order.deliveryFee} FCFA</span>
                  </div>
                  <div className="flex justify-between items-center pt-4">
                    <span className="text-lg font-black">Total</span>
                    <span className="text-2xl font-black text-benin-green">{order.totalAmount} FCFA</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
