import { Outlet, Link, useNavigate } from 'react-router-dom';
import { ShoppingCart, MapPin, User, LogOut, Package, LayoutDashboard, Truck, Store } from 'lucide-react';
import { auth } from '../firebase';
import { UserProfile } from '../types';

interface LayoutProps {
  user: UserProfile | null;
}

export default function Layout({ user }: LayoutProps) {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await auth.signOut();
    navigate('/login');
  };

  if (!user) return <Outlet />;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-xl border-b border-slate-100 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="bg-benin-green p-2.5 rounded-2xl shadow-lg shadow-benin-green/20 group-hover:scale-110 transition-transform">
              <Truck className="text-white w-6 h-6" />
            </div>
            <span className="font-black text-2xl tracking-tighter text-slate-900">CourseExpress</span>
          </Link>

          <nav className="hidden md:flex items-center gap-8">
            {user.role === 'client' && (
              <>
                <Link to="/client" className="text-slate-500 hover:text-benin-green font-black text-sm uppercase tracking-widest transition-colors">Marché</Link>
                <Link to="/suivi-commande/active" className="text-slate-500 hover:text-benin-green font-black text-sm uppercase tracking-widest transition-colors">Suivi</Link>
                <Link to="/profile" className="text-slate-500 hover:text-benin-green font-black text-sm uppercase tracking-widest transition-colors">Historique</Link>
              </>
            )}
            {user.role === 'driver' && (
              <>
                <Link to="/livreur" className="text-slate-500 hover:text-benin-green font-black text-sm uppercase tracking-widest transition-colors">Missions</Link>
                <Link to="/earnings" className="text-slate-500 hover:text-benin-green font-black text-sm uppercase tracking-widest transition-colors">Gains</Link>
              </>
            )}
            {user.role === 'admin' && (
              <Link to="/admin" className="text-slate-500 hover:text-benin-green font-black text-sm uppercase tracking-widest transition-colors flex items-center gap-2">
                <LayoutDashboard className="w-4 h-4" /> Admin
              </Link>
            )}
          </nav>

          <div className="flex items-center gap-4">
            <Link to="/profile" className="hidden sm:flex items-center gap-3 px-4 py-2 bg-slate-50 rounded-2xl border border-slate-100 hover:bg-slate-100 transition-colors">
              <div className="w-8 h-8 bg-benin-yellow rounded-xl flex items-center justify-center overflow-hidden">
                {user.photoURL ? (
                  <img src={user.photoURL} alt="" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-4 h-4 text-white" />
                )}
              </div>
              <span className="text-xs font-black text-slate-900 uppercase tracking-widest">{user.displayName?.split(' ')[0] || 'Profil'}</span>
            </Link>
            <button
              onClick={handleLogout}
              className="p-2.5 text-slate-300 hover:text-benin-red hover:bg-benin-red/5 rounded-xl transition-all"
              title="Déconnexion"
            >
              <LogOut className="w-6 h-6" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-10">
        <Outlet />
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden bg-white/90 backdrop-blur-2xl border-t border-slate-100 fixed bottom-0 left-0 right-0 h-20 flex items-center justify-around px-6 z-50 shadow-2xl shadow-slate-900/10">
        {user.role === 'client' ? (
          <>
            <Link to="/client" className="flex flex-col items-center gap-1.5 text-slate-400 hover:text-benin-green transition-colors group">
              <Store className="w-6 h-6 group-hover:scale-110 transition-transform" />
              <span className="text-[10px] font-black uppercase tracking-widest">Marché</span>
            </Link>
            <Link to="/suivi-commande/active" className="flex flex-col items-center gap-1.5 text-slate-400 hover:text-benin-green transition-colors group">
              <MapPin className="w-6 h-6 group-hover:scale-110 transition-transform" />
              <span className="text-[10px] font-black uppercase tracking-widest">Suivi</span>
            </Link>
            <Link to="/profile" className="flex flex-col items-center gap-1.5 text-slate-400 hover:text-benin-green transition-colors group">
              <User className="w-6 h-6 group-hover:scale-110 transition-transform" />
              <span className="text-[10px] font-black uppercase tracking-widest">Profil</span>
            </Link>
          </>
        ) : (
          <>
            <Link to="/livreur" className="flex flex-col items-center gap-1.5 text-slate-400 hover:text-benin-green transition-colors group">
              <Package className="w-6 h-6 group-hover:scale-110 transition-transform" />
              <span className="text-[10px] font-black uppercase tracking-widest">Commandes</span>
            </Link>
            <Link to="/profile" className="flex flex-col items-center gap-1.5 text-slate-400 hover:text-benin-green transition-colors group">
              <User className="w-6 h-6 group-hover:scale-110 transition-transform" />
              <span className="text-[10px] font-black uppercase tracking-widest">Profil</span>
            </Link>
          </>
        )}
        <button onClick={handleLogout} className="flex flex-col items-center gap-1.5 text-slate-400 hover:text-benin-red transition-colors group">
          <LogOut className="w-6 h-6 group-hover:scale-110 transition-transform" />
          <span className="text-[10px] font-black uppercase tracking-widest">Quitter</span>
        </button>
      </nav>
    </div>
  );
}
