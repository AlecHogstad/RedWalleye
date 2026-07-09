import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Evidence Camera — full-screen in-app viewfinder for mulligan proof photos.
 * Replaces the OS camera sheet with the app's own vintage take: live preview
 * in a polaroid frame, shutter, flip, and a retake/use confirm step. Output
 * is a plain JPEG File handed to the existing compress → upload pipeline.
 *
 * If the camera can't start (permission denied, unsupported browser), it
 * calls `onFallback` so the caller can open the native file input instead —
 * proof photos can never be broken by this component.
 */
export function MulliganCamera({
  playerName,
  busy,
  onCapture,
  onFallback,
  onClose,
}: {
  playerName: string;
  busy: boolean;
  onCapture: (file: File) => void;
  onFallback: () => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [shot, setShot] = useState<{ blob: Blob; url: string } | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // Start (or restart, on flip) the camera. Any failure → native fallback.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 1280 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch {
        if (!cancelled) onFallback();
      }
    })();
    return () => {
      cancelled = true;
      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing]);

  useEffect(() => () => {
    if (shot) URL.revokeObjectURL(shot.url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shot]);

  const snap = async () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const scale = Math.min(1, 1200 / Math.max(video.videoWidth, video.videoHeight));
    const w = Math.round(video.videoWidth * scale);
    const h = Math.round(video.videoHeight * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (facing === "user") {
      // Mirror the capture so it matches the mirrored preview.
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.9),
    );
    if (blob) setShot({ blob, url: URL.createObjectURL(blob) });
  };

  const usePhoto = () => {
    if (!shot) return;
    onCapture(new File([shot.blob], "mulligan.jpg", { type: "image/jpeg" }));
  };

  return (
    <div className="evcam" role="dialog" aria-label="Evidence camera">
      <div className="evcam-top">
        <span className="evcam-title">Evidence</span>
        <button type="button" className="evcam-close" aria-label="Cancel" onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="evcam-frame">
        <div className="evcam-view">
          {/* Preview stays mounted behind the freeze so Retake is instant. */}
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className={facing === "user" ? "mirrored" : ""}
          />
          {shot && <img src={shot.url} alt="Captured proof" className="evcam-shot" />}
        </div>
        <div className="evcam-caption">
          {shot ? "Hold it right there." : `Get ${playerName} in frame`}
        </div>
      </div>

      {shot ? (
        <div className="evcam-controls">
          <button
            type="button"
            className="btn ghost"
            disabled={busy}
            onClick={() => setShot(null)}
          >
            Retake
          </button>
          <button type="button" className="btn" disabled={busy} onClick={usePhoto}>
            {busy ? "Saving…" : "Use photo"}
          </button>
        </div>
      ) : (
        <div className="evcam-controls">
          <button
            type="button"
            className="evcam-flip"
            aria-label="Flip camera"
            onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
          >
            ⟲
          </button>
          <button type="button" className="evcam-shutter" aria-label="Take photo" onClick={snap} />
          <span className="evcam-flip-spacer" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}
