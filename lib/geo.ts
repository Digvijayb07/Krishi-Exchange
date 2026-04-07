/**
 * Geo utilities — Haversine distance + Nominatim geocoding
 * Uses the free OpenStreetMap Nominatim API (no API key needed).
 */

// ── Haversine distance (km) ─────────────────────────────────────────────────
export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ── Format distance for display ──────────────────────────────────────────────
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m away`;
  if (km < 10) return `${km.toFixed(1)} km away`;
  return `${Math.round(km)} km away`;
}

// ── Nominatim geocoding ──────────────────────────────────────────────────────
export interface GeocodingResult {
  latitude: number;
  longitude: number;
  display_name: string;
}

export async function geocodeAddress(
  address: string
): Promise<GeocodingResult | null> {
  try {
    const encoded = encodeURIComponent(address);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encoded}&limit=1`,
      {
        headers: {
          'User-Agent': 'KrishiExchange/1.0 (krishi-exchange-marketplace)',
        },
      }
    );
    const data = await res.json();
    if (!data || data.length === 0) return null;
    return {
      latitude: parseFloat(data[0].lat),
      longitude: parseFloat(data[0].lon),
      display_name: data[0].display_name,
    };
  } catch {
    return null;
  }
}
