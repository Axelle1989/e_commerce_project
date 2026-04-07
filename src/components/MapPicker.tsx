import { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Navigation, Search, Loader2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { reverseGeocode, searchAddress } from '../lib/geocoding';

// Fix Leaflet icon issue using CDN
const DefaultIcon = L.icon({
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

interface MapPickerProps {
  onLocationSelect: (lat: number, lng: number, address: string) => void;
  initialLocation?: { lat: number; lng: number };
}

function LocationMarker({ position, setPosition, onLocationSelect }: { 
  position: L.LatLng | null, 
  setPosition: (pos: L.LatLng) => void,
  onLocationSelect: (lat: number, lng: number) => void 
}) {
  useMapEvents({
    click(e) {
      setPosition(e.latlng);
      onLocationSelect(e.latlng.lat, e.latlng.lng);
    },
  });

  return position === null ? null : (
    <Marker position={position} />
  );
}

function ChangeView({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, 15);
  }, [center, map]);
  return null;
}

export default function MapPicker({ onLocationSelect, initialLocation }: MapPickerProps) {
  const [center, setCenter] = useState<[number, number]>(
    initialLocation ? [initialLocation.lat, initialLocation.lng] : [6.3654, 2.4183] // Cotonou default
  );
  const [markerPosition, setMarkerPosition] = useState<L.LatLng | null>(
    initialLocation ? L.latLng(initialLocation.lat, initialLocation.lng) : null
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [address, setAddress] = useState('');
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchTimeout = useRef<any>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLocationSelect = async (lat: number, lng: number, skipSearchUpdate = false) => {
    try {
      const addr = await reverseGeocode(lat, lng, apiKey);
      setAddress(addr);
      if (!skipSearchUpdate) setSearchQuery(addr);
      onLocationSelect(lat, lng, addr);
    } catch (error) {
      console.error('Geocoding error:', error);
      const addr = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      setAddress(addr);
      if (!skipSearchUpdate) setSearchQuery(addr);
      onLocationSelect(lat, lng, addr);
    }
  };

  const searchPlaces = async (query: string) => {
    if (query.length < 3) {
      setSuggestions([]);
      return;
    }
    setIsSearching(true);
    try {
      const data = await searchAddress(query, apiKey);
      setSuggestions(data);
      setShowSuggestions(true);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      searchPlaces(value);
    }, 500);
  };

  const selectSuggestion = (suggestion: any) => {
    const lat = parseFloat(suggestion.lat);
    const lng = parseFloat(suggestion.lon);
    const addr = suggestion.display_name;
    
    setCenter([lat, lng]);
    setMarkerPosition(L.latLng(lat, lng));
    setAddress(addr);
    setSearchQuery(addr);
    setShowSuggestions(false);
    onLocationSelect(lat, lng, addr);
  };

  const getCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setAccuracy(accuracy);
        setCenter([latitude, longitude]);
        setMarkerPosition(L.latLng(latitude, longitude));
        handleLocationSelect(latitude, longitude);
      }, (err) => {
        console.error("MapPicker geolocation error:", err);
      }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <MapPin className="w-3 h-3" /> Lieu de livraison
        </p>
        <button 
          type="button"
          onClick={getCurrentLocation}
          className="text-[10px] font-black text-benin-green uppercase tracking-widest flex items-center gap-1 hover:underline"
        >
          <Navigation className="w-3 h-3" /> Ma position actuelle
        </button>
      </div>

      {accuracy !== null && (
        <div className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-2 w-fit ${accuracy < 50 ? 'bg-benin-green/10 text-benin-green' : 'bg-benin-yellow/10 text-benin-yellow'}`}>
          <div className={`w-1.5 h-1.5 rounded-full ${accuracy < 50 ? 'bg-benin-green' : 'bg-benin-yellow'} animate-pulse`}></div>
          Précision GPS : {Math.round(accuracy)}m {accuracy < 50 ? '(Excellente)' : '(Moyenne)'}
        </div>
      )}

      {/* Search Bar */}
      <div className="relative" ref={dropdownRef}>
        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-benin-green transition-colors" />
          <input
            type="text"
            placeholder="Rechercher une adresse précise..."
            value={searchQuery}
            onChange={handleSearchChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                searchPlaces(searchQuery);
              }
            }}
            onFocus={() => searchQuery.length >= 3 && setShowSuggestions(true)}
            className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl pl-12 pr-32 py-4 font-bold text-slate-900 focus:border-benin-green focus:bg-white transition-all outline-none text-sm"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {isSearching ? (
              <Loader2 className="w-4 h-4 text-benin-green animate-spin mr-2" />
            ) : searchQuery && (
              <button 
                type="button"
                onClick={() => { setSearchQuery(''); setSuggestions([]); }}
                className="p-2 hover:bg-slate-200 rounded-full transition-colors"
              >
                <X className="w-3 h-3 text-slate-400" />
              </button>
            )}
            <button
              type="button"
              onClick={() => searchPlaces(searchQuery)}
              className="bg-benin-green text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-benin-green/90 transition-all active:scale-95"
            >
              Chercher
            </button>
          </div>
        </div>
        <p className="mt-2 text-[9px] text-slate-400 font-medium px-2 italic">
          Si le GPS est imprécis, recherchez votre adresse manuellement ci-dessus.
        </p>

        {/* Suggestions Dropdown */}
        <AnimatePresence>
          {showSuggestions && suggestions.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl border border-slate-100 shadow-2xl z-[1000] overflow-hidden"
            >
              {suggestions.map((s, i) => (
                <button
                  key={s.place_id || i}
                  type="button"
                  onClick={() => selectSuggestion(s)}
                  className="w-full text-left px-6 py-4 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0 flex items-start gap-3"
                >
                  <MapPin className="w-4 h-4 text-slate-400 mt-1 shrink-0" />
                  <span className="text-xs font-bold text-slate-900 line-clamp-2">{s.display_name}</span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      
      <div className="h-64 rounded-3xl overflow-hidden border-2 border-slate-100 shadow-inner relative z-10">
        <MapContainer center={center} zoom={13} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
          <LocationMarker 
            position={markerPosition} 
            setPosition={(pos) => {
              setMarkerPosition(pos);
              setCenter([pos.lat, pos.lng]);
            }} 
            onLocationSelect={handleLocationSelect} 
          />
          <ChangeView center={center} />
        </MapContainer>
      </div>

      {address && (
        <div className="p-4 bg-benin-green/5 rounded-2xl border border-benin-green/20">
          <p className="text-[10px] font-black text-benin-green uppercase tracking-widest mb-1">Adresse sélectionnée</p>
          <p className="text-xs font-black text-slate-900">{address}</p>
        </div>
      )}
    </div>
  );
}
