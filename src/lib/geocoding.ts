export interface AddressComponents {
  neighborhood?: string;
  sublocality?: string;
  route?: string;
  street_number?: string;
  locality?: string;
  city?: string;
  country?: string;
}

export function parseGoogleAddress(results: any[]): string {
  if (!results || results.length === 0) return '';

  const firstResult = results[0];
  const components: AddressComponents = {};

  firstResult.address_components.forEach((component: any) => {
    const types = component.types;
    if (types.includes('neighborhood')) components.neighborhood = component.long_name;
    if (types.includes('sublocality') || types.includes('sublocality_level_1')) components.sublocality = component.long_name;
    if (types.includes('route')) components.route = component.long_name;
    if (types.includes('street_number')) components.street_number = component.long_name;
    if (types.includes('locality')) components.locality = component.long_name;
    if (types.includes('administrative_area_level_1')) components.city = component.long_name;
    if (types.includes('country')) components.country = component.long_name;
  });

  // Build a custom label prioritizing local details
  const parts: string[] = [];
  
  // 1. Neighborhood or Sublocality (most important for local context)
  if (components.neighborhood) parts.push(components.neighborhood);
  else if (components.sublocality) parts.push(components.sublocality);

  // 2. Street/Route
  if (components.route) {
    const street = components.street_number ? `${components.street_number} ${components.route}` : components.route;
    // Avoid repeating if it's just a generic road name like "RNIE 1" and we have a neighborhood
    if (parts.length > 0 && components.route.includes('RNIE')) {
      // Keep it but maybe at the end or skip if we have better info
    } else {
      parts.push(street);
    }
  }

  // 3. Locality/City
  if (components.locality) parts.push(components.locality);
  else if (components.city) parts.push(components.city);

  if (parts.length === 0) return firstResult.formatted_address;

  return parts.join(', ');
}

export async function reverseGeocode(lat: number, lng: number, apiKey?: string): Promise<string> {
  try {
    if (apiKey) {
      const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}&language=fr`);
      const data = await response.json();
      if (data.status === 'OK' && data.results.length > 0) {
        return parseGoogleAddress(data.results);
      }
    }
    
    // Fallback to Nominatim
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
    const data = await response.json();
    return data.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  } catch (error) {
    console.error('Reverse geocoding error:', error);
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
}

export async function searchAddress(query: string, apiKey?: string): Promise<any[]> {
  if (query.length < 3) return [];

  try {
    if (apiKey) {
      const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${apiKey}&language=fr&components=country:BJ`);
      const data = await response.json();
      if (data.status === 'OK') {
        return data.results.map((r: any) => ({
          display_name: r.formatted_address,
          lat: r.geometry.location.lat,
          lon: r.geometry.location.lng,
          place_id: r.place_id
        }));
      }
    }

    // Fallback to Nominatim
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&countrycodes=bj`);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Search address error:', error);
    return [];
  }
}

export function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // metres
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c;
}
