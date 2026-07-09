import { useCallback, useEffect, useRef, useState } from "react";
import type { LatLng } from "./geo";

export type GeoStatus =
  | "idle" // haven't asked yet
  | "locating" // watch started, waiting on the first fix
  | "active" // getting live fixes
  | "denied" // user said no (or Safari blocked it)
  | "unavailable" // no geolocation on this device
  | "error"; // timeout / position unavailable

export interface GeoReading {
  status: GeoStatus;
  coords: LatLng | null;
  accuracy: number | null; // horizontal accuracy in meters (lower is better)
  updatedAt: number | null; // epoch ms of the last fix
  error: string | null;
}

const INITIAL: GeoReading = {
  status: "idle",
  coords: null,
  accuracy: null,
  updatedAt: null,
  error: null,
};

/**
 * Watch the device's position via the browser Geolocation API. Everything is
 * on-device — no tiles, no network — so it works in a course dead zone. Call
 * `start()` from a user gesture (iOS Safari requires the tap) and the hook
 * streams live fixes until `stop()` or unmount.
 *
 * `enableHighAccuracy` asks for GPS rather than wifi/cell triangulation, which
 * is what you want on a fairway; the trade-off is battery, so a real feature
 * would stop the watch when the app is backgrounded.
 */
export function useGeolocation() {
  const [reading, setReading] = useState<GeoReading>(INITIAL);
  const watchId = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (watchId.current != null && "geolocation" in navigator) {
      navigator.geolocation.clearWatch(watchId.current);
    }
    watchId.current = null;
  }, []);

  const start = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setReading((r) => ({ ...r, status: "unavailable", error: "This device has no GPS." }));
      return;
    }
    setReading((r) => ({ ...r, status: "locating", error: null }));
    watchId.current = navigator.geolocation.watchPosition(
      (pos) =>
        setReading({
          status: "active",
          coords: { lat: pos.coords.latitude, lng: pos.coords.longitude },
          accuracy: pos.coords.accuracy,
          updatedAt: pos.timestamp,
          error: null,
        }),
      (err) =>
        setReading((r) => ({
          ...r,
          status: err.code === err.PERMISSION_DENIED ? "denied" : "error",
          error: err.message,
        })),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
    );
  }, []);

  // Clear the watch when the component using the hook unmounts.
  useEffect(() => stop, [stop]);

  return { ...reading, start, stop };
}
