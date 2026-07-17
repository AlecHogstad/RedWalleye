import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import {
  ensureSession,
  getEventByCode,
  claimSlot,
  addSelf,
  type JoinEventInfo,
  type JoinRosterEntry,
} from "./api";
import { Page, Card, colors, inputStyle, labelStyle, buttonStyle, ghostButtonStyle } from "./ui";

// The player join flow (O-92) — what the share link opens. No account, no
// email, no install: an anonymous session is created silently, the player
// taps their name (or adds themselves), and they're bound to the roster slot.
// The 4-digit rejoin PIN is their recovery: it re-binds the slot on a new
// phone / cleared browser, and resolves "two guys tapped Mike".

interface Joined {
  playerId: string;
  name: string;
  pin: string;
}

function storageKey(code: string): string {
  return `tp-join-${code}`;
}

function loadJoined(code: string): Joined | null {
  try {
    const raw = localStorage.getItem(storageKey(code));
    return raw ? (JSON.parse(raw) as Joined) : null;
  } catch {
    return null;
  }
}

export default function JoinPage() {
  const { code = "" } = useParams<{ code: string }>();
  const [info, setInfo] = useState<JoinEventInfo | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<Joined | null>(() => loadJoined(code));

  // Sub-flows: claiming a taken slot (PIN), or adding yourself.
  const [pinFor, setPinFor] = useState<JoinRosterEntry | null>(null);
  const [pin, setPin] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [hcp, setHcp] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      await ensureSession();
      const data = await getEventByCode(code);
      if (active) setInfo(data);
    })().catch((err) => active && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      active = false;
    };
  }, [code]);

  const finish = (playerId: string, playerName: string, rejoinPin: string) => {
    const j = { playerId, name: playerName, pin: rejoinPin };
    setJoined(j);
    try {
      localStorage.setItem(storageKey(code), JSON.stringify(j));
    } catch {
      /* private mode — the state still lives for this visit */
    }
    setPinFor(null);
    setAddOpen(false);
  };

  const claim = async (entry: JoinRosterEntry, withPin?: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await claimSlot(code, entry.id, withPin);
      finish(res.player_id, entry.name, res.rejoin_pin);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(
        /already claimed/i.test(msg)
          ? "That PIN doesn't match. Double-check it, or ask the organizer."
          : msg,
      );
    } finally {
      setBusy(false);
    }
  };

  const submitAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const h = hcp.trim() === "" ? null : Number(hcp);
      if (h !== null && (!Number.isFinite(h) || h < -10 || h > 54)) {
        throw new Error("Handicap must be a number between -10 and 54.");
      }
      const res = await addSelf(code, name, h);
      finish(res.player_id, name.trim(), res.rejoin_pin);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  // ---- Render states -------------------------------------------------------

  if (error && info === undefined) {
    // Couldn't even boot (bad config / anon sign-in disabled / network).
    return (
      <Page center>
        <Card>
          <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>Can't open this invite</h1>
          <p style={{ color: colors.danger, fontSize: 14, lineHeight: 1.6 }}>{error}</p>
        </Card>
      </Page>
    );
  }

  if (info === undefined) {
    return (
      <Page center>
        <p style={{ color: colors.muted, textAlign: "center" }}>Opening invite…</p>
      </Page>
    );
  }

  if (info === null) {
    return (
      <Page center>
        <Card>
          <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>Invite not found</h1>
          <p style={{ color: colors.muted, fontSize: 14, lineHeight: 1.6 }}>
            This link's event code isn't recognized. Ask the organizer to re-send the link.
          </p>
        </Card>
      </Page>
    );
  }

  if (info.event.status === "final") {
    return (
      <Page center>
        <Card>
          <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>{info.event.name}</h1>
          <p style={{ color: colors.muted, fontSize: 14 }}>This event has ended.</p>
        </Card>
      </Page>
    );
  }

  if (joined) {
    return (
      <Page center>
        <Card>
          <p style={{ color: colors.muted, fontSize: 13, margin: 0 }}>{info.event.name}</p>
          <h1 style={{ fontSize: 22, margin: "6px 0 14px" }}>You're in, {joined.name} ⛳</h1>
          <div
            style={{
              background: "#0f1215",
              border: `1px solid ${colors.border}`,
              borderRadius: 10,
              padding: 16,
              textAlign: "center",
            }}
          >
            <div style={{ color: colors.muted, fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Your rejoin PIN
            </div>
            <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: "0.3em", marginTop: 6 }}>
              {joined.pin}
            </div>
          </div>
          <p style={{ color: colors.muted, fontSize: 13, lineHeight: 1.6, marginTop: 14 }}>
            Save this — it lets you rejoin as {joined.name} from any other phone or if your
            browser gets cleared. Scores &amp; matchups will show up here once the event starts.
          </p>
          <button
            type="button"
            style={{ ...ghostButtonStyle, marginTop: 6, fontSize: 13 }}
            onClick={() => {
              localStorage.removeItem(storageKey(code));
              setJoined(null);
            }}
          >
            Not you? Choose a different name
          </button>
        </Card>
      </Page>
    );
  }

  if (pinFor) {
    return (
      <Page center>
        <Card>
          <h1 style={{ fontSize: 20, margin: "0 0 6px" }}>That spot is taken</h1>
          <p style={{ color: colors.muted, fontSize: 14, lineHeight: 1.6, margin: 0 }}>
            <strong style={{ color: colors.text }}>{pinFor.name}</strong> already joined on
            another device. If that's you, enter your 4-digit rejoin PIN to move it here.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void claim(pinFor, pin);
            }}
          >
            <label style={labelStyle} htmlFor="join-pin">Rejoin PIN</label>
            <input
              id="join-pin"
              style={{ ...inputStyle, letterSpacing: "0.3em", fontSize: 20, textAlign: "center" }}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              inputMode="numeric"
              placeholder="0000"
              autoFocus
            />
            {error && <p style={{ color: colors.danger, fontSize: 13, marginTop: 12 }}>{error}</p>}
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button
                type="submit"
                disabled={busy || pin.length !== 4}
                style={{ ...buttonStyle, flex: 1, opacity: busy || pin.length !== 4 ? 0.6 : 1 }}
              >
                {busy ? "Checking…" : "Rejoin"}
              </button>
              <button
                type="button"
                style={ghostButtonStyle}
                onClick={() => {
                  setPinFor(null);
                  setPin("");
                  setError(null);
                }}
              >
                Back
              </button>
            </div>
          </form>
        </Card>
      </Page>
    );
  }

  return (
    <Page>
      <p style={{ color: colors.muted, fontSize: 13, margin: 0 }}>You're invited to</p>
      <h1 style={{ fontSize: 24, margin: "4px 0 16px" }}>{info.event.name}</h1>

      <Card>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Tap your name</div>
        {info.players.length === 0 && (
          <p style={{ color: colors.muted, fontSize: 14, margin: "8px 0 0" }}>
            No names on the list yet — add yourself below.
          </p>
        )}
        {info.players.map((p) => (
          <button
            key={p.id}
            type="button"
            disabled={busy}
            onClick={() => {
              setError(null);
              if (p.claimed) {
                setPinFor(p);
                setPin("");
              } else {
                void claim(p);
              }
            }}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%",
              padding: "12px 4px",
              background: "none",
              border: "none",
              borderTop: `1px solid ${colors.border}`,
              color: colors.text,
              fontSize: 15,
              cursor: "pointer",
              textAlign: "left",
              marginTop: 0,
            }}
          >
            <span>{p.name}</span>
            <span style={{ color: p.claimed ? colors.muted : colors.accent, fontSize: 12 }}>
              {p.claimed ? "taken" : "tap to claim"}
            </span>
          </button>
        ))}
      </Card>

      <div style={{ marginTop: 12 }}>
        <Card>
          {!addOpen ? (
            <button
              type="button"
              style={{ ...ghostButtonStyle, width: "100%" }}
              onClick={() => setAddOpen(true)}
            >
              I'm not on the list — add me
            </button>
          ) : (
            <form onSubmit={submitAdd}>
              <label style={{ ...labelStyle, marginTop: 0 }} htmlFor="join-name">Your name</label>
              <input
                id="join-name"
                style={inputStyle}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Mike"
                autoFocus
                required
              />
              <label style={labelStyle} htmlFor="join-hcp">
                Handicap <span style={{ opacity: 0.6 }}>(optional)</span>
              </label>
              <input
                id="join-hcp"
                style={inputStyle}
                value={hcp}
                onChange={(e) => setHcp(e.target.value)}
                placeholder="12.4"
                inputMode="decimal"
              />
              <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                <button
                  type="submit"
                  disabled={busy || !name.trim()}
                  style={{ ...buttonStyle, flex: 1, opacity: busy || !name.trim() ? 0.6 : 1 }}
                >
                  {busy ? "Joining…" : "Join event"}
                </button>
                <button type="button" style={ghostButtonStyle} onClick={() => setAddOpen(false)}>
                  Cancel
                </button>
              </div>
            </form>
          )}
        </Card>
      </div>

      {error && <p style={{ color: colors.danger, fontSize: 13, marginTop: 12 }}>{error}</p>}
    </Page>
  );
}
