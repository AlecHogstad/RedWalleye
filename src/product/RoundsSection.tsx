import { useEffect, useMemo, useState, type FormEvent } from "react";
import { FORMAT_REGISTRY } from "../scoring/formats";
import type { Format } from "../types";
import {
  listCourses,
  createCourse,
  listEventRounds,
  createRound,
  setRoundSetup,
  deleteRound,
  type RoundWithGame,
} from "./api";
import type { Course } from "./types";
import { Card, colors, inputStyle, labelStyle, buttonStyle, ghostButtonStyle } from "./ui";

// Wizard step 2 — Rounds & courses, embedded in the event dashboard. The
// wizard seeds N placeholder rounds; each gets its course + game format set
// here ("Set up"), and stays editable — along with add/remove — until the
// first round starts. Course entry is the minimal O-96 seed: pick from the
// shared library or type a new name.

const NEW_COURSE = "__new__";

const FORMAT_IDS = Object.keys(FORMAT_REGISTRY) as Format[];

function formatLabel(id: string): string {
  const plugin = FORMAT_REGISTRY[id as Format];
  return plugin ? plugin.labels.long : id;
}

/** Shared course+format form for both "set up / edit round N" and "add round". */
function RoundForm({
  courses,
  initialCourseId,
  initialFormat,
  busy,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  courses: Course[];
  initialCourseId: string;
  initialFormat: string;
  busy: boolean;
  submitLabel: string;
  onSubmit: (sel: { courseId: string; newCourseName: string; format: string }) => void;
  onCancel: () => void;
}) {
  const [courseId, setCourseId] = useState(initialCourseId);
  const [newCourseName, setNewCourseName] = useState("");
  const [format, setFormat] = useState(initialFormat);
  const needsName = courseId === NEW_COURSE && !newCourseName.trim();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (busy || needsName) return;
    onSubmit({ courseId, newCourseName, format });
  };

  return (
    <form onSubmit={submit}>
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
          disabled={busy || needsName}
          style={{ ...buttonStyle, flex: 1, opacity: busy || needsName ? 0.6 : 1 }}
        >
          {busy ? "Saving…" : submitLabel}
        </button>
        <button type="button" style={ghostButtonStyle} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
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
  // Which form is open: "add" | a round id | null.
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([listEventRounds(eventId), listCourses()])
      .then(([r, c]) => {
        if (!active) return;
        setRounds(r);
        setCourses(c);
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

  /** Resolve the course choice (creating a library entry if asked), shared by
   *  both save paths. */
  const resolveCourse = async (sel: { courseId: string; newCourseName: string }) => {
    if (sel.courseId !== NEW_COURSE) return sel.courseId;
    const created = await createCourse(sel.newCourseName);
    setCourses((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    return created.id;
  };

  const saveExisting = async (
    roundId: string,
    sel: { courseId: string; newCourseName: string; format: string },
  ) => {
    setBusy(true);
    setError(null);
    try {
      const courseId = await resolveCourse(sel);
      const updated = await setRoundSetup({ roundId, eventId, courseId, format: sel.format });
      setRounds((prev) => (prev ?? []).map((r) => (r.round.id === roundId ? updated : r)));
      setOpen(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const saveNew = async (sel: { courseId: string; newCourseName: string; format: string }) => {
    setBusy(true);
    setError(null);
    try {
      const courseId = await resolveCourse(sel);
      const created = await createRound({ eventId, courseId, format: sel.format });
      setRounds((prev) => [...(prev ?? []), created]);
      setOpen(null);
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

  const defaultCourseId = courses.length > 0 ? courses[0].id : NEW_COURSE;

  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>Rounds</div>
        {editable && open === null && (
          <button type="button" style={{ ...ghostButtonStyle, fontSize: 13 }} onClick={() => setOpen("add")}>
            + Add round
          </button>
        )}
      </div>

      {rounds === null && !error && (
        <p style={{ color: colors.muted, fontSize: 14, margin: "12px 0 0" }}>Loading…</p>
      )}
      {rounds !== null && rounds.length === 0 && open !== "add" && (
        <p style={{ color: colors.muted, fontSize: 14, lineHeight: 1.6, margin: "12px 0 0" }}>
          No rounds yet. Add one — each round gets a course and a game format.
        </p>
      )}

      {rounds?.map(({ round, game }, i) => {
        const configured = Boolean(game && round.course_id);
        return (
          <div key={round.id} style={{ borderTop: `1px solid ${colors.border}`, marginTop: i === 0 ? 12 : 0 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 0",
              }}
            >
              <div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>
                  Round {i + 1}
                  {game ? ` · ${formatLabel(game.type)}` : ""}
                </div>
                <div
                  style={{
                    color: configured ? colors.muted : colors.danger,
                    fontSize: 13,
                    marginTop: 2,
                  }}
                >
                  {configured ? courseName(round.course_id) : "Needs a course & format"}
                </div>
              </div>
              {editable && open === null && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setOpen(round.id)}
                    style={{ ...ghostButtonStyle, fontSize: 12 }}
                  >
                    {configured ? "Edit" : "Set up"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(round.id)}
                    style={{ ...ghostButtonStyle, fontSize: 12, color: colors.danger }}
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
            {open === round.id && (
              <div style={{ paddingBottom: 14 }}>
                <RoundForm
                  courses={courses}
                  initialCourseId={round.course_id ?? defaultCourseId}
                  initialFormat={game?.type ?? FORMAT_IDS[0]}
                  busy={busy}
                  submitLabel="Save round"
                  onSubmit={(sel) => void saveExisting(round.id, sel)}
                  onCancel={() => {
                    setOpen(null);
                    setError(null);
                  }}
                />
              </div>
            )}
          </div>
        );
      })}

      {open === "add" && (
        <div style={{ borderTop: `1px solid ${colors.border}`, marginTop: 12 }}>
          <RoundForm
            courses={courses}
            initialCourseId={defaultCourseId}
            initialFormat={FORMAT_IDS[0]}
            busy={busy}
            submitLabel="Add round"
            onSubmit={(sel) => void saveNew(sel)}
            onCancel={() => {
              setOpen(null);
              setError(null);
            }}
          />
        </div>
      )}

      {error && <p style={{ color: colors.danger, fontSize: 13, marginTop: 12 }}>{error}</p>}
    </Card>
  );
}
