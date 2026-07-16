# Supabase backend

Postgres schema for the Tournament Pass product. **Migrations are the source of
truth for the schema** (project convention) — every migration that touches a
table ships its RLS policies in the same file. Default-deny: a table without a
policy fails closed.

## Migrations

`migrations/` holds ordered, timestamped SQL. Apply with the Supabase CLI:

```bash
supabase db push          # apply pending migrations to the linked project
supabase db reset         # rebuild a local db from scratch (dev)
```

| Migration | Adds |
|---|---|
| `…_event_tenant_core.sql` | `events`, `teams`, `event_players` + RLS (O-90, first slice) |

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
