import { useMemo } from "react";
import { FeedIcon } from "./Icons";
import { buildFeed, feedForMatchTicker, type FeedItem } from "../scoring/activity";
import { feedHeadline, feedSubline, type FeedCopyContext } from "../scoring/feedCopy";
import { formatScrambleGroup, scrambleGroupNum } from "../scoring/engine";
import { usePlayerMap, useRoundContexts, useStore } from "../store/store";

interface ActivityTickerProps {
  roundId: string;
  excludeMatchId: string;
}

const EMPTY = "Nothing yet from the other groups";

function TickerEvent({
  item,
  copy,
  teamColor,
}: {
  item: FeedItem;
  copy: FeedCopyContext;
  teamColor?: string;
}) {
  const sub = feedSubline(item, copy);
  return (
    <span className="ticker-event">
      <span className="ticker-event-icon" aria-hidden="true">
        <FeedIcon kind={item.kind} size={18} />
      </span>
      <span className="ticker-event-text">
        <span className="ticker-event-title">{feedHeadline(item, copy)}</span>
        {sub && (
          <span className="ticker-event-sub">
            {teamColor && (
              <span className="feed-dot" style={{ background: teamColor }} />
            )}
            {sub}
          </span>
        )}
      </span>
    </span>
  );
}

export function ActivityTicker({ roundId, excludeMatchId }: ActivityTickerProps) {
  const { state } = useStore();
  const contexts = useRoundContexts();
  const players = usePlayerMap();
  const teamMap = useMemo(
    () => Object.fromEntries(state.teams.map((t) => [t.id, t])),
    [state.teams],
  );

  const items = useMemo(() => {
    const feed = buildFeed(state, contexts);
    return feedForMatchTicker(feed, roundId, excludeMatchId);
  }, [state, contexts, roundId, excludeMatchId]);

  const roundMatches = useMemo(
    () => state.matches.filter((m) => m.roundId === roundId),
    [state.matches, roundId],
  );

  const copy = useMemo(
    (): FeedCopyContext => ({
      playerName: (id?: string) => (id ? players[id]?.name ?? "Someone" : "Someone"),
      teamName: (id?: string) => (id ? teamMap[id]?.name ?? "A team" : "A team"),
      scrambleGroupLabel: (matchId?: string) => {
        if (!matchId) return null;
        const n = scrambleGroupNum(matchId, roundMatches);
        return n ? formatScrambleGroup(n) : null;
      },
    }),
    [players, teamMap, roundMatches],
  );

  const empty = items.length === 0;

  const renderItems = (suffix = "") =>
    items.map((item) => (
      <span className="ticker-item" key={`${item.id}${suffix}`}>
        <TickerEvent
          item={item}
          copy={copy}
          teamColor={item.teamId ? teamMap[item.teamId]?.color : undefined}
        />
      </span>
    ));

  return (
    <div className="ticker-wrap">
      <div className="ticker" aria-label="Live activity from other groups">
        <div className="ticker-track">
          {empty ? (
            <>
              <span className="ticker-item ticker-placeholder">{EMPTY}</span>
              <span className="ticker-item ticker-placeholder" aria-hidden="true">
                {EMPTY}
              </span>
            </>
          ) : (
            <>
              {renderItems()}
              {renderItems("-dup")}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
