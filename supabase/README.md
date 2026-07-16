# Supabase backend

Postgres schema for the Tournament Pass product. **Migrations are the source of
truth for the schema** (project convention) — every migration that touches a
table ships its RLS policies in the same file. Default-deny: a table without a
policy fails closed.

## Applying migrations

`migrations/` holds ordered, timestamped SQL. They are additive to the existing
v1 kv app (v1 keeps working until cutover).

**To a remote project** (the product DB — the existing Supabase project or a
fresh one):

```bash
supabase link --project-ref <your-project-ref>   # once
supabase db push                                  # apply pending migrations
```

**Local dev:**

```bash
supabase start            # boots Postgres + Auth from config.toml
supabase db reset         # rebuild the local db, replaying every migration
```

Or paste each file's contents into the Dashboard **SQL editor** in filename
order (`…000100` → `…000200` → `…000300`).

### One-time project setup
- **Enable Anonymous sign-ins** — `config.toml` sets `enable_anonymous_sign_ins`
  for local dev and `supabase config push`; on a linked project you can also
  toggle it in Dashboard → Auth → Providers → Anonymous. Required for the O-92
  join flow.
- `auth.users` / `auth.uid()` and the `anon` / `authenticated` roles already
  exist on Supabase — the migrations reference them directly.

### Privileges
Each table migration grants `authenticated` the table privileges explicitly, so
access never depends on a project's default-privilege config; RLS then governs
which rows are visible. `anon` gets no table access — players sign in
anonymously (→ `authenticated`) and reach an event only through the O-92 RPCs.

| Migration | Adds |
|---|---|
| `…_event_tenant_core.sql` | `events`, `teams`, `event_players` + RLS (O-90) |
| `…_rounds_scores_games.sql` | `courses`, `tees` (global library), `rounds` (nullable `event_id` = solo), `round_players`, `scores`, `games` + RLS (O-90) |
| `…_join_claim_rpcs.sql` | `get_event_by_code` / `claim_slot` / `add_self` — no-account join by link (O-92) |

## RLS shape

Tenant isolation is logical, via RLS on shared tables — never per-tournament
databases. Two SECURITY DEFINER helpers keep policies from recursing through the
tables they protect:

- `is_event_organizer(event_id)` — the caller owns the event.
- `is_event_member(event_id)` — the caller is a roster-bound (claimed) player.

The unbound *join-by-code* read/claim path is deliberately **not** a broad
policy (that would leak every event); it's a SECURITY DEFINER RPC in O-92.

Isolation is verified by the O-94 suite (a second event proves zero bleed),
which must run in CI before launch.
