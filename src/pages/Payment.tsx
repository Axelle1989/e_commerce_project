import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Order } from '../types';
import { CreditCard, ShieldCheck, ArrowRight, Loader2, CheckCircle, Smartphone, Wallet } from 'lucide-react';
import { motion } from 'motion/react';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default function Payment() {
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get('orderId');
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [success, setSuccess] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'momo' | 'card'>('momo');
  const navigate = useNavigate();

  useEffect(() => {
    const fetchOrder = async () => {
      if (!orderId || !auth.currentUser) return;
      const docSnap = await getDoc(doc(db, 'orders', orderId));
      if (docSnap.exists()) {
        setOrder({ id: docSnap.id, ...docSnap.data() } as Order);
      }
      setLoading(false);
    };
    fetchOrder();
  }, [orderId]);

  const handlePayment = async () => {
    setPaying(true);
    // Simulate API call to MoMo or Stripe
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    try {
      if (orderId) {
        await updateDoc(doc(db, 'orders', orderId), {
          status: 'pending',
          paymentMethod
        });
        setSuccess(true);
        setTimeout(() => {
          navigate(`/suivi-commande/${orderId}`);
        }, 2000);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${orderId}`);
    } finally {
      setPaying(false);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin h-8 w-8 text-benin-green" /></div>;
  if (!order) return <div className="text-center py-20 text-slate-500 font-medium italic">Commande introuvable</div>;

  return (
    <div className="max-w-md mx-auto space-y-10 pb-20">
      <div className="text-center space-y-3">
        <h2 className="text-4xl font-black text-slate-900 tracking-tighter">Paiement Sécurisé</h2>
        <p className="text-slate-500 font-medium">Choisissez votre mode de paiement préféré au Bénin.</p>
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-[40px] border border-slate-100 shadow-2xl shadow-slate-200/50 overflow-hidden"
      >
        <div className="p-10 bg-slate-900 text-white space-y-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-benin-green/20 rounded-full blur-3xl -mr-16 -mt-16"></div>
          <div className="flex justify-between items-start relative z-10">
            <div className="space-y-2">
              <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Montant Total</p>
              <p className="text-5xl font-black">{order.totalAmount} FCFA</p>
            </div>
            <div className="bg-white/10 p-4 rounded-2xl backdrop-blur-md border border-white/10">
              <Wallet className="w-6 h-6 text-benin-yellow" />
            </div>
          </div>
          
          <div className="flex items-center gap-3 text-[10px] text-slate-400 font-black uppercase tracking-wider bg-white/5 p-4 rounded-2xl border border-white/10 relative z-10">
            <ShieldCheck className="w-4 h-4 text-benin-green" />
            Paiement sécurisé par cryptage AES-256
          </div>
        </div>

        <div className="p-10 space-y-8">
          {/* Payment Methods */}
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => setPaymentMethod('momo')}
              className={`p-4 rounded-3xl border-2 transition-all flex flex-col items-center gap-2 ${
                paymentMethod === 'momo' 
                  ? 'border-benin-green bg-benin-green/5' 
                  : 'border-slate-100 hover:border-slate-200'
              }`}
            >
              <Smartphone className={`w-6 h-6 ${paymentMethod === 'momo' ? 'text-benin-green' : 'text-slate-400'}`} />
              <span className={`text-xs font-black ${paymentMethod === 'momo' ? 'text-benin-green' : 'text-slate-500'}`}>Mobile Money</span>
            </button>
            <button
              onClick={() => setPaymentMethod('card')}
              className={`p-4 rounded-3xl border-2 transition-all flex flex-col items-center gap-2 ${
                paymentMethod === 'card' 
                  ? 'border-benin-green bg-benin-green/5' 
                  : 'border-slate-100 hover:border-slate-200'
              }`}
            >
              <CreditCard className={`w-6 h-6 ${paymentMethod === 'card' ? 'text-benin-green' : 'text-slate-400'}`} />
              <span className={`text-xs font-black ${paymentMethod === 'card' ? 'text-benin-green' : 'text-slate-500'}`}>Carte Bancaire</span>
            </button>
          </div>

          <div className="space-y-6">
            <h3 className="font-black text-slate-900 flex items-center gap-3">
              <div className="w-1.5 h-5 bg-benin-green rounded-full"></div>
              Récapitulatif
            </h3>
            <div className="space-y-4">
              {order.items.map((item, i) => (
                <div key={`${item.name}-${i}`} className="flex justify-between text-sm">
                  <span className="text-slate-500 font-medium">{item.quantity}x {item.name}</span>
                  <span className="font-black text-slate-900">{item.proposedPricePerUnit * item.quantity} FCFA</span>
                </div>
              ))}
              <div className="flex justify-between text-sm pt-4 border-t border-slate-100">
                <span className="text-slate-500 font-medium italic">Frais de livraison</span>
                <span className="font-black text-slate-900">{order.deliveryFee} FCFA</span>
              </div>
            </div>
          </div>

          <button
            onClick={handlePayment}
            disabled={paying || success}
            className={`w-full py-5 rounded-2xl font-black flex items-center justify-center gap-3 transition-all active:scale-95 shadow-xl ${
              success 
                ? 'bg-emerald-500 text-white shadow-emerald-200' 
                : 'bg-benin-green text-white shadow-benin-green/20 hover:bg-benin-green/90'
            }`}
          >
            {paying ? (
              <Loader2 className="animate-spin w-6 h-6" />
            ) : success ? (
              <>
                <CheckCircle className="w-6 h-6" />
                Paiement Réussi
              </>
            ) : (
              <>
                Payer {order.totalAmount} FCFA
                <ArrowRight className="w-6 h-6" />
              </>
            )}
          </button>
        </div>
      </motion.div>

      <div className="flex flex-col items-center gap-4 opacity-40">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Partenaires de paiement</p>
        <div className="flex items-center gap-6 grayscale">
          <img src="https://upload.wikimedia.org/wikipedia/commons/9/93/MTN_Logo.svg" alt="MTN MoMo" className="h-6" referrerPolicy="no-referrer" />
          <img src="https://upload.wikimedia.org/wikipedia/commons/b/ba/Stripe_Logo%2C_revised_2016.svg" alt="Stripe" className="h-5" referrerPolicy="no-referrer" />
          <img src="https://upload.wikimedia.org/wikipedia/commons/5/5e/Visa_Inc._logo.svg" alt="Visa" className="h-3" referrerPolicy="no-referrer" />
        </div>
      </div>
    </div>
  );
}
