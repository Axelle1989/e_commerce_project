import { useState, useEffect, useRef } from 'react';
import { GeoPoint, OrderStatus } from '../types';

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3; // metres
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // in metres
}

export function useLiveLocation(status?: OrderStatus) {
  const [location, setLocation] = useState<GeoPoint | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<PermissionState | 'prompt' | 'unsupported'>('prompt');
  
  const lastLocationRef = useRef<GeoPoint | null>(null);
  const lastTimestampRef = useRef<number>(0);
  const watchIdRef = useRef<number | null>(null);
  const intervalIdRef = useRef<any>(null);
  const lastEmitTimeRef = useRef<number>(0);

  // Check initial permission status
  useEffect(() => {
    if (!navigator.geolocation) {
      setPermissionStatus('unsupported');
      return;
    }

    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'geolocation' }).then((permission) => {
        setPermissionStatus(permission.state);
        permission.onchange = () => setPermissionStatus(permission.state);
      }).catch(() => {
        // Fallback if query fails
        setPermissionStatus('prompt');
      });
    }
  }, []);

  const requestPermission = () => {
    if (!navigator.geolocation) {
      setError("La géolocalisation n'est pas supportée.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPermissionStatus('granted');
        handleNewPosition(pos, true);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setPermissionStatus('denied');
          setError("Accès refusé. Veuillez activer le GPS.");
        } else {
          setError("Erreur GPS.");
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleNewPosition = (pos: GeolocationPosition, force = false) => {
    const { latitude, longitude, accuracy } = pos.coords;
    const timestamp = pos.timestamp;
    const now = Date.now();

    // Frequency logic
    const minInterval = status === 'delivering' ? 5000 : (['at_market', 'shopping_completed'].includes(status || '') ? 10000 : 30000);
    if (!force && now - lastEmitTimeRef.current < minInterval) {
      return;
    }

    const newLoc: GeoPoint = {
      latitude,
      longitude,
      accuracy,
      updatedAt: new Date(timestamp).toISOString()
    };

    // Filtering outliers: > 500m in < 2s
    if (lastLocationRef.current) {
      const dist = calculateDistance(
        lastLocationRef.current.latitude,
        lastLocationRef.current.longitude,
        latitude,
        longitude
      );
      const timeDiff = (timestamp - lastTimestampRef.current) / 1000; // seconds

      if (dist > 500 && timeDiff < 2) {
        console.warn("Position GPS aberrante ignorée:", dist, "m en", timeDiff, "s");
        return;
      }
    }

    setLocation(newLoc);
    lastLocationRef.current = newLoc;
    lastTimestampRef.current = timestamp;
    lastEmitTimeRef.current = now;
    setError(null);
  };

  useEffect(() => {
    if (permissionStatus !== 'granted') return;

    const options: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    };

    const startTracking = () => {
      // Continuous tracking
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => handleNewPosition(pos),
        (err) => {
          console.error("WatchPosition error, falling back to getCurrentPosition:", err);
          // Fallback on error
          navigator.geolocation.getCurrentPosition(
            (pos) => handleNewPosition(pos),
            (e) => setError("Impossible d'obtenir votre position."),
            options
          );
        },
        options
      );

      // Periodic fallback to ensure updates even if immobile
      const interval = status === 'delivering' ? 5000 : (['at_market', 'shopping_completed'].includes(status || '') ? 10000 : 30000);
      intervalIdRef.current = setInterval(() => {
        navigator.geolocation.getCurrentPosition(
          (pos) => handleNewPosition(pos),
          (err) => console.error("Periodic getCurrentPosition error:", err),
          options
        );
      }, interval);
    };

    startTracking();

    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      if (intervalIdRef.current) clearInterval(intervalIdRef.current);
    };
  }, [permissionStatus, status]);

  return { location, error, requestPermission, permissionStatus };
}
