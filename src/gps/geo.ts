// ---------------------------------------------------------------------------
// Geo math for course GPS — pure functions, unit-tested. No DOM, no browser
// APIs (that lives in useGeolocation). Golf's native unit is the yard, so the
// helpers round to whole yards the way a rangefinder does.
// ---------------------------------------------------------------------------

/** A WGS-84 coordinate (what the Geolocation API and map tools both speak). */
export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6371008.8; // IUGG mean Earth radius, meters
const METERS_PER_YARD = 0.9144;

const toRad = (deg: number): number => (deg * Math.PI) / 180;
const toDeg = (rad: number): number => (rad * 180) / Math.PI;

/** Great-circle (haversine) distance between two coordinates, in meters. */
export function metersBetween(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Distance in whole yards — how a golf rangefinder reads. */
export function yardsBetween(a: LatLng, b: LatLng): number {
  return Math.round(metersBetween(a, b) / METERS_PER_YARD);
}

/** Meters to whole yards. */
export function metersToYards(m: number): number {
  return Math.round(m / METERS_PER_YARD);
}

/**
 * Initial compass bearing from `a` to `b`, in degrees (0 = north, 90 = east).
 * Useful later for pointing an arrow at the pin or orienting a map.
 */
export function bearingBetween(a: LatLng, b: LatLng): number {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}
