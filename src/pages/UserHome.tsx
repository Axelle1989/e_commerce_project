import React, { useState, useEffect } from 'react';
import { collection, addDoc, serverTimestamp, doc, getDoc, query, where, onSnapshot, limit, getDocs } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { OrderItem, GeoPoint, Order } from '../types';
import { ShoppingCart, Plus, Minus, Trash2, Package, ArrowRight, Info, AlertCircle, MapPin, Loader2, Bell, Pencil } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import ImageWithFallback from '../components/ImageWithFallback';
import MapPicker from '../components/MapPicker';
import { BENIN_IMAGES } from '../constants/images';

export default function UserHome() {
  const [cart, setCart] = useState<OrderItem[]>(() => {
    const saved = localStorage.getItem('course_express_cart');
    return saved ? JSON.parse(saved) : [];
  });
  const [loading, setLoading] = useState(false);
  const [deliveryLocation, setDeliveryLocation] = useState<GeoPoint | null>(null);
  const [deliveryFee, setDeliveryFee] = useState(500);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [units, setUnits] = useState<{ id: string, label: string }[]>([
    { id: 'kg', label: 'kilo (kg)' },
    { id: 'g', label: 'gramme (g)' },
    { id: 'L', label: 'litre (L)' },
    { id: 'tas', label: 'tas' },
    { id: 'botte', label: 'botte' },
    { id: 'pièce', label: 'pièce' },
    { id: 'sac', label: 'sac' },
    { id: 'douzaine', label: 'douzaine' }
  ]);
  const navigate = useNavigate();

  // Persist cart
  useEffect(() => {
    localStorage.setItem('course_express_cart', JSON.stringify(cart));
  }, [cart]);

  // Fetch active order
  useEffect(() => {
    if (!auth.currentUser) return;

    const q = query(
      collection(db, 'orders'),
      where('userId', '==', auth.currentUser.uid),
      where('status', '!=', 'delivered'),
      limit(1)
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        setActiveOrder({ id: snap.docs[0].id, ...snap.docs[0].data() } as Order);
      } else {
        setActiveOrder(null);
      }
    });

    return () => unsubscribe();
  }, []);

  // Fetch delivery fee from settings if available
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const settingsSnap = await getDoc(doc(db, 'settings', 'delivery'));
        if (settingsSnap.exists()) {
          setDeliveryFee(settingsSnap.data().fixedFee || 500);
        }
      } catch (error) {
        console.error('Error fetching delivery fee:', error);
      }
    };
    fetchSettings();
  }, []);

  // Fetch units
  useEffect(() => {
    const fetchUnits = async () => {
      try {
        const unitSnap = await getDocs(collection(db, 'units'));
        if (!unitSnap.empty) {
          setUnits(unitSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)));
        }
      } catch (error) {
        console.error('Error fetching units:', error);
      }
    };
    fetchUnits();
  }, []);

  // Form state for new item
  const [newItem, setNewItem] = useState({
    name: '',
    quantity: 1,
    unit: '',
    proposedPricePerUnit: 100
  });

  const addItemToCart = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.name.trim() || newItem.proposedPricePerUnit < 25 || !newItem.unit) return;

    const item: OrderItem = {
      tempId: Math.random().toString(36).substr(2, 9),
      name: newItem.name.trim(),
      quantity: newItem.quantity,
      unit: newItem.unit,
      proposedPricePerUnit: newItem.proposedPricePerUnit,
      total: newItem.quantity * newItem.proposedPricePerUnit
    };

    setCart(prev => [...prev, item]);
    setNewItem({ name: '', quantity: 1, unit: '', proposedPricePerUnit: 100 });
  };

  const removeFromCart = (index: number) => {
    setCart(prev => prev.filter((_, i) => i !== index));
  };

  const editCartItem = (index: number) => {
    const item = cart[index];
    setNewItem({
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      proposedPricePerUnit: item.proposedPricePerUnit
    });
    removeFromCart(index);
    // Scroll to form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const updateCartItemQuantity = (index: number, delta: number) => {
    setCart(prev => prev.map((item, i) => {
      if (i === index) {
        const newQty = Math.max(1, item.quantity + delta);
        return { ...item, quantity: newQty, total: newQty * item.proposedPricePerUnit };
      }
      return item;
    }));
  };

  const subTotal = cart.reduce((sum, item) => sum + item.total, 0);

  const handleCheckout = async () => {
    if (!auth.currentUser || cart.length === 0 || !deliveryLocation) return;
    setLoading(true);
    
    try {
      const orderData = {
        userId: auth.currentUser.uid,
        items: cart,
        subTotal,
        totalAmount: subTotal + deliveryFee,
        deliveryFee,
        status: 'pending', // As requested: status = "pending" (en attente d'un livreur)
        userLocation: deliveryLocation,
        createdAt: serverTimestamp(),
        driverId: null
      };

      const docRef = await addDoc(collection(db, 'orders'), orderData);
      
      // Clear cart
      setCart([]);
      localStorage.removeItem('course_express_cart');
      
      // Redirect to tracking or payment
      navigate(`/suivi-commande/${docRef.id}`);
    } catch (error) {
      console.error('Checkout error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-12 pb-24">
      {/* Active Order Banner */}
      <AnimatePresence>
        {activeOrder && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-slate-900 text-white p-6 rounded-[32px] shadow-2xl flex flex-col md:flex-row items-center justify-between gap-6 border border-white/10"
          >
            <div className="flex items-center gap-5">
              <div className="w-14 h-14 bg-benin-green rounded-2xl flex items-center justify-center shadow-lg shadow-benin-green/20">
                <Bell className="w-7 h-7 animate-bounce" />
              </div>
              <div>
                <h3 className="text-lg font-black tracking-tight">Commande en cours !</h3>
                <p className="text-sm text-slate-400 font-medium">
                  {activeOrder.status === 'pending' ? "Recherche d'un livreur..." : 
                   activeOrder.status === 'accepted' ? "Livreur en route vers le marché" :
                   activeOrder.status === 'at_market' ? "Livreur au marché" : "Livreur en route vers vous"}
                </p>
              </div>
            </div>
            <button
              onClick={() => navigate(`/suivi-commande/${activeOrder.id}`)}
              className="w-full md:w-auto px-8 py-4 bg-benin-green text-white rounded-2xl font-black text-sm hover:bg-benin-green/90 transition-all active:scale-95 flex items-center justify-center gap-3 shadow-xl shadow-benin-green/20"
            >
              Suivre ma commande <ArrowRight className="w-5 h-5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hero Section */}
      <section className="relative h-64 rounded-[40px] overflow-hidden shadow-2xl">
        <ImageWithFallback 
          src={BENIN_IMAGES.hero.cotonou} 
          alt="Marché Bénin" 
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 flex flex-col justify-center px-12 text-white space-y-4">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-5xl font-black tracking-tighter"
          >
            Vos courses, <br/> votre prix.
          </motion.h1>
          <p className="text-xl text-white/80 font-medium max-w-md">
            Dites-nous ce qu'il vous faut et proposez votre prix. Un livreur s'occupe du reste.
          </p>
          <div className="flex gap-4">
            <button 
              onClick={() => navigate('/suivi-commande/active')}
              className="px-6 py-3 bg-white/10 backdrop-blur-md text-white border border-white/20 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-white/20 transition-all flex items-center gap-2"
            >
              <MapPin className="w-4 h-4" /> Voir suivi (démo)
            </button>
          </div>
        </div>
      </section>

      {/* How it works Section */}
      <section className="space-y-10">
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">Comment ça marche ?</h2>
          <p className="text-slate-500 font-medium">Commandez vos courses en 3 étapes simples.</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            {
              title: "1. Listez vos articles",
              desc: "Saisissez ce dont vous avez besoin, même sans prix fixe.",
              img: "https://images.unsplash.com/photo-1543083477-4f785aeafaa9?auto=format&fit=crop&q=80&w=800"
            },
            {
              title: "2. Proposez votre prix",
              desc: "Fixez un budget raisonnable pour vos articles.",
              img: BENIN_IMAGES.gains.cash
            },
            {
              title: "3. Livraison rapide",
              desc: "Un livreur accepte et vous livre à domicile.",
              img: BENIN_IMAGES.delivery.zemidjan
            }
          ].map((step, i) => (
            <motion.div 
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="bg-white rounded-[40px] overflow-hidden border border-slate-100 shadow-sm hover:shadow-xl transition-all group"
            >
              <div className="h-48 overflow-hidden">
                <ImageWithFallback 
                  src={step.img} 
                  alt={step.title} 
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" 
                />
              </div>
              <div className="p-8 space-y-2">
                <h3 className="font-black text-slate-900">{step.title}</h3>
                <p className="text-sm text-slate-500 font-medium leading-relaxed">{step.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Trust Section */}
      <section className="bg-slate-900 rounded-[48px] p-12 overflow-hidden relative">
        <div className="absolute top-0 right-0 w-64 h-64 bg-benin-green/20 blur-[100px] rounded-full" />
        <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <h2 className="text-4xl font-black text-white tracking-tighter leading-tight">
              Rejoignez des milliers d'utilisateurs satisfaits.
            </h2>
            <p className="text-slate-400 font-medium text-lg">
              CourseExpress est la plateforme n°1 à Cotonou pour la livraison de courses à domicile.
            </p>
            <div className="flex items-center gap-4">
              <div className="flex -space-x-4">
                {[1, 2, 3, 4].map(i => (
                  <ImageWithFallback 
                    key={i} 
                    src={`https://i.pravatar.cc/100?img=${i+10}&t=${Date.now()}`} 
                    alt="" 
                    className="w-12 h-12 rounded-full border-4 border-slate-900 object-cover" 
                  />
                ))}
              </div>
              <p className="text-white font-black text-sm">+2,000 clients</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <ImageWithFallback 
              src={BENIN_IMAGES.market.dantokpa} 
              alt="Marché Dantokpa" 
              className="rounded-3xl h-40 w-full object-cover shadow-2xl" 
            />
            <ImageWithFallback 
              src={BENIN_IMAGES.market.vendeuse} 
              alt="Vendeuse Béninoise" 
              className="rounded-3xl h-40 w-full object-cover shadow-2xl mt-8" 
            />
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        {/* Add Item Form */}
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-white p-10 rounded-[48px] border border-slate-100 shadow-xl space-y-8">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-benin-green/10 rounded-2xl flex items-center justify-center text-benin-green">
                <Plus className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-3xl font-black text-slate-900 tracking-tight">Ajouter un article</h2>
                <p className="text-slate-500 font-medium">Saisissez les détails de ce que vous voulez acheter.</p>
              </div>
            </div>

            {/* Suggestions Section */}
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Suggestions du marché</h3>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {[
                  { name: 'Oignons rouges', unit: 'tas', price: 300, img: BENIN_IMAGES.products.onions },
                  { name: 'Piments forts', unit: 'tas', price: 200, img: BENIN_IMAGES.products.peppers },
                  { name: 'Gari (Manioc)', unit: 'sac', price: 2500, img: BENIN_IMAGES.products.gari },
                  { name: 'Riz local', unit: 'sac', price: 15000, img: BENIN_IMAGES.products.rice },
                  { name: 'Feuilles de légumes', unit: 'botte', price: 200, img: BENIN_IMAGES.products.leafyVegetables }
                ].map((item, i) => (
                  <motion.button
                    key={i}
                    whileHover={{ y: -5 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => {
                      setNewItem({
                        name: item.name,
                        quantity: 1,
                        unit: item.unit,
                        proposedPricePerUnit: item.price
                      });
                      window.scrollTo({ top: document.getElementById('add-item-form')?.offsetTop ? document.getElementById('add-item-form')!.offsetTop - 100 : 0, behavior: 'smooth' });
                    }}
                    className="bg-slate-50 p-4 rounded-3xl border border-slate-100 hover:border-benin-green/30 hover:bg-white transition-all text-left space-y-3 group"
                  >
                    <div className="aspect-square rounded-2xl overflow-hidden bg-white shadow-sm">
                      <ImageWithFallback src={item.img} alt={item.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                    </div>
                    <div>
                      <p className="font-black text-slate-900 text-xs truncate">{item.name}</p>
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{item.price} FCFA / {item.unit}</p>
                    </div>
                  </motion.button>
                ))}
              </div>
            </div>

            <form id="add-item-form" onSubmit={addItemToCart} className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-10 border-t border-slate-50">
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-black text-slate-400 uppercase tracking-widest">Nom de l'article (e.g. Tomates, Oignons, Riz)</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Tomates fraîches"
                  value={newItem.name}
                  onChange={e => setNewItem(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 font-bold text-slate-900 focus:border-benin-green focus:bg-white transition-all outline-none"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-black text-slate-400 uppercase tracking-widest">Unité</label>
                <select
                  required
                  value={newItem.unit}
                  onChange={e => setNewItem(prev => ({ ...prev, unit: e.target.value }))}
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 font-bold text-slate-900 focus:border-benin-green focus:bg-white transition-all outline-none appearance-none"
                >
                  <option value="" disabled>Choisir l'unité</option>
                  {units.map(u => (
                    <option key={u.id} value={u.id}>{u.label}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-black text-slate-400 uppercase tracking-widest">Quantité ({newItem.unit})</label>
                <input
                  type="number"
                  min="1"
                  step="any"
                  required
                  value={newItem.quantity}
                  onChange={e => setNewItem(prev => ({ ...prev, quantity: parseFloat(e.target.value) || 1 }))}
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 font-bold text-slate-900 focus:border-benin-green focus:bg-white transition-all outline-none"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-black text-slate-400 uppercase tracking-widest">Prix proposé (par {newItem.unit})</label>
                <div className="relative">
                  <input
                    type="number"
                    min="25"
                    required
                    value={newItem.proposedPricePerUnit}
                    onChange={e => setNewItem(prev => ({ ...prev, proposedPricePerUnit: parseInt(e.target.value) || 0 }))}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 font-bold text-slate-900 focus:border-benin-green focus:bg-white transition-all outline-none pr-16"
                  />
                  <span className="absolute right-6 top-1/2 -translate-y-1/2 font-black text-slate-400">FCFA</span>
                </div>
              </div>

              <div className="md:col-span-2 p-6 bg-benin-yellow/10 rounded-3xl border border-benin-yellow/20 flex items-start gap-4">
                <Info className="w-6 h-6 text-benin-yellow shrink-0" />
                <div className="space-y-1">
                  <p className="font-black text-slate-900">Total pour cet article : {newItem.quantity * newItem.proposedPricePerUnit} FCFA</p>
                  <p className="text-sm text-slate-600 font-medium">Proposez un prix juste pour que les livreurs acceptent rapidement votre commande.</p>
                </div>
              </div>

              <button
                type="submit"
                className="md:col-span-2 bg-slate-900 text-white py-5 rounded-2xl font-black shadow-xl shadow-slate-900/20 hover:bg-benin-green transition-all active:scale-95 flex items-center justify-center gap-3"
              >
                <Plus className="w-6 h-6" /> Ajouter au panier
              </button>
            </form>
          </div>

          <div className="p-8 bg-slate-50 rounded-[40px] border border-slate-100 flex items-center gap-6">
            <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-slate-400 shadow-sm">
              <AlertCircle className="w-8 h-8" />
            </div>
            <div>
              <h3 className="font-black text-slate-900">Comment ça marche ?</h3>
              <p className="text-slate-500 font-medium">Le livreur ira au marché de son choix. S'il trouve les produits moins chers que votre prix proposé, il garde la différence comme bonus !</p>
            </div>
          </div>
        </div>

        {/* Cart Sidebar */}
        <div className="lg:col-span-1">
          <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-2xl sticky top-24 space-y-8">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-black text-slate-900 flex items-center gap-2">
                <ShoppingCart className="w-6 h-6 text-benin-green" /> Panier
              </h2>
              <span className="bg-benin-green/10 text-benin-green px-3 py-1 rounded-full text-xs font-black">
                {cart.length} articles
              </span>
            </div>

            <div className="space-y-4 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
              <AnimatePresence mode="popLayout">
                {cart.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center py-12 space-y-4"
                  >
                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto">
                      <ShoppingCart className="w-8 h-8 text-slate-200" />
                    </div>
                    <p className="text-slate-400 text-sm font-medium italic">Votre panier est vide</p>
                  </motion.div>
                ) : (
                  cart.map((item, index) => (
                    <motion.div
                      key={item.tempId || index}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl group"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-900 text-sm truncate">{item.name}</p>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          {item.quantity} {item.unit} x {item.proposedPricePerUnit} FCFA/{item.unit}
                        </p>
                        <p className="text-xs font-black text-benin-green">{item.total} FCFA</p>
                      </div>
                      <div className="flex items-center gap-2 bg-white rounded-xl p-1 shadow-sm">
                        <button onClick={() => updateCartItemQuantity(index, -1)} className="p-1 hover:bg-slate-50 rounded-lg transition-colors">
                          <Minus className="w-3 h-3 text-slate-400" />
                        </button>
                        <span className="text-xs font-black w-4 text-center">{item.quantity}</span>
                        <button onClick={() => updateCartItemQuantity(index, 1)} className="p-1 hover:bg-slate-50 rounded-lg transition-colors">
                          <Plus className="w-3 h-3 text-slate-400" />
                        </button>
                      </div>
                      <div className="flex flex-col gap-2">
                        <button onClick={() => editCartItem(index)} className="text-slate-300 hover:text-benin-green transition-colors">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => removeFromCart(index)} className="text-slate-300 hover:text-red-500 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </div>

            <div className="pt-8 border-t border-slate-100 space-y-6">
                <MapPicker 
                  onLocationSelect={(lat, lng, address) => setDeliveryLocation({ latitude: lat, longitude: lng, address })} 
                />

                <div className="space-y-3">
                  <div className="flex justify-between text-sm text-slate-500">
                    <span>Sous-total proposé</span>
                    <span className="font-bold">{subTotal} FCFA</span>
                  </div>
                  <div className="flex justify-between text-sm text-slate-500">
                    <span>Livraison</span>
                    <span className="font-bold">{deliveryFee} FCFA</span>
                  </div>
                  <div className="flex justify-between items-center pt-4 border-t border-slate-100">
                    <span className="text-lg font-black text-slate-900">Total</span>
                    <span className="text-3xl font-black text-benin-green">{subTotal + deliveryFee} FCFA</span>
                  </div>
                </div>

                <button
                  onClick={handleCheckout}
                  disabled={loading || !deliveryLocation || cart.length === 0}
                  className="w-full bg-benin-green text-white py-5 rounded-2xl font-black shadow-xl shadow-benin-green/20 hover:bg-benin-green/90 transition-all active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50"
                >
                  {loading ? 'Traitement...' : 'VALIDER MA COMMANDE'} <ArrowRight className="w-5 h-5" />
                </button>
                {!deliveryLocation && cart.length > 0 && (
                  <p className="text-[10px] text-benin-red font-black text-center uppercase tracking-widest">Veuillez sélectionner un lieu de livraison sur la carte</p>
                )}
                {cart.length === 0 && (
                  <p className="text-[10px] text-slate-400 font-black text-center uppercase tracking-widest">Ajoutez des articles pour commander</p>
                )}
              </div>
          </div>
        </div>
      </div>
      {/* Help Section */}
      <section className="bg-white p-10 rounded-[48px] border border-slate-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-8">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-slate-50 rounded-3xl flex items-center justify-center text-slate-400">
            <Info className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-2xl font-black text-slate-900 tracking-tight">Besoin d'aide ?</h3>
            <p className="text-slate-500 font-medium">Vous ne trouvez pas votre commande ou avez un problème ?</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-4 w-full md:w-auto">
          <button 
            onClick={() => navigate('/suivi-commande/active')}
            className="flex-1 md:flex-none px-8 py-4 bg-slate-900 text-white rounded-2xl font-black text-sm hover:bg-black transition-all active:scale-95 flex items-center justify-center gap-3"
          >
            <MapPin className="w-5 h-5" /> Voir suivi (démo)
          </button>
          <button className="flex-1 md:flex-none px-8 py-4 bg-slate-50 text-slate-600 rounded-2xl font-black text-sm hover:bg-slate-100 transition-all active:scale-95">
            Contacter le support
          </button>
        </div>
      </section>
    </div>
  );
}
