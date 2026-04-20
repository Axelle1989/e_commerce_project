import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { UserProfile } from './types';

// Pages
import UserHome from './pages/UserHome';
import Payment from './pages/Payment';
import SuiviCommande from './pages/SuiviCommande';
import DriverHome from './pages/DriverHome';
import DriverActive from './pages/DriverActive';
import DriverOnboarding from './pages/DriverOnboarding';
import BackOffice from './pages/BackOffice';
import Login from './pages/Login';
import Profile from './pages/Profile';
import Landing from './pages/Landing';
import Register from './pages/Register';
import VerifyCode from './pages/VerifyCode';

// Components
import Layout from './components/Layout';

// Role-based Route Protection
const PrivateRoute = ({ children, user, loading, allowedRoles }: { children: React.ReactNode, user: UserProfile | null, loading: boolean, allowedRoles?: string[] }) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-benin-green"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" />;
  }

  if (!user.role) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <h1 className="text-2xl font-black text-slate-900 mb-4">Rôle non défini</h1>
        <p className="text-slate-500 mb-8">Votre compte n'a pas de rôle assigné. Veuillez contacter le support.</p>
        <button 
          onClick={() => auth.signOut()}
          className="px-8 py-3 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-xs"
        >
          Se déconnecter
        </button>
      </div>
    );
  }

  return <>{children}</>;
};

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;
    
    // Safety timeout to prevent infinite loading
    const loadingTimeout = setTimeout(() => {
      if (loading) {
        console.warn('App loading timeout reached');
        setLoading(false);
      }
    }, 8000);

    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }

      if (firebaseUser) {
        // Immediately set a minimal user to allow some UI to render if needed
        // but keep loading true until we get the profile or timeout
        unsubscribeProfile = onSnapshot(doc(db, 'users', firebaseUser.uid), (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            const isDefaultAdmin = firebaseUser.email?.toLowerCase() === 'axo.hossou@epitech.eu';
            const role = data.role || (isDefaultAdmin ? 'admin' : 'client');
            
            if (isDefaultAdmin && data.role !== 'admin') {
              updateDoc(doc(db, 'users', firebaseUser.uid), { role: 'admin' }).catch(e => {
                console.error('Error updating admin role:', e);
              });
              setUser({ uid: docSnap.id, ...data, role: 'admin' } as UserProfile);
            } else {
              setUser({ uid: docSnap.id, ...data, role } as UserProfile);
            }
          } else {
            // Document doesn't exist yet (might be registering)
            const isDefaultAdmin = firebaseUser.email?.toLowerCase() === 'axo.hossou@epitech.eu';
            setUser({
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              role: isDefaultAdmin ? 'admin' : 'client',
              status: 'active',
              createdAt: new Date()
            } as UserProfile);
          }
          setLoading(false);
          clearTimeout(loadingTimeout);
        }, (error) => {
          console.error('Profile snapshot error:', error);
          if (auth.currentUser) {
            const isDefaultAdmin = auth.currentUser.email?.toLowerCase() === 'axo.hossou@epitech.eu';
            setUser({
              uid: auth.currentUser.uid,
              email: auth.currentUser.email || '',
              role: isDefaultAdmin ? 'admin' : 'client',
              status: 'active',
            } as UserProfile);
          }
          setLoading(false);
          clearTimeout(loadingTimeout);
        });
      } else {
        setUser(null);
        setLoading(false);
        clearTimeout(loadingTimeout);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
      clearTimeout(loadingTimeout);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-benin-green"></div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={!user || user.status === 'pending_email_verification' ? <Login /> : (
          user.role === 'admin' ? <Navigate to="/admin" /> :
          user.role === 'driver' ? (user.status === 'active' ? <Navigate to="/livreur" /> : <Navigate to="/onboarding" />) :
          <Navigate to="/client" />
        )} />
        
        <Route path="/register" element={<Register />} />
        <Route path="/verify" element={<VerifyCode />} />
        
        <Route path="/" element={
          !user || user.status === 'pending_email_verification' ? <Landing /> : (
            user.role === 'admin' ? <Navigate to="/admin" /> :
            user.role === 'driver' ? (user.status === 'active' ? <Navigate to="/livreur" /> : <Navigate to="/onboarding" />) :
            <Navigate to="/client" />
          )
        } />

        <Route element={<PrivateRoute user={user && user.status !== 'pending_email_verification' ? user : null} loading={loading}><Layout user={user} /></PrivateRoute>}>
          <Route path="/client" element={user?.role === 'client' ? <UserHome /> : <Navigate to="/" />} />
          <Route path="/payment" element={<Payment />} />
          <Route path="/suivi-commande/:orderId" element={<SuiviCommande />} />
          <Route path="/profile" element={user ? <Profile user={user} /> : <Navigate to="/login" />} />
          
          {/* Driver Routes */}
          <Route path="/livreur" element={
            user?.role === 'driver' 
              ? (user.status === 'active' ? <DriverHome /> : <Navigate to="/onboarding" />) 
              : <Navigate to="/" />
          } />
          <Route path="/driver/active/:orderId" element={
            user?.role === 'driver' 
              ? (user.status === 'active' ? <DriverActive /> : <Navigate to="/onboarding" />) 
              : <Navigate to="/" />
          } />
          <Route path="/onboarding" element={
            user?.role === 'driver' ? <DriverOnboarding /> : <Navigate to="/" />
          } />
        </Route>

        {/* Admin Routes - Separate Layout */}
        <Route path="/admin" element={
          <PrivateRoute user={user} loading={loading} allowedRoles={['admin']}>
            <BackOffice />
          </PrivateRoute>
        } />
        
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}
