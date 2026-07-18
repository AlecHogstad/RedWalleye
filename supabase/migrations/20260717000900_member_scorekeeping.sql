-- v1 trusted-group parity inside an event. On the course, one phone per
-- group enters the whole group's scores, anyone can start/finish a round,
-- set matchups, or pass the snake — v1's model, which the product keeps so
-- the player experience is identical. Tenant isolation is unchanged (all of
-- these gates go through can_read_round → event membership); members of
-- other events still see and touch nothing. Deletes stay organizer-only.

-- Scores: any member of the round's event may write (was: own rows only).
drop policy scores_insert on public.scores;
drop policy scores_update on public.scores;
create policy scores_insert on public.scores
  for insert with check (can_read_round(round_id));
create policy scores_update on public.scores
  for update using (can_read_round(round_id))
  with check (can_read_round(round_id));

-- Rounds: members may start/finish/reopen and set pairings/side games
-- (was: organizer only).
drop policy rounds_update on public.rounds;
create policy rounds_update on public.rounds
  for update using (can_read_round(id))
  with check (can_read_round(id));

-- Round enrollment: members may enroll the roster when starting a round.
drop policy round_players_write on public.round_players;
create policy round_players_write on public.round_players
  for all using (can_read_round(round_id))
  with check (can_read_round(round_id));
