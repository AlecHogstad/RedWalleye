import { useState } from "react";
import { useGeolocation } from "../gps/useGeolocation";
import { bearingBetween, metersToYards, yardsBetween, type LatLng } from "../gps/geo";

/** Rough compass label for a bearing, so "pin is that way" reads in words. */
function compass(deg: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(deg / 45) % 8];
}

/**
 * Prototype for the course-GPS exploration (see docs/course-gps.md). It proves
 * the whole idea end-to-end without any external course data: turn on GPS,
 * walk to a green, tap "Mark the pin," and every phone from then on reads live
 * yards to that spot. No map tiles, no API keys — all on-device, so it works
 * in a fairway dead zone. This screen keeps the captured pin in local state
 * only; the real feature would sync it through the existing rw_kv table.
 */
export default function GpsDemoPage() {
  const geo = useGeolocation();
  const [pin, setPin] = useState<LatLng | null>(null);

  const yardsToPin = pin && geo.coords ? yardsBetween(geo.coords, pin) : null;
  const bearingToPin = pin && geo.coords ? bearingBetween(geo.coords, pin) : null;
  const accuracyYds = geo.accuracy != null ? metersToYards(geo.accuracy) : null;

  return (
    <div className="gps-demo">
      <section className="section">
        <h2>Course GPS — prototype</h2>
        <p className="hint" style={{ padding: "4px 2px 0" }}>
          A proof of concept for seeing where you are on the course. Turn on GPS,
          stand on a green, and tap <em>Mark the pin</em> — then it reads live
          yards to that spot as you walk. Nothing is saved yet.
        </p>
      </section>

      <section className="section" style={{ paddingTop: 4 }}>
        <div className="card gps-card">
          {geo.status === "idle" && (
            <button className="btn start" onClick={geo.start}>
              Start GPS
            </button>
          )}

          {geo.status === "locating" && (
            <p className="gps-status">Locating you…</p>
          )}

          {geo.status === "denied" && (
            <p className="gps-status gps-bad">
              Location permission was denied. Enable it for this site in your
              browser settings, then reload.
            </p>
          )}
          {geo.status === "unavailable" && (
            <p className="gps-status gps-bad">This device has no GPS.</p>
          )}
          {geo.status === "error" && (
            <p className="gps-status gps-bad">Couldn't get a fix: {geo.error}</p>
          )}

          {geo.status === "active" && geo.coords && (
            <>
              {pin ? (
                <div className="gps-readout">
                  <span className="gps-yards">{yardsToPin}</span>
                  <span className="gps-yards-label">
                    yds to pin
                    {bearingToPin != null ? ` · ${compass(bearingToPin)}` : ""}
                  </span>
                </div>
              ) : (
                <p className="gps-status">
                  Locked on. Stand where you want the pin, then mark it.
                </p>
              )}

              <dl className="gps-facts">
                <div>
                  <dt>Position</dt>
                  <dd>
                    {geo.coords.lat.toFixed(5)}, {geo.coords.lng.toFixed(5)}
                  </dd>
                </div>
                <div>
                  <dt>Accuracy</dt>
                  <dd>{accuracyYds != null ? `± ${accuracyYds} yds` : "—"}</dd>
                </div>
              </dl>

              <div className="gps-actions">
                {pin ? (
                  <button className="btn ghost start" onClick={() => setPin(null)}>
                    Clear pin
                  </button>
                ) : (
                  <button className="btn start" onClick={() => setPin(geo.coords)}>
                    Mark the pin
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        <p className="hint center">
          Accuracy depends on the phone and sky view — phone GPS is usually good
          to a few yards in the open. See docs/course-gps.md for the full plan.
        </p>
      </section>
    </div>
  );
}
