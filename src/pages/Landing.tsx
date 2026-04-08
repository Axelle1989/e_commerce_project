import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowRight, ShoppingBag, Truck, ShieldCheck } from 'lucide-react';
import { BENIN_IMAGES } from '../constants/images';
import ImageWithFallback from '../components/ImageWithFallback';

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 font-sans">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg flex flex-col items-center text-center space-y-8"
      >
        {/* Hero Image Container */}
        <div className="w-full aspect-[4/3] rounded-[40px] overflow-hidden shadow-2xl shadow-benin-green/20 border-8 border-white relative">
          <ImageWithFallback 
            src={BENIN_IMAGES.market.dantokpa} 
            alt="Marché Dantokpa" 
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
        </div>

        {/* Text Content */}
        <div className="space-y-4">
          <h1 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tighter leading-tight">
            Vos courses au marché, <br/>
            <span className="text-benin-green">sans bouger de chez vous.</span>
          </h1>
          <p className="text-lg text-slate-500 font-medium max-w-md mx-auto">
            Commandez vos produits frais directement depuis les marchés de Cotonou. Livraison rapide et prix garantis.
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-3 gap-4 w-full py-4">
          <div className="flex flex-col items-center gap-2">
            <div className="w-12 h-12 bg-benin-green/10 rounded-2xl flex items-center justify-center">
              <ShoppingBag className="w-6 h-6 text-benin-green" />
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Frais</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="w-12 h-12 bg-benin-yellow/10 rounded-2xl flex items-center justify-center">
              <Truck className="w-6 h-6 text-benin-yellow" />
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Rapide</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="w-12 h-12 bg-benin-red/10 rounded-2xl flex items-center justify-center">
              <ShieldCheck className="w-6 h-6 text-benin-red" />
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Sécurisé</span>
          </div>
        </div>

        {/* Action Button */}
        <button 
          onClick={() => navigate('/login')}
          className="w-full py-6 bg-slate-900 text-white rounded-[24px] font-black text-lg uppercase tracking-widest flex items-center justify-center gap-4 hover:bg-black transition-all active:scale-95 shadow-2xl shadow-slate-900/20 group"
        >
          Commencer
          <ArrowRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
        </button>

        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">
          Disponible à Cotonou & Abomey-Calavi
        </p>
      </motion.div>
    </div>
  );
}
