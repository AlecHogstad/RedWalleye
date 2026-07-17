import { useEffect, useMemo, useState, type FormEvent } from "react";
import { FORMAT_REGISTRY } from "../scoring/formats";
import type { Format } from "../types";
import {
  listCourses,
  createCourse,
  listEventRounds,
  createRound,
  deleteRound,
  type RoundWithGame,
} from "./api";
import type { Course } from "./types";
import { Card, colors, inputStyle, labelStyle, buttonStyle, ghostButtonStyle } from "./ui";

// Wizard step 2 — Rounds & courses, embedded in the event dashboard (the
// create-then-refine model: rounds are added/removed freely while the event is
// a draft). Each round = date + course + one format from the games registry.
// Course entry is the minimal O-96 seed: pick from the shared library or type
// a new name. Tees + full scorecards arrive with the real course picker.

const NEW_COURSE = "__new__";

const FORMAT_IDS = Object.keys(FORMAT_REGISTRY) as Format[];

function formatLabel(id: string): string {
  const plugin = FORMAT_REGISTRY[id as Format];
  return plugin ? plugin.labels.long : id;
}

export default function RoundsSection({
  eventId,
  editable,
}: {
  eventId: string;
  editable: boolean;
}) {
  const [rounds, setRounds] = useState<RoundWithGame[] | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Add-round form
  const [adding, setAdding] = useState(false);
  const [courseId, setCourseId] = useState("");
  const [newCourseName, setNewCourseName] = useState("");
  const [format, setFormat] = useState<string>(FORMAT_IDS[0]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([listEventRounds(eventId), listCourses()])
      .then(([r, c]) => {
        if (!active) return;
        setRounds(r);
        setCourses(c);
        if (c.length > 0) setCourseId((prev) => prev || c[0].id);
        else setCourseId(NEW_COURSE);
      })
      .catch((err) => active && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      active = false;
    };
  }, [eventId]);

  const courseName = useMemo(() => {
    const byId = new Map(courses.map((c) => [c.id, c.name]));
    return (id: string | null) => (id ? (byId.get(id) ?? "Course TBD") : "Course TBD");
  }, [courses]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      let useCourseId = courseId;
      if (courseId === NEW_COURSE) {
        const created = await createCourse(newCourseName);
        setCourses((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
        useCourseId = created.id;
      }
      const created = await createRound({
        eventId,
        courseId: useCourseId,
        format,
      });
      setRounds((prev) => [...(prev ?? []), created]);
      setAdding(false);
      setNewCourseName("");
      setCourseId(useCourseId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (roundId: string) => {
    setError(null);
    const prev = rounds;
    setRounds((r) => (r ?? []).filter((x) => x.round.id !== roundId));
    try {
      await deleteRound(roundId);
    } catch (err) {
      setRounds(prev); // put it back — the delete didn't take
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>Rounds</div>
        {editable && !adding && (
          <button type="button" style={{ ...ghostButtonStyle, fontSize: 13 }} onClick={() => setAdding(true)}>
            + Add round
          </button>
        )}
      </div>

      {rounds === null && !error && (
        <p style={{ color: colors.muted, fontSize: 14, margin: "12px 0 0" }}>Loading…</p>
      )}
      {rounds !== null && rounds.length === 0 && !adding && (
        <p style={{ color: colors.muted, fontSize: 14, lineHeight: 1.6, margin: "12px 0 0" }}>
          No rounds yet. Add one — each round gets a course and a game format.
        </p>
      )}

      {rounds?.map(({ round, game }, i) => (
        <div
          key={round.id}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 0",
            borderTop: i === 0 ? `1px solid ${colors.border}` : `1px solid ${colors.border}`,
            marginTop: i === 0 ? 12 : 0,
          }}
        >
          <div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>
              Round {i + 1} · {game ? formatLabel(game.type) : "Format TBD"}
            </div>
            <div style={{ color: colors.muted, fontSize: 13, marginTop: 2 }}>
              {courseName(round.course_id)}
            </div>
          </div>
          {editable && (
            <button
              type="button"
              onClick={() => void remove(round.id)}
              style={{ ...ghostButtonStyle, fontSize: 12, color: colors.danger }}
            >
              Remove
            </button>
          )}
        </div>
      ))}

      {adding && (
        <form onSubmit={submit} style={{ borderTop: `1px solid ${colors.border}`, marginTop: 12 }}>
          <label style={labelStyle} htmlFor="rnd-format">Game format</label>
          <select id="rnd-format" style={inputStyle} value={format} onChange={(e) => setFormat(e.target.value)}>
            {FORMAT_IDS.map((id) => (
              <option key={id} value={id}>
                {formatLabel(id)}
              </option>
            ))}
          </select>

          <label style={labelStyle} htmlFor="rnd-course">Course</label>
          <select id="rnd-course" style={inputStyle} value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.location ? ` — ${c.location}` : ""}
              </option>
            ))}
            <option value={NEW_COURSE}>+ Add a new course…</option>
          </select>

          {courseId === NEW_COURSE && (
            <>
              <label style={labelStyle} htmlFor="rnd-course-name">New course name</label>
              <input
                id="rnd-course-name"
                style={inputStyle}
                value={newCourseName}
                onChange={(e) => setNewCourseName(e.target.value)}
                placeholder="Hayward Golf Club"
                required
              />
            </>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button
              type="submit"
              disabled={busy || (courseId === NEW_COURSE && !newCourseName.trim())}
              style={{ ...buttonStyle, flex: 1, opacity: busy ? 0.6 : 1 }}
            >
              {busy ? "Adding…" : "Add round"}
            </button>
            <button
              type="button"
              style={ghostButtonStyle}
              onClick={() => {
                setAdding(false);
                setError(null);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {error && <p style={{ color: colors.danger, fontSize: 13, marginTop: 12 }}>{error}</p>}
    </Card>
  );
}
