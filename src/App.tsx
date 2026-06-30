import { useMemo, useState } from "react";
import {
  checkCurrentPlayerHu,
  checkDiscardHu,
  discardTile,
  drawTile,
  startRound,
  tileLabel,
  type PlayerId,
  type PlayerState,
  type RoundState,
  type Suit,
  type Tile,
} from "./game/index.ts";

const seed = "portfolio-demo-001";
const missingSuits: Suit[] = ["bamboos", "dots", "characters", "bamboos"];

type LogEntry = {
  id: number;
  text: string;
};

function createDemoRound(): RoundState {
  const round = startRound({ seed, dealer: 0 });

  return {
    ...round,
    players: round.players.map((player, index) => ({
      ...player,
      missingSuit: missingSuits[index],
    })),
  };
}

export function App() {
  const [round, setRound] = useState(createDemoRound);
  const [logs, setLogs] = useState<LogEntry[]>([
    { id: 1, text: `Seed ${seed} started. Dingque is prefilled for this prototype.` },
  ]);
  const currentPlayer = round.players[round.currentPlayer];
  const currentHu = checkCurrentPlayerHu(round);
  const lastLogId = logs.at(-1)?.id ?? 1;

  const totalDiscards = useMemo(
    () => round.players.reduce((sum, player) => sum + player.discards.length, 0),
    [round.players],
  );

  function addLog(text: string) {
    setLogs((items) => [{ id: (items.at(-1)?.id ?? 0) + 1, text }, ...items].slice(0, 8));
  }

  function handleReset() {
    setRound(createDemoRound());
    setLogs([{ id: lastLogId + 1, text: `Round reset with seed ${seed}.` }]);
  }

  function handleDraw() {
    const result = drawTile(round);

    if (!result.ok) {
      addLog(`Draw rejected: ${result.reason}.`);
      return;
    }

    setRound(result.round);
    addLog(`Player ${round.currentPlayer + 1} drew ${tileLabel(result.tile)}.`);
  }

  function handleDiscard(tile: Tile) {
    const result = discardTile(round, round.currentPlayer, tile);

    if (!result.ok) {
      addLog(`Discard ${tileLabel(tile)} rejected: ${result.reason}.`);
      return;
    }

    const discardChecks = result.round.players
      .filter((player) => player.id !== round.currentPlayer && !player.hasWon)
      .map((player) => ({ player, check: checkDiscardHu(round, player.id, tile) }))
      .filter(({ check }) => check.canHu);

    setRound(result.round);

    if (discardChecks.length > 0) {
      addLog(
        `Player ${round.currentPlayer + 1} discarded ${tileLabel(tile)}. ${discardChecks
          .map(({ player, check }) => `Player ${player.id + 1} can hu for ${check.canHu ? check.score.cappedPoints : 0}`)
          .join("; ")}.`,
      );
    } else {
      addLog(`Player ${round.currentPlayer + 1} discarded ${tileLabel(tile)}. Next: Player ${result.nextPlayer + 1}.`);
    }
  }

  return (
    <main className="app-shell">
      <section className="table-area" aria-label="Leshan Mahjong table">
        <header className="top-bar">
          <div>
            <h1>Leshan Mahjong Lab</h1>
            <p>Eight-chicken laizi prototype</p>
          </div>
          <div className="round-stats">
            <Stat label="Current" value={`P${round.currentPlayer + 1}`} />
            <Stat label="Wall" value={round.wall.length.toString()} />
            <Stat label="Discards" value={totalDiscards.toString()} />
          </div>
        </header>

        <div className="seats">
          {round.players.map((player) => (
            <PlayerSeat key={player.id} player={player} current={player.id === round.currentPlayer} />
          ))}
        </div>

        <section className="action-panel" aria-label="Current player actions">
          <div>
            <h2>Player {currentPlayer.id + 1} Hand</h2>
            <p>Missing suit: {currentPlayer.missingSuit ?? "unset"}</p>
          </div>
          <div className="actions">
            <button type="button" onClick={handleDraw}>Draw</button>
            <button type="button" onClick={handleReset}>Reset</button>
          </div>
          <div className="hu-status" data-ready={currentHu.canHu}>
            {currentHu.canHu
              ? `Self-draw hu available: ${currentHu.score.cappedPoints} points`
              : `Self-draw hu unavailable: ${currentHu.reason}`}
          </div>
          <div className="hand">
            {currentPlayer.hand.map((tile, index) => (
              <button
                className="tile"
                key={`${tileLabel(tile)}-${index}`}
                type="button"
                onClick={() => handleDiscard(tile)}
                title={`Discard ${tileLabel(tile)}`}
              >
                <span>{tile.rank}</span>
                <small>{suitName(tile.suit)}</small>
              </button>
            ))}
          </div>
        </section>
      </section>

      <aside className="log-panel" aria-label="Round log">
        <h2>Round Log</h2>
        <div className="log-list">
          {logs.map((log) => (
            <p key={log.id}>{log.text}</p>
          ))}
        </div>
      </aside>
    </main>
  );
}

function PlayerSeat({ player, current }: { player: PlayerState; current: boolean }) {
  return (
    <article className="seat" data-current={current}>
      <div className="seat-title">
        <h2>Player {player.id + 1}</h2>
        <span>{current ? "Turn" : "Waiting"}</span>
      </div>
      <div className="seat-meta">
        <span>{player.hand.length} tiles</span>
        <span>Missing {player.missingSuit ?? "unset"}</span>
      </div>
      <div className="discard-strip">
        {player.discards.length === 0 ? (
          <span className="empty">No discards</span>
        ) : (
          player.discards.map((tile, index) => (
            <span className="discard-tile" key={`${tileLabel(tile)}-${index}`}>
              {tile.rank}{suitGlyph(tile.suit)}
            </span>
          ))
        )}
      </div>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function suitName(suit: Suit): string {
  const names: Record<Suit, string> = {
    characters: "wan",
    dots: "dot",
    bamboos: "bam",
  };
  return names[suit];
}

function suitGlyph(suit: Suit): string {
  const names: Record<Suit, string> = {
    characters: "W",
    dots: "D",
    bamboos: "B",
  };
  return names[suit];
}

