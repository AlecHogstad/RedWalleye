// Row types for the product schema (O-90 / O-91). Hand-written to match the
// migrations; can be regenerated later with `supabase gen types typescript`.

export interface Profile {
  id: string;
  display_name: string | null;
  created_at: string;
  updated_at: string;
}

export type EventStatus = "draft" | "active" | "final";
export type PaymentStatus = "unpaid" | "paid";

export interface EventRow {
  id: string;
  organizer_id: string;
  name: string;
  starts_on: string | null;
  ends_on: string | null;
  status: EventStatus;
  payment_status: PaymentStatus;
  join_code: string;
  created_at: string;
}

export interface Team {
  id: string;
  event_id: string;
  name: string;
  color: string | null;
  ordinal: number;
  created_at: string;
}

export type PlayerStatus = "active" | "withdrawn";

export interface EventPlayer {
  id: string;
  event_id: string;
  name: string;
  handicap: number | null;
  team_id: string | null;
  claimed_by: string | null;
  rejoin_pin: string | null;
  status: PlayerStatus;
  created_at: string;
}

export interface Course {
  id: string;
  name: string;
  location: string | null;
  created_by: string | null;
  created_at: string;
}

/** One hole of a tee's card. */
export interface TeeHole {
  hole: number;
  par: number;
  si: number;
  yards?: number;
}

export interface Tee {
  id: string;
  course_id: string;
  name: string;
  rating: number | null;
  slope: number | null;
  par: number | null;
  hole_data: TeeHole[];
  created_by: string | null;
  created_at: string;
}

export type RoundStatus = "pending" | "active" | "final";

export interface Round {
  id: string;
  event_id: string | null;
  course_id: string | null;
  tee_id: string | null;
  round_date: string | null;
  status: RoundStatus;
  created_by: string;
  created_at: string;
}

export interface RoundPlayer {
  id: string;
  round_id: string;
  event_player_id: string | null;
  user_id: string | null;
  created_at: string;
}

export interface Score {
  id: string;
  round_id: string;
  round_player_id: string;
  hole_number: number;
  strokes: number | null;
  pickup_flag: boolean;
  updated_by: string | null;
  updated_at: string;
}

/** `config_json` is the engine's HouseRules blob (format + rules + side games). */
export interface Game {
  id: string;
  event_id: string;
  round_id: string | null;
  type: string;
  config_json: Record<string, unknown>;
  created_at: string;
}
