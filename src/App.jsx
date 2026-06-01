import { useState, useEffect, useRef } from "react";
import { db } from "./firebase";
import { ref, set, get, remove, onValue, off } from "firebase/database";

// ─── Card Engine ──────────────────────────────────────────────────────────────
const SUITS = ["♠","♥","♦","♣"];
const RANKS = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];

function cardValue(rank) {
  if (rank === "A") return 1;
  if (["J","Q","K"].includes(rank)) return 10;
  return parseInt(rank);
}
function buildDeck(sets = 1) {
  let d = [];
  for (let s = 0; s < sets; s++)
    for (const suit of SUITS)
      for (const rank of RANKS)
        d.push({ suit, rank, id: `${rank}${suit}_${s}` });
  return d;
}
function shuffle(a) {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}
function handScore(hand, jokerRank) {
  return (hand || []).reduce((s, c) => s + (c.rank === jokerRank ? 0 : cardValue(c.rank)), 0);
}
function isRed(suit) { return suit === "♥" || suit === "♦"; }
// Reshuffle discard (all except top card) into draw pile when draw pile is exhausted
function reshuffleIfNeeded(r) {
  if ((r.drawPile || []).length === 0 && (r.discardPile || []).length > 1) {
    const top = r.discardPile[0];                        // keep top card visible
    const toShuffle = r.discardPile.slice(1);            // rest go back into draw
    r.drawPile = shuffle(toShuffle);
    r.discardPile = [top];
    r.log = ["♻️ Draw pile empty — discard reshuffled!", ...(r.log || []).slice(0, 14)];
  }
}

// Compute next player after skipping N players.
// If skipCount >= all other players, dropper plays again.
function computeNext(curIdx, skipCount, totalPlayers) {
  if (totalPlayers <= 1) return curIdx;
  if (skipCount >= totalPlayers - 1) return curIdx; // all others skipped
  return (curIdx + 1 + skipCount) % totalPlayers;
}

function genRoomCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

// ─── Firebase helpers ─────────────────────────────────────────────────────────
async function roomGet(roomId) {
  try {
    const snap = await get(ref(db, `rooms/${roomId}`));
    return snap.exists() ? snap.val() : null;
  } catch { return null; }
}
async function roomSet(roomId, state) {
  try { await set(ref(db, `rooms/${roomId}`), state); }
  catch (e) { console.error("roomSet error", e); }
}
async function roomDelete(roomId) {
  try { await remove(ref(db, `rooms/${roomId}`)); } catch {}
}
function roomListen(roomId, callback) {
  const r = ref(db, `rooms/${roomId}`);
  onValue(r, snap => { if (snap.exists()) callback(snap.val()); });
  return () => off(r);
}

// ─── Card Face ────────────────────────────────────────────────────────────────
function CardFace({ card, selected, onClick, small, faceDown, isJoker }) {
  const red = !faceDown && isRed(card.suit);
  return (
    <div
      className={["card", small ? "card-sm" : "card-md", red ? "red" : "blk",
        selected ? "sel" : "", onClick ? "tap" : "", faceDown ? "back" : "",
        isJoker ? "joker-glow" : ""].filter(Boolean).join(" ")}
      onClick={onClick}
    >
      {faceDown ? <div className="back-pat" /> : (
        <>
          <span className="corner tl"><b>{card.rank}</b><span>{card.suit}</span></span>
          <span className="mid-suit">{card.suit}</span>
          <span className="corner br"><b>{card.rank}</b><span>{card.suit}</span></span>
          {isJoker && <span className="joker-star">★</span>}
        </>
      )}
    </div>
  );
}

// ─── Lobby ────────────────────────────────────────────────────────────────────
function Lobby({ onJoin }) {
  const [name, setName] = useState("");
  const [mode, setMode] = useState("create");
  const [roomCode, setRoomCode] = useState("");
  const [numPlayers, setNumPlayers] = useState(4);
  const [numSets, setNumSets] = useState(1);
  const [maxScore, setMaxScore] = useState(200);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return setErr("Enter your name");
    setLoading(true); setErr("");
    const code = genRoomCode();
    const room = {
      code, host: name.trim(), maxPlayers: numPlayers, numSets, maxScore,
      players: [{ name: name.trim(), score: 0, eliminated: false }],
      phase: "lobby", log: ["Room created. Waiting for players…"],
    };
    await roomSet(code, room);
    onJoin(code, name.trim(), true);
    setLoading(false);
  };

  const handleJoin = async () => {
    if (!name.trim()) return setErr("Enter your name");
    if (!roomCode.trim()) return setErr("Enter room code");
    setLoading(true); setErr("");
    const room = await roomGet(roomCode.toUpperCase());
    if (!room) { setErr("Room not found"); setLoading(false); return; }
    if (room.phase !== "lobby") { setErr("Game already started"); setLoading(false); return; }
    if (room.players.length >= room.maxPlayers) { setErr("Room is full"); setLoading(false); return; }
    if (room.players.find(p => p.name === name.trim())) { setErr("Name taken"); setLoading(false); return; }
    room.players.push({ name: name.trim(), score: 0, eliminated: false });
    await roomSet(roomCode.toUpperCase(), room);
    onJoin(roomCode.toUpperCase(), name.trim(), false);
    setLoading(false);
  };

  return (
    <div className="lobby">
      <div className="lobby-card">
        <div className="brand">🃏 <span>LOW CARD</span></div>
        <p className="brand-sub">Online Multiplayer · Up to 12 Players</p>
        <div className="tab-row">
          <button className={`tab ${mode === "create" ? "on" : ""}`} onClick={() => { setMode("create"); setErr(""); }}>Create Room</button>
          <button className={`tab ${mode === "join" ? "on" : ""}`} onClick={() => { setMode("join"); setErr(""); }}>Join Room</button>
        </div>
        <div className="field">
          <label>YOUR NAME</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Enter name" maxLength={14}
            onKeyDown={e => e.key === "Enter" && (mode === "create" ? handleCreate() : handleJoin())} />
        </div>
        {mode === "create" ? (
          <>
            <div className="field-row">
              <div className="field">
                <label>MAX PLAYERS</label>
                <div className="mini-btns">
                  {[2,3,4,5,6,7,8,9,10,11,12].map(n => (
                    <button key={n} className={`nb ${numPlayers === n ? "on" : ""}`} onClick={() => setNumPlayers(n)}>{n}</button>
                  ))}
                </div>
              </div>
              <div className="field">
                <label>CARD SETS</label>
                <div className="mini-btns">
                  {[1,2,3,4].map(n => (
                    <button key={n} className={`nb ${numSets === n ? "on" : ""}`} onClick={() => setNumSets(n)}>{n}</button>
                  ))}
                </div>
              </div>
            </div>
            <div className="field">
              <label>ELIMINATION SCORE — <b style={{color:"var(--gold)"}}>{maxScore} pts</b></label>
              <div className="score-slider-row">
                <input type="range" min={50} max={500} step={50} value={maxScore}
                  onChange={e => setMaxScore(+e.target.value)} className="slider" />
                <span className="slider-val">{maxScore}</span>
              </div>
            </div>
            {err && <div className="err">{err}</div>}
            <button className="cta" onClick={handleCreate} disabled={loading}>{loading ? "Creating…" : "CREATE ROOM"}</button>
          </>
        ) : (
          <>
            <div className="field">
              <label>ROOM CODE</label>
              <input value={roomCode} onChange={e => setRoomCode(e.target.value.toUpperCase())}
                placeholder="e.g. AB3XY" maxLength={5} className="code-input" />
            </div>
            {err && <div className="err">{err}</div>}
            <button className="cta" onClick={handleJoin} disabled={loading}>{loading ? "Joining…" : "JOIN ROOM"}</button>
          </>
        )}
        <p className="lobby-hint">Share the room code with friends — works on any device!</p>
      </div>
    </div>
  );
}

// ─── Waiting Room ─────────────────────────────────────────────────────────────
function WaitingRoom({ roomId, myName, isHost, onGameStart }) {
  const [room, setRoom] = useState(null);

  useEffect(() => {
    const unsub = roomListen(roomId, r => {
      if (r.phase === "playing") { onGameStart(r); return; }
      setRoom(r);
    });
    return unsub;
  }, [roomId, onGameStart]);

  const startGame = async () => {
    const r = await roomGet(roomId);
    if (!r || r.players.length < 2) return;
    // Ensure enough cards: each player gets 7 + need at least 10 extra for draw pile + joker
    const minCards = r.players.length * 7 + 10;
    const setsNeeded = Math.max(r.numSets, Math.ceil(minCards / 52));
    let deck = shuffle(buildDeck(setsNeeded));
    const hands = {};
    for (const p of r.players) hands[p.name] = deck.splice(0, 7);
    // Pick joker: not J or 7. Fallback to any card if somehow all remaining are J/7.
    let candidates = deck.filter(c => c.rank !== "J" && c.rank !== "7");
    if (candidates.length === 0) candidates = [...deck];
    const jc = candidates[Math.floor(Math.random() * candidates.length)];
    deck.splice(deck.findIndex(c => c.id === jc.id), 1);
    const gs = {
      ...r, phase: "playing", hands, drawPile: deck, discardPile: [],
      jokerRank: jc.rank, jokerSuit: jc.suit,
      currentPlayer: 0,
      currentPlayerName: r.players[0]?.name,
      roundStartPlayerIdx: 0,   // tracks who starts each round (circular)
      turnStartedAt: Date.now(),
      sevenPenalty: 0, lastDropRank: null,
      round: 1, showCaller: null, roundOver: false, gameOver: false, winner: null,
      roundHistory: [],          // [{round, scores: {playerName: score}}]
      log: [`Round 1 started! Joker: ${jc.rank}${jc.suit} = 0 pts`],
    };
    await roomSet(roomId, gs);
    onGameStart(gs);
  };

  if (!room) return <div className="loading-screen">Connecting…</div>;

  return (
    <div className="lobby">
      <div className="lobby-card">
        <div className="brand">🃏 <span>LOW CARD</span></div>
        <div className="room-code-display">
          <span className="rc-label">ROOM CODE — Share this!</span>
          <span className="rc-val">{roomId}</span>
          <span className="rc-hint">Friends open the game and enter this code</span>
        </div>
        <div className="player-list">
          <div className="pl-head">PLAYERS ({room.players.length} / {room.maxPlayers})</div>
          {room.players.map((p, i) => (
            <div key={i} className={`pl-item ${p.name === room.host ? "host" : ""}`}>
              <span>{p.name}</span>
              {p.name === room.host && <span className="host-badge">HOST</span>}
              {p.name === myName && <span className="you-badge">YOU</span>}
              {isHost && p.name !== myName && (
                <button className="kick-btn" onClick={async () => {
                  const r = await roomGet(room.code);
                  if (!r) return;
                  r.players = r.players.filter(x => x.name !== p.name);
                  await roomSet(room.code, r);
                }} title={`Remove ${p.name}`}>✕</button>
              )}
            </div>
          ))}
        </div>
        <div className="room-meta">Card Sets: <b>{room.numSets}</b> · Eliminated at: <b>{room.maxScore} pts</b></div>
        {isHost && room.players.length >= 2 && <button className="cta" onClick={startGame}>START GAME ▶</button>}
        {isHost && room.players.length < 2 && <p className="wait-hint">Need at least 2 players…</p>}
        {!isHost && <p className="wait-hint">Waiting for <b>{room.host}</b> to start…</p>}
      </div>
    </div>
  );
}

// ─── Timer Border Component ──────────────────────────────────────────────────
// Renders a clockwise-shrinking arc border around its parent element.
// Uses a hidden sentinel span to measure the parent, then draws an SVG overlay.
// ONLY re-renders when pct changes — measurement is stable via ResizeObserver.
function TimerBorder({ pct, borderR = 10, sw = 3 }) {
  const sentinelRef = useRef(null);
  const [dim, setDim] = useState(null); // {w, h} in px — parent's offsetWidth/Height

  useEffect(() => {
    const parent = sentinelRef.current?.parentElement;
    if (!parent) return;
    // Use offsetWidth/offsetHeight consistently (includes padding, excludes margin/border)
    const measure = () => {
      const w = parent.offsetWidth;
      const h = parent.offsetHeight;
      if (w > 0 && h > 0) setDim({ w, h });
    };
    measure();
    const obs = new ResizeObserver(measure);
    obs.observe(parent);
    return () => obs.disconnect();
  }, []);

  // Always render the sentinel so the ref is attached and measurement can fire
  const sentinel = <span ref={sentinelRef} style={{display:"none",position:"absolute"}} />;
  if (!dim) return sentinel;

  const { w, h } = dim;
  const r  = Math.min(borderR, w / 2, h / 2); // clamp radius
  const pad = sw;           // SVG extends `sw` px outside chip on each side
  const W   = w + pad * 2;  // total SVG width
  const H   = h + pad * 2;  // total SVG height
  const ins = sw / 2;       // stroke centerline inset from chip edge

  // Coordinates of the stroke centerline box
  const x1 = pad + ins;         // left centerline
  const x2 = pad + w - ins;     // right centerline
  const y1 = pad + ins;         // top centerline
  const y2 = pad + h - ins;     // bottom centerline
  const sx  = pad + w / 2;      // start x = top center

  // Clockwise path from top-center
  const d = [
    `M ${sx} ${y1}`,
    `H ${x2 - r}`,
    `Q ${x2} ${y1} ${x2} ${y1 + r}`,
    `V ${y2 - r}`,
    `Q ${x2} ${y2} ${x2 - r} ${y2}`,
    `H ${x1 + r}`,
    `Q ${x1} ${y2} ${x1} ${y2 - r}`,
    `V ${y1 + r}`,
    `Q ${x1} ${y1} ${x1 + r} ${y1}`,
    `H ${sx}`,
  ].join(" ");

  // True perimeter of the stroke centerline path
  const straightW = (x2 - x1) - 2 * r;   // top + bottom straight segments per side
  const straightH = (y2 - y1) - 2 * r;   // left + right straight segments per side
  const perim = 2 * straightW + 2 * straightH + 2 * Math.PI * r;
  const dashLen = Math.max(0, (pct / 100) * perim);

  const color = pct > 50 ? "#2ecc71" : pct > 20 ? "#e67e22" : "#e74c3c";

  return (
    <>
      {sentinel}
      <svg
        width={W} height={H}
        style={{
          position: "absolute",
          top:  -pad,
          left: -pad,
          pointerEvents: "none",
          zIndex: 10,
          // No overflow:hidden — parent chip must NOT clip this SVG
        }}
      >
        {/* Dim track — full perimeter */}
        <path d={d} fill="none"
          stroke="rgba(255,255,255,0.12)" strokeWidth={sw} strokeLinecap="round"
          strokeDasharray={`${perim} ${perim}`} />
        {/* Coloured arc — shrinks as pct decreases */}
        <path d={d} fill="none"
          stroke={color} strokeWidth={sw} strokeLinecap="round"
          strokeDasharray={`${dashLen} ${perim}`}
          strokeDashoffset={0} />
      </svg>
    </>
  );
}

// ─── Game Screen ──────────────────────────────────────────────────────────────
function GameScreen({ roomId, myName, initialState }) {
  const [gs, setGs] = useState(initialState);
  const [selected, setSelected] = useState([]);
  const [flashMsg, setFlashMsg] = useState("");
  // pendingDraw is derived from Firebase so it survives re-renders and Firebase syncs
  // const [pendingDraw, setPendingDraw] = useState(false); -- REMOVED
  const [timeLeft, setTimeLeft] = useState(60);
  const [showScoreBoard, setShowScoreBoard] = useState(false);
  // Local hand display order — drag to reorder, sort buttons
  const [handOrder, setHandOrder] = useState(null); // null = use natural Firebase order
  const handOrderRef = useRef(null); // tracks hand length to auto-reset on change

  // Real-time listener
  useEffect(() => {
    const unsub = roomListen(roomId, r => {
      setGs(r);
      setSelected([]);
      // Reset hand order only if card count changed (new card drawn / card dropped)
      // Use a ref to compare previous hand length
      const newHand = r.hands?.[myName] || [];
      const newLen = newHand.length;
      const prevLen = handOrderRef.current;
      if (prevLen === null) {
        // First load — natural order
        handOrderRef.current = newLen;
      } else if (newLen > prevLen) {
        // Card(s) added — append new indices at the end of current order
        setHandOrder(prev => {
          if (!prev) return null; // not sorted yet, stay natural
          const existing = prev.filter(i => i < newLen);
          for (let i = prevLen; i < newLen; i++) existing.push(i);
          return existing;
        });
        handOrderRef.current = newLen;
      } else if (newLen < prevLen) {
        // Card(s) removed — rebuild keeping only valid indices in current order
        setHandOrder(prev => {
          if (!prev) return null;
          const valid = prev.filter(i => i < newLen);
          return valid.length === newLen ? valid : null;
        });
        handOrderRef.current = newLen;
      }
    });
    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, myName]);

  // ── 1-minute turn timer — runs for ALL clients so everyone sees the countdown ──
  useEffect(() => {
    if (!gs.turnStartedAt || gs.roundOver || gs.gameOver) return;
    const tick = setInterval(() => {
      const elapsed = Math.floor((Date.now() - gs.turnStartedAt) / 1000);
      const left = Math.max(0, 60 - elapsed);
      setTimeLeft(left);
      // Only the current player's client triggers the auto-advance
      if (left === 0 && gs.currentPlayerName === myName) {
        clearInterval(tick);
        autoAdvanceTurn(gs.turnStartedAt);
      }
    }, 500);
    return () => clearInterval(tick);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gs.turnStartedAt, gs.currentPlayerName, gs.roundOver, gs.gameOver]);

  const flash = (m) => { setFlashMsg(m); setTimeout(() => setFlashMsg(""), 3000); };

  const activePlayers = (gs.players || []).filter(p => !p.eliminated);
  const cpIdx = (gs.currentPlayer || 0) % Math.max(activePlayers.length, 1);
  const currentPlayerName = activePlayers[cpIdx]?.name;
  const isMyTurn = currentPlayerName === myName;
  const myHand = gs.hands?.[myName] || [];
  // orderedHand: display order. handOrder stores indices into myHand.
  const orderedHand = handOrder
    ? handOrder.filter(i => i < myHand.length).map(i => myHand[i])
    : myHand;
  const myScore = gs.players?.find(p => p.name === myName)?.score ?? 0;
  const isEliminated = gs.players?.find(p => p.name === myName)?.eliminated;
  const jokerRank = gs.jokerRank;
  const myCount = handScore(myHand, jokerRank);
  const sevenPenalty = gs.sevenPenalty || 0;
  // Derived from Firebase — true only when THIS player has dropped and must choose draw source
  const pendingDraw = gs._awaitingDraw === myName;
  const lastDropRank = gs.lastDropRank || null;

  // mustTakePenalty is true only if penalty > 0 AND it's your turn AND you have NOT selected cards yet
  // We keep it as a derived flag for the "take penalty" button, but card selection is always allowed on your turn
  const penaltyActive = isMyTurn && sevenPenalty > 0;

  // ── FIXED: Allow card selection even during 7-penalty so player can counter ──
  const toggleSelect = (idx) => {
    if (!isMyTurn || gs.roundOver || pendingDraw) return;
    const card = orderedHand[idx];
    setSelected(prev => {
      if (prev.includes(idx)) return prev.filter(i => i !== idx);
      const allRanks = [...prev.map(i => orderedHand[i].rank), card.rank];
      if ([...new Set(allRanks)].length > 1) { flash("Select cards of the same rank only!"); return prev; }
      return [...prev, idx];
    });
  };

  // ── Is the current selection a valid 7-chain counter? ──
  // Valid counters: dropping 7s (chains forward) OR dropping 3+ same-rank cards (tackles)
  const isValidSevenCounter = (dropping) => {
    if (!dropping.length) return false;
    if (dropping[0].rank === "7") return true;   // forward chain
    if (dropping.length > 2) return true;         // tackle with 3+ same-rank
    return false;
  };

  // ── Main drop action ──
  // Phase 1: Drop the cards. If a draw is needed, pause and let player choose source.
  // Phase 2 (drawFromPile / drawFromDiscard): complete the turn.
  const doAction = async () => {
    if (!isMyTurn || selected.length === 0 || gs.roundOver) return;
    const r = await roomGet(roomId);
    if (!r || r.roundOver) return;

    const hand = [...(r.hands[myName] || [])];
    // Map display-order indices back to real hand indices
    const realSelected = handOrder ? selected.map(si => handOrder[si] ?? si) : selected;
    const dropping = realSelected.map(i => hand[i]);
    const dropRank = dropping[0].rank;

    if (!dropping.every(c => c.rank === dropRank)) { flash("All dropped cards must be same rank!"); return; }

    const aPlayers = r.players.filter(p => !p.eliminated);
    const curIdx = (r.currentPlayer || 0) % aPlayers.length;

    // ── 7-penalty validation ──
    if ((r.sevenPenalty || 0) > 0) {
      if (!isValidSevenCounter(dropping)) {
        flash(`Must counter with 7s or 3+ same-rank cards, or click "Draw ${r.sevenPenalty * 2}"`);
        return;
      }
      if (dropRank !== "7") r.sevenPenalty = 0;
    }

    // ── Remove dropped cards (using real Firebase indices via realSelected) ──
    [...realSelected].sort((a, b) => b - a).forEach(i => hand.splice(i, 1));
    r.discardPile = [...dropping, ...(r.discardPile || [])];
    // Store how many cards were just dropped so drawFromDiscard can find the correct previous card
    r._droppedCount = dropping.length;

    let logMsg = `${myName} dropped ${dropping.map(c => c.rank + c.suit).join(", ")}`;
    let skipCount = 0;

    const isClash = !!(r.lastDropRank && dropRank === r.lastDropRank && dropRank !== "7" && dropRank !== "J");
    if (isClash) logMsg += ` ⚡ CLASH! No draw needed`;

    if (dropRank === "J") {
      skipCount = dropping.length;
      logMsg += ` → ${skipCount} player${skipCount > 1 ? "s" : ""} SKIPPED!`;
    }

    if (dropRank === "7") {
      r.sevenPenalty = (r.sevenPenalty || 0) + dropping.length;
      logMsg += ` → 7-chain! Next player must counter or draw ${r.sevenPenalty * 2} cards`;
    } else {
      r.sevenPenalty = r.sevenPenalty || 0; // keep if tackle cleared it above
    }

    // ── Must draw? (player chooses draw source) ──
    const mustDraw = dropping.length <= 2 && dropRank !== "J" && dropRank !== "7" && !isClash;

    // ── Auto-assign card ONLY when player will NOT be drawing themselves ──
    // i.e. dropped J, dropped 7, dropped 3+ cards, or clash — any case where mustDraw = false
    // This ensures the player never ends up with 0 cards in hand permanently
    if (hand.length === 0 && !mustDraw) {
      reshuffleIfNeeded(r);
      if (r.drawPile.length > 0) {
        hand.push(r.drawPile.shift());
        logMsg += " (auto-drew: empty hand)";
      }
    }
    r.hands[myName] = hand;

    r.lastDropRank = dropRank;
    r.log = [logMsg, ...(r.log || []).slice(0, 14)];

    if (mustDraw) {
      // Save intermediate state to Firebase (cards are dropped, draw pending)
      // Store skipCount so drawFromPile/drawFromDiscard can use it
      r._pendingSkip = skipCount;
      r._pendingPlayer = curIdx;
      r._awaitingDraw = myName; // flags that this player still needs to draw
      await roomSet(roomId, r);
      setSelected([]);
      // pendingDraw is now derived from gs._awaitingDraw — no local state needed
    } else {
      // No draw needed — advance turn immediately
      r.currentPlayer = computeNext(curIdx, skipCount, aPlayers.length);
      r.currentPlayerName = aPlayers[r.currentPlayer]?.name;
      r.turnStartedAt = Date.now();
      r._awaitingDraw = null;
      r._pendingSkip = null;
      r._pendingPlayer = null;
      await roomSet(roomId, r);
      setSelected([]);
    }
  };

  // ── Draw from the face-down draw pile ──
  const drawFromPile = async () => {
    if (!pendingDraw) return;
    const r = await roomGet(roomId);
    if (!r || !r._awaitingDraw) return;
    const skipCount = r._pendingSkip || 0;
    const curIdx = r._pendingPlayer || 0;
    const aPlayers = r.players.filter(p => !p.eliminated);
    const hand = [...(r.hands[myName] || [])];
    reshuffleIfNeeded(r);
    if (r.drawPile.length > 0) {
      hand.push(r.drawPile.shift());
      r.log = [`${myName} drew from pile`, ...(r.log || []).slice(0, 14)];
    }
    r.hands[myName] = hand;
    r.currentPlayer = computeNext(curIdx, skipCount, aPlayers.length);
    r.currentPlayerName = aPlayers[r.currentPlayer]?.name;
    r.turnStartedAt = Date.now();
    r._awaitingDraw = null;
    r._pendingSkip = null;
    r._pendingPlayer = null;
    r._droppedCount = null;
    await roomSet(roomId, r);
  };

  // ── Draw from discard pile — takes the card dropped by the PREVIOUS player ──
  const drawFromDiscard = async () => {
    if (!pendingDraw) return;
    const r = await roomGet(roomId);
    if (!r || !r._awaitingDraw) return;
    // Previous player's card is at index [_droppedCount] (after all of current player's dropped cards)
    const prevIdx = r._droppedCount || 1;
    const prevCard = (r.discardPile || [])[prevIdx];
    if (!prevCard) { flash("No card available from discard!"); return; }
    if (prevCard.rank === "J" || prevCard.rank === "7") {
      flash("Cannot take J or 7 from discard pile!"); return;
    }
    const skipCount = r._pendingSkip || 0;
    const curIdx = r._pendingPlayer || 0;
    const aPlayers = r.players.filter(p => !p.eliminated);
    const hand = [...(r.hands[myName] || [])];
    hand.push(prevCard);
    // Remove prevCard from its position in discard pile
    r.discardPile = [...r.discardPile.slice(0, prevIdx), ...r.discardPile.slice(prevIdx + 1)];
    r.hands[myName] = hand;
    r.log = [`${myName} took ${prevCard.rank}${prevCard.suit} from discard`, ...(r.log || []).slice(0, 14)];
    r.currentPlayer = computeNext(curIdx, skipCount, aPlayers.length);
    r.currentPlayerName = aPlayers[r.currentPlayer]?.name;
    r.turnStartedAt = Date.now();
    r._awaitingDraw = null;
    r._pendingSkip = null;
    r._pendingPlayer = null;
    r._droppedCount = null;
    await roomSet(roomId, r);
  };

  // ── Accept 7 penalty (give up on countering) ──
  const takePenalty = async () => {
    if (!isMyTurn || !sevenPenalty) return;
    const r = await roomGet(roomId);
    if (!r) return;
    const pen = (r.sevenPenalty || 0) * 2;
    const hand = [...(r.hands[myName] || [])];
    reshuffleIfNeeded(r);
    for (let i = 0; i < pen && r.drawPile.length > 0; i++) {
      hand.push(r.drawPile.shift());
      reshuffleIfNeeded(r); // reshuffle mid-penalty if needed
    }
    r.hands[myName] = hand;
    r.sevenPenalty = 0;
    r.lastDropRank = null;
    const aPlayers = r.players.filter(p => !p.eliminated);
    r.currentPlayer = ((r.currentPlayer || 0) % aPlayers.length + 1) % aPlayers.length;
    r.currentPlayerName = aPlayers[r.currentPlayer]?.name;
    r.turnStartedAt = Date.now();
    r.log = [`${myName} drew ${pen} penalty cards`, ...(r.log || []).slice(0, 14)];
    await roomSet(roomId, r);
    setSelected([]);
  };

  // ── Auto-advance turn when timer expires (also tracks AFK count) ──
  const autoAdvanceTurn = async (capturedTurnStart) => {
    const r = await roomGet(roomId);
    if (!r || r.roundOver || r._awaitingDraw) return;
    // Guard: if turnStartedAt changed, the turn already moved — abort to prevent state revert on reconnect
    if (capturedTurnStart && r.turnStartedAt !== capturedTurnStart) return;
    const aPlayers = r.players.filter(p => !p.eliminated);
    const curIdx = (r.currentPlayer || 0) % aPlayers.length;
    if (aPlayers[curIdx]?.name !== myName) return;
    const hand = [...(r.hands[myName] || [])];
    if (hand.length === 0) return;

    // ── Increment AFK counter for this player ──
    const afkCounts = { ...(r.afkCounts || {}) };
    afkCounts[myName] = (afkCounts[myName] || 0) + 1;
    r.afkCounts = afkCounts;

    // ── If 5 AFK strikes — remove the player ──
    if (afkCounts[myName] >= 5) {
      r.players = r.players.filter(p => p.name !== myName);
      if (r.hands) delete r.hands[myName];
      const remaining = r.players.filter(p => !p.eliminated);
      if (remaining.length <= 1) {
        r.roundOver = true; r.gameOver = true; r.winner = remaining[0]?.name || null;
      } else {
        const nextAPlayers = r.players.filter(p => !p.eliminated);
        const newIdx = curIdx % Math.max(nextAPlayers.length, 1);
        r.currentPlayer = newIdx;
        r.currentPlayerName = nextAPlayers[newIdx]?.name;
        r.turnStartedAt = Date.now();
      }
      if (r.host === myName && remaining.length > 0) {
        r.host = remaining.reduce((a, b) => a.score <= b.score ? a : b).name;
      }
      r.log = [`🚫 ${myName} removed for being AFK (5 timeouts)`, ...(r.log || []).slice(0, 14)];
      await roomSet(roomId, r);
      return;
    }

    // ── 7-penalty active: auto-counter or auto-take penalty ──
    if ((r.sevenPenalty || 0) > 0) {
      const sevens = hand.filter(c => c.rank === "7");
      const rankCounts = {};
      hand.forEach(c => { rankCounts[c.rank] = (rankCounts[c.rank] || 0) + 1; });
      const tackleRank = Object.keys(rankCounts).find(rank => rankCounts[rank] >= 3);
      const livesLeft = 5 - afkCounts[myName];
      if (sevens.length > 0) {
        // Auto-forward all 7s
        sevens.forEach(s => hand.splice(hand.findIndex(c => c.id === s.id), 1));
        r.discardPile = [...sevens, ...(r.discardPile || [])];
        r.sevenPenalty = (r.sevenPenalty || 0) + sevens.length;
        r.lastDropRank = "7";
        if (hand.length === 0) { reshuffleIfNeeded(r); if (r.drawPile.length > 0) hand.push(r.drawPile.shift()); }
        r.hands[myName] = hand;
        r.log = [`⏱️ ${myName} timed out — auto-forwarded ${sevens.map(c=>c.rank+c.suit).join(",")} · ${livesLeft} life${livesLeft!==1?"s":""} left`, ...(r.log||[]).slice(0,14)];
      } else if (tackleRank) {
        // Auto-tackle with 3 cards of same rank
        const tackleCards = hand.filter(c => c.rank === tackleRank).slice(0, 3);
        tackleCards.forEach(c => hand.splice(hand.findIndex(x => x.id === c.id), 1));
        r.discardPile = [...tackleCards, ...(r.discardPile || [])];
        r.sevenPenalty = 0;
        r.lastDropRank = tackleRank;
        if (hand.length === 0) { reshuffleIfNeeded(r); if (r.drawPile.length > 0) hand.push(r.drawPile.shift()); }
        r.hands[myName] = hand;
        r.log = [`⏱️ ${myName} timed out — auto-tackled 7-chain with ${tackleRank}s · ${livesLeft} life${livesLeft!==1?"s":""} left`, ...(r.log||[]).slice(0,14)];
      } else {
        // Can't counter — auto-take penalty cards
        const pen = r.sevenPenalty * 2;
        reshuffleIfNeeded(r);
        for (let i = 0; i < pen && r.drawPile.length > 0; i++) { hand.push(r.drawPile.shift()); reshuffleIfNeeded(r); }
        r.sevenPenalty = 0;
        r.lastDropRank = null;
        r.hands[myName] = hand;
        r.log = [`⏱️ ${myName} timed out — took ${pen} penalty cards · ${livesLeft} life${livesLeft!==1?"s":""} left`, ...(r.log||[]).slice(0,14)];
      }
      const nextIdxSeven = computeNext(curIdx, 0, aPlayers.length);
      r.currentPlayer = nextIdxSeven;
      r.currentPlayerName = aPlayers[nextIdxSeven]?.name;
      r.turnStartedAt = Date.now();
      r._awaitingDraw = null;
      await roomSet(roomId, r);
      return;
    }

    // ── Normal auto-advance: drop highest card, draw from pile ──
    const highestIdx = hand.reduce((maxI, c, i) =>
      (c.rank === r.jokerRank ? 0 : cardValue(c.rank)) > (hand[maxI].rank === r.jokerRank ? 0 : cardValue(hand[maxI].rank)) ? i : maxI, 0);
    const dropped = hand.splice(highestIdx, 1)[0];
    r.discardPile = [dropped, ...(r.discardPile || [])];
    if (hand.length === 0) {
      reshuffleIfNeeded(r);
      if (r.drawPile.length > 0) hand.push(r.drawPile.shift());
    } else {
      reshuffleIfNeeded(r);
      if (r.drawPile.length > 0) hand.push(r.drawPile.shift());
    }
    r.hands[myName] = hand;
    r.lastDropRank = dropped.rank;
    r.sevenPenalty = dropped.rank === "7" ? (r.sevenPenalty || 0) + 1 : 0;
    const nextIdx = computeNext(curIdx, 0, aPlayers.length);
    r.currentPlayer = nextIdx;
    r.currentPlayerName = aPlayers[nextIdx]?.name;
    r.turnStartedAt = Date.now();
    const livesLeft = 5 - afkCounts[myName];
    r.log = [`⏱️ ${myName} timed out — auto-dropped ${dropped.rank}${dropped.suit} · ${livesLeft} life${livesLeft !== 1 ? "s" : ""} left`, ...(r.log || []).slice(0, 14)];
    await roomSet(roomId, r);
  };

  // ── Kick player during game (host only) ──
  const kickPlayer = async (playerName) => {
    if (gs.host !== myName) return;
    const r = await roomGet(roomId);
    if (!r) return;
    // Remove from players list
    r.players = r.players.filter(p => p.name !== playerName);
    // Remove their hand
    if (r.hands) delete r.hands[playerName];
    // If it was their turn, advance to next
    const aPlayers = r.players.filter(p => !p.eliminated);
    if (aPlayers.length === 0) return;
    const curName = (r.players[r.currentPlayer] || aPlayers[0]).name;
    if (curName === playerName || r.currentPlayer >= aPlayers.length) {
      r.currentPlayer = r.currentPlayer % Math.max(aPlayers.length, 1);
      r.turnStartedAt = Date.now();
    }
    r.log = [`${playerName} was removed by the host`, ...(r.log || []).slice(0, 14)];
    await roomSet(roomId, r);
  };

  // ── Hit Show ──
  const hitShow = async () => {
    if (myCount > 5) { flash(`Your count is ${myCount}. Need ≤ 5 to Show!`); return; }
    const r = await roomGet(roomId);
    if (!r || r.roundOver) return;
    const myC = handScore(r.hands[myName] || [], r.jokerRank);
    const others = r.players.filter(p => !p.eliminated && p.name !== myName);
    // Wrong show if someone has equal OR less count — EXCEPT when caller's count is 0
    // (0 is the minimum possible, so equal at 0 is not a wrong show)
    const someoneBetter = others.some(p => {
      const theirCount = handScore(r.hands[p.name] || [], r.jokerRank);
      return myC === 0 ? theirCount < myC : theirCount <= myC;
    });
    let newPlayers = r.players.map(p => {
      if (p.eliminated) return p;
      const add = p.name === myName ? (someoneBetter ? 50 : 0) : handScore(r.hands[p.name] || [], r.jokerRank);
      return { ...p, score: p.score + add, lastAdd: add };
    });
    newPlayers = newPlayers.map(p => ({ ...p, eliminated: p.eliminated || p.score >= r.maxScore }));
    const remaining = newPlayers.filter(p => !p.eliminated);
    const gameOver = remaining.length <= 1;

    // ── Host transfer: if current host is eliminated, give host to lowest-score remaining player ──
    const hostEliminated = newPlayers.find(p => p.name === r.host)?.eliminated;
    if (hostEliminated && remaining.length > 0) {
      const newHost = remaining.reduce((a, b) => a.score <= b.score ? a : b);
      r.host = newHost.name;
    }

    r.players = newPlayers;
    r.showCaller = myName;
    r.roundOver = true;
    r.gameOver = gameOver;
    r.winner = gameOver ? (remaining[0]?.name || null) : null;

    // ── Save round scores into roundHistory ──
    const roundScores = {};
    r.players.forEach(p => { roundScores[p.name] = p.lastAdd != null ? p.lastAdd : 0; });
    r.roundHistory = [...(r.roundHistory || []), { round: r.round, scores: roundScores }];

    r.log = [`${myName} hit SHOW with count ${myC}${someoneBetter ? " — +50 penalty (someone had ≤ count)!" : " 🎉"}`, ...(r.log || []).slice(0, 14)];
    await roomSet(roomId, r);
  };

  // ── Next Round — build completely fresh state to clear all flags for all clients ──
  const nextRound = async () => {
    const r = await roomGet(roomId);
    if (!r) return;
    const active = r.players.filter(p => !p.eliminated);
    if (active.length <= 1) return;
    const minCards = active.length * 7 + 10;
    const setsNeeded = Math.max(r.numSets, Math.ceil(minCards / 52));
    let deck = shuffle(buildDeck(setsNeeded));
    const hands = {};
    for (const p of active) hands[p.name] = deck.splice(0, 7);
    let candidates = deck.filter(c => c.rank !== "J" && c.rank !== "7");
    if (candidates.length === 0) candidates = [...deck];
    const jc = candidates[Math.floor(Math.random() * candidates.length)];
    deck.splice(deck.findIndex(c => c.id === jc.id), 1);
    const newRound = (r.round || 1) + 1;

    // ── Circular start: next round starts with the next active player ──
    const prevStartIdx = r.roundStartPlayerIdx || 0;
    const newStartIdx = (prevStartIdx + 1) % active.length;
    const startingPlayer = active[newStartIdx];

    const nextState = {
      code: r.code, host: r.host, maxPlayers: r.maxPlayers,
      numSets: r.numSets, maxScore: r.maxScore, phase: "playing",
      players: r.players.map(p => ({ name: p.name, score: p.score, eliminated: p.eliminated })),
      hands, drawPile: deck, discardPile: [],
      jokerRank: jc.rank, jokerSuit: jc.suit,
      currentPlayer: newStartIdx,
      currentPlayerName: startingPlayer?.name,
      roundStartPlayerIdx: newStartIdx,
      turnStartedAt: Date.now(),
      sevenPenalty: 0, lastDropRank: null,
      round: newRound, showCaller: null,
      roundOver: false, gameOver: false, winner: null,
      roundHistory: r.roundHistory || [],   // carry history forward
      afkCounts: r.afkCounts || {},          // carry AFK counts — whole game, never reset
      log: [`Round ${newRound} started! ${startingPlayer?.name} goes first · Joker: ${jc.rank}${jc.suit} = 0 pts`],
    };
    await roomSet(roomId, nextState);
    // Firebase listener fires setGs for all clients automatically
  };

  // ── Derived UI values ──
  const selectedCards = selected.map(i => myHand[i]).filter(Boolean);
  const selectedRank = selectedCards[0]?.rank;
  const isClashDrop = !!(lastDropRank && selectedRank === lastDropRank && selectedRank !== "7" && selectedRank !== "J");
  const counterValid = penaltyActive && isValidSevenCounter(selectedCards);

  // Drop button label
  const dropLabel = (() => {
    if (!selected.length) return "";
    if (penaltyActive) {
      if (selectedRank === "7") return `FORWARD ${selected.length} SEVEN${selected.length > 1 ? "S" : ""} ⚡`;
      if (selected.length > 2) return `TACKLE WITH ${selected.length} CARDS 🛡️`;
      return "NOT A VALID COUNTER";
    }
    const willDraw = selected.length <= 2 && selectedRank !== "J" && selectedRank !== "7" && !isClashDrop;
    return `DROP ${selected.length} ${selected.length > 1 ? "CARDS" : "CARD"}${willDraw ? " → CHOOSE DRAW" : ""}${isClashDrop ? " ⚡ CLASH" : ""}`;
  })();

  // ── Sort handler ──
  const sortHand = (dir) => {
    const jokerVal = 0;
    const indices = myHand.map((_, i) => i);
    indices.sort((a, b) => {
      const va = myHand[a].rank === jokerRank ? jokerVal : cardValue(myHand[a].rank);
      const vb = myHand[b].rank === jokerRank ? jokerVal : cardValue(myHand[b].rank);
      return dir === "asc" ? va - vb : vb - va;
    });
    setHandOrder(indices);
    setSelected([]); // clear selection on sort
  };

  // Instruction hint
  const hintText = (() => {
    if (!isMyTurn && !pendingDraw) return `Waiting for ${currentPlayerName}…`;
    if (pendingDraw) return "Cards dropped! Now choose: draw from pile OR take from discard.";
    if (penaltyActive) {
      if (!selected.length) return `7-chain active! Select 7s to forward OR 3+ same-rank cards to tackle. Or "Draw ${sevenPenalty * 2}".`;
      if (counterValid) return `Valid counter! Click DROP to play it.`;
      return `Invalid counter — need 7s or 3+ same-rank cards. Select again or Draw.`;
    }
    if (lastDropRank && !selected.length) return `⚡ Clash available! Drop ${lastDropRank}s to skip drawing.`;
    if (!selected.length) return "Your turn! Select cards to drop. If draw needed, you'll choose draw pile or discard.";
    return `Dropping: ${selectedCards.map(c => c.rank + c.suit).join(", ")}${isClashDrop ? " (CLASH — no draw!)" : ""}`;
  })();

  // ── Round/Game over ──
  if (gs.roundOver || gs.gameOver) {
    return <RoundOver gs={gs} myName={myName} jokerRank={jokerRank} onNextRound={nextRound} isHost={gs.host === myName} />;
  }

  return (
    <div className="game-wrap">
      {/* Top bar */}
      <div className="top-bar">
        <div className="tb-left">
          <span className="tb-room">#{roomId}</span>
          <span className="tb-round">Round {gs.round || 1}</span>
        </div>
        <div className="tb-center">
          <div className="joker-info">JOKER: <b>{gs.jokerRank}{gs.jokerSuit}</b> = 0</div>
          <div className={`tb-cur-player ${isMyTurn ? "tb-cur-me" : ""}`}>▶ {isMyTurn ? "Your Turn" : `${currentPlayerName}'s Turn`}</div>
        </div>
        <div className="tb-timer">
          <span className={`timer-ring ${timeLeft <= 10 ? "timer-urgent" : timeLeft <= 20 ? "timer-warn" : ""}`}>
            {isMyTurn && !gs.roundOver ? `⏱ ${timeLeft}s` : ""}
          </span>
        </div>
        <div className="tb-right">
          <span className="tb-score">My Score: <b>{myScore}</b></span>
          <button className="scores-icon-btn" onClick={() => setShowScoreBoard(true)} title="Round Scores">📊</button>
        </div>
      </div>

      {/* Opponents — 2-column grid on mobile, horizontal scroll on desktop */}
      <div className="others-row">
        {activePlayers.filter(p => p.name !== myName).map((p, i) => {
          const isCurrent = p.name === currentPlayerName;
          const oppHand = gs.hands?.[p.name] || [];
          const isHostMe = gs.host === myName;
          return (
            <div key={i} className={`opp-chip ${isCurrent ? "opp-chip-active" : ""} ${p.eliminated ? "opp-chip-elim" : ""}`}>
              {isCurrent && !gs.roundOver && (
                <TimerBorder pct={(timeLeft / 60) * 100} borderR={10} sw={3} />
              )}
              <div className="opp-chip-top">
                <span className="opp-chip-name">{isCurrent ? "▶ " : ""}{p.name}</span>
                {isHostMe && !p.eliminated && (
                  <button className="kick-game-btn" onClick={() => kickPlayer(p.name)} title={`Remove ${p.name}`}>✕</button>
                )}
              </div>
              <div className="opp-chip-stats">
                <span className="opp-chip-cards">🃏 {oppHand.length}</span>
                <span className="opp-chip-score">{p.score} pts</span>
                {(() => { const afkL = 5 - (gs.afkCounts?.[p.name] || 0); return <span className={`afk-badge ${afkL <= 1 ? "afk-danger" : afkL <= 2 ? "afk-warn" : ""}`}>❤️{afkL}</span>; })()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Table */}
      <div className="table-center">
        {/* Current player indicator — above the pile box */}
        {!gs.roundOver && (
          <div className="current-turn-banner">
            <span className={`ctb-name ${isMyTurn ? "ctb-me" : "ctb-other"}`}>
              {isMyTurn ? "Your Turn!" : `${currentPlayerName}'s Turn`}
            </span>
          </div>
        )}
        <div className="felt-surface">
          {/* Joker card */}
          <div className="felt-group">
            <div className="felt-label">JOKER (0 pts)</div>
            <div className="card card-sm" style={{background:"#fffef9",border:"2px solid gold",position:"relative"}}>
              <span className="corner tl" style={{color:isRed(gs.jokerSuit)?"#c0392b":"#1a1a1a"}}><b>{gs.jokerRank}</b><span>{gs.jokerSuit}</span></span>
              <span className="mid-suit" style={{color:isRed(gs.jokerSuit)?"#c0392b":"#1a1a1a",opacity:0.15}}>{gs.jokerSuit}</span>
              <span className="corner br" style={{color:isRed(gs.jokerSuit)?"#c0392b":"#1a1a1a"}}><b>{gs.jokerRank}</b><span>{gs.jokerSuit}</span></span>
              <span style={{position:"absolute",top:-8,right:-8,background:"gold",borderRadius:"50%",width:18,height:18,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:"#082e1a",fontWeight:700}}>★</span>
            </div>
          </div>
          {/* Draw pile — clickable when player needs to draw after dropping */}
          <div className="felt-group">
            <div className="felt-label">DRAW ({gs.drawPile?.length || 0})</div>
            <div
              className={`card card-sm back ${pendingDraw ? "draw-pick tap" : ""}`}
              onClick={pendingDraw ? drawFromPile : undefined}
              title={pendingDraw ? "Draw from pile" : ""}
            >
              <div className="back-pat" />
            </div>
          </div>
          {/* Discard pile — shows top card; during pendingDraw highlights previous player's card */}
          <div className="felt-group">
            <div className="felt-label">
              DISCARD {isMyTurn && lastDropRank && !penaltyActive && !pendingDraw ? <span className="clash-badge">⚡ CLASH</span> : ""}
            </div>
            {gs.discardPile?.length > 0 ? (() => {
              const topCard = gs.discardPile[0]; // most recently dropped card
              const prevIdx = gs._droppedCount || 1; // index of the previous player's card
              const prevCard = pendingDraw ? gs.discardPile[prevIdx] : null;
              const canDrawFromDiscard = pendingDraw && prevCard && prevCard.rank !== "J" && prevCard.rank !== "7";
              return (
                <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                  <div className={`card card-sm ${isRed(topCard.suit) ? "red" : "blk"} ${isMyTurn && lastDropRank && !penaltyActive && !pendingDraw ? "clash-glow" : ""}`}>
                    <span className="corner tl"><b>{topCard.rank}</b><span>{topCard.suit}</span></span>
                    <span className="mid-suit">{topCard.suit}</span>
                    <span className="corner br"><b>{topCard.rank}</b><span>{topCard.suit}</span></span>
                  </div>
                  {pendingDraw && prevCard && (
                    <div
                      className={`card card-sm ${isRed(prevCard.suit) ? "red" : "blk"} ${canDrawFromDiscard ? "discard-pick tap" : ""}`}
                      style={{marginTop:-30,boxShadow:canDrawFromDiscard?"0 0 0 2px #3498db":"none"}}
                      onClick={canDrawFromDiscard ? drawFromDiscard : undefined}
                      title={canDrawFromDiscard ? `Take ${prevCard.rank}${prevCard.suit}` : ""}
                    >
                      <span className="corner tl"><b>{prevCard.rank}</b><span>{prevCard.suit}</span></span>
                      <span className="mid-suit">{prevCard.suit}</span>
                      <span className="corner br"><b>{prevCard.rank}</b><span>{prevCard.suit}</span></span>
                    </div>
                  )}
                  {pendingDraw && prevCard && (prevCard.rank === "J" || prevCard.rank === "7") && (
                    <span style={{fontSize:9,color:"rgba(231,76,60,0.8)",marginTop:2}}>Can't take J/7</span>
                  )}
                </div>
              );
            })() : <div className="empty-pile">Empty</div>}
          </div>
        </div>


        {/* Draw choice banner — shown after dropping when draw is needed */}
        {pendingDraw && (() => {
          // Previous player's card is at [_droppedCount] — after current player's dropped cards
          const prevIdx = gs._droppedCount || 1;
          const prevCard = gs.discardPile?.[prevIdx];
          const canTakePrev = prevCard && prevCard.rank !== "J" && prevCard.rank !== "7";
          return (
            <div className="draw-choice-banner">
              🃏 Choose where to draw from:
              <button className="dcb-btn pile-btn" onClick={drawFromPile}>
                Draw Pile ({gs.drawPile?.length || 0})
              </button>
              {canTakePrev && (
                <button className="dcb-btn discard-btn" onClick={drawFromDiscard}>
                  Take {prevCard.rank}{prevCard.suit} from Discard
                </button>
              )}
            </div>
          );
        })()}

        {/* 7-chain banner */}
        {sevenPenalty > 0 && (
          <div className="penalty-banner">
            ⚠️ 7-Chain! {isMyTurn
              ? `Drop 7s to forward · Drop 3+ same-rank cards to tackle · or "Draw ${sevenPenalty * 2}"`
              : `${currentPlayerName} must counter or draw ${sevenPenalty * 2} cards`}
          </div>
        )}

        {/* Log */}
        <div className="log-box">
          {(gs.log || []).slice(0, 4).map((l, i) => (
            <div key={i} className="log-line" style={{opacity: 1 - i * 0.22}}>{l}</div>
          ))}
        </div>
      </div>

      {/* My hand */}
      <div className={`my-area ${isEliminated ? "elim" : ""} ${isMyTurn && !gs.roundOver ? (timeLeft <= 10 ? "my-area-urgent" : timeLeft <= 20 ? "my-area-warn" : "my-area-active") : ""}`}>
        {isEliminated ? (
          <div className="elim-msg">You've been eliminated. Spectating…</div>
        ) : (
          <>
            <div className="my-header">
              <div className="my-info">
                <span className="my-name">{myName}</span>
                <span className={`my-count ${myCount <= 5 ? "low-count" : ""}`}>Count: {myCount}</span>
                {(() => { const myLives = 5 - (gs.afkCounts?.[myName] || 0); return <span className={`afk-badge ${myLives <= 1 ? "afk-danger" : myLives <= 2 ? "afk-warn" : ""}`}>❤️{myLives}</span>; })()}
              </div>
              <div className="my-actions">
                {/* Penalty button — always shown when 7-chain active and it's your turn */}
                {isMyTurn && penaltyActive && (
                  <button className="act-btn penalty-btn" onClick={takePenalty}>
                    Draw {sevenPenalty * 2} Cards
                  </button>
                )}
                {/* Drop button — shown when cards selected on your turn.
                    During penalty, button is disabled if selection is not a valid counter. */}
                {isMyTurn && selected.length > 0 && (
                  <button
                    className={`act-btn ${
                      penaltyActive
                        ? counterValid ? "counter-btn" : "invalid-btn"
                        : "drop-btn"
                    }`}
                    onClick={doAction}
                    disabled={penaltyActive && !counterValid}
                  >
                    {dropLabel}
                  </button>
                )}
                {/* Show button — only on your turn, count ≤5, not during pending draw, not during 7-chain */}
                {isMyTurn && myCount <= 5 && !gs.roundOver
                  && !pendingDraw && gs._awaitingDraw !== myName
                  && lastDropRank !== "7" && !penaltyActive && (
                  <button className="act-btn show-btn" onClick={hitShow}>HIT SHOW 🎯</button>
                )}
              </div>
            </div>

            <div className="wait-turn-row">
              <span className="wait-turn">{hintText}</span>
              {/* Sort buttons */}
              {!pendingDraw && (
                <span className="sort-btns">
                  <button className="sort-btn" onClick={() => sortHand("asc")} title="Sort low to high">↑</button>
                  <button className="sort-btn" onClick={() => sortHand("desc")} title="Sort high to low">↓</button>
                </span>
              )}
            </div>

            <div className={`hand-row ${pendingDraw ? "hand-locked" : ""}`}>
              {orderedHand.map((card, displayIdx) => {
                const canClash = !pendingDraw && isMyTurn && !penaltyActive && lastDropRank
                  && card.rank === lastDropRank && card.rank !== "7" && card.rank !== "J";
                const canCounter = !pendingDraw && isMyTurn && penaltyActive && card.rank === "7";
                return (
                  <div
                    key={card.id}
                    className={`card-wrap ${canClash ? "clash-highlight" : ""} ${canCounter ? "counter-highlight" : ""}`}
                  >
                    <CardFace
                      card={card}
                      selected={selected.includes(displayIdx)}
                      onClick={isMyTurn && !pendingDraw ? () => toggleSelect(displayIdx) : undefined}
                      isJoker={card.rank === jokerRank}
                    />
                    {canClash && <span className="card-tip clash-tip">⚡</span>}
                    {canCounter && <span className="card-tip counter-tip">🛡</span>}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Scores strip — compact score view, no names or lives (shown at top) */}
      <div className="scores-strip">
        {(gs.players || []).map((p, i) => {
          const isCur = p.name === currentPlayerName;
          const isMe = p.name === myName;
          return (
            <div key={i} style={{position:"relative"}} className={`score-chip ${p.eliminated ? "elim-chip" : ""} ${isCur ? "active-chip" : ""}`}>
              {isCur && isMe && !gs.roundOver && (
                <TimerBorder pct={(timeLeft / 60) * 100} borderR={14} sw={3} />
              )}
              <span className="sc-label">{isMe ? "Me" : p.name.slice(0,4)}</span>
              <span className="sc">{p.score}</span>
            </div>
          );
        })}
      </div>

      {flashMsg && <div className="flash-msg">{flashMsg}</div>}

      {/* ── Scoreboard Modal ── */}
      {showScoreBoard && (() => {
        const history = gs.roundHistory || [];
        const allPlayers = gs.players || [];
        const totalRounds = history.length;
        return (
          <div className="sb-overlay" onClick={() => setShowScoreBoard(false)}>
            <div className="sb-modal" onClick={e => e.stopPropagation()}>
              <div className="sb-header">
                <span className="sb-title">📊 Round Scores</span>
                <button className="sb-close" onClick={() => setShowScoreBoard(false)}>✕</button>
              </div>
              {totalRounds === 0 ? (
                <div className="sb-empty">No rounds completed yet</div>
              ) : (
                <div className="sb-scroll">
                  <table className="sb-table">
                    <thead>
                      <tr>
                        <th className="sb-th-round">Round</th>
                        {allPlayers.map(p => (
                          <th key={p.name} className={p.eliminated ? "sb-th-elim" : ""}>{p.name}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((row, i) => (
                        <tr key={i} className={i % 2 === 0 ? "sb-row-even" : ""}>
                          <td className="sb-td-round">R{row.round}</td>
                          {allPlayers.map(p => {
                            const val = row.scores?.[p.name];
                            return (
                              <td key={p.name} className={val === 50 ? "sb-penalty" : val === 0 ? "sb-zero" : ""}>
                                {val != null ? (val > 0 ? `+${val}` : "0") : "—"}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                      {/* Total row */}
                      <tr className="sb-total-row">
                        <td className="sb-td-round">Total</td>
                        {allPlayers.map(p => (
                          <td key={p.name} className={p.eliminated ? "sb-td-elim" : "sb-td-total"}>
                            {p.score}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ─── Round Over ───────────────────────────────────────────────────────────────
function RoundOver({ gs, myName, jokerRank, onNextRound, isHost }) {
  const active = (gs.players || []).filter(p => !p.eliminated);
  const [countdown, setCountdown] = useState(10);
  const [started, setStarted] = useState(false);

  // Auto-start next round countdown (only host triggers the actual call to avoid duplicates)
  useEffect(() => {
    if (gs.gameOver) return; // no countdown on game over
    setCountdown(10);
    setStarted(false);
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [gs.round, gs.gameOver]);

  // When countdown hits 0, host fires nextRound once
  useEffect(() => {
    if (gs.gameOver) return;
    if (countdown === 0 && isHost && !started) {
      setStarted(true);
      onNextRound();
    }
  }, [countdown, isHost, started, gs.gameOver, onNextRound]);

  return (
    <div className="round-over-screen">
      <div className="ro-card">
        {gs.gameOver ? (
          <>
            <div className="ro-title winner-title">🏆 GAME OVER</div>
            <div className="ro-winner">{gs.winner} WINS!</div>
          </>
        ) : (
          <>
            <div className="ro-title">{gs.showCaller} hit SHOW!</div>
            <div className="ro-sub">Round {gs.round} Results</div>
          </>
        )}
        <table className="ro-table">
          <thead>
            <tr><th>Player</th><th>Hand</th><th>Count</th><th>Added</th><th>Total</th><th>Status</th></tr>
          </thead>
          <tbody>
            {(gs.players || []).map((p, i) => {
              const hand = gs.hands?.[p.name] || [];
              const count = handScore(hand, jokerRank);
              return (
                <tr key={i} className={p.eliminated ? "elim-row" : p.name === gs.showCaller ? "show-row" : ""}>
                  <td>{p.name}{p.name === myName ? " (you)" : ""}</td>
                  <td className="hand-preview">{hand.map(c => `${c.rank}${c.suit}`).join(" ")}</td>
                  <td>{count}</td>
                  <td className={p.lastAdd === 50 ? "penalty-add" : ""}>{p.lastAdd != null ? (p.lastAdd > 0 ? `+${p.lastAdd}` : "+0") : "—"}</td>
                  <td><b>{p.score}</b></td>
                  <td>{p.eliminated ? "❌ OUT" : "✅"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!gs.gameOver && (
          <>
            <div className="elim-note">
              Eliminated at {gs.maxScore} pts · Remaining: {active.map(p => p.name).join(", ")}
              <span style={{marginLeft:8,color:"var(--gold)",fontSize:11}}>HOST: {gs.host}</span>
            </div>
            <div className="next-round-countdown">
              <div className="nrc-timer">{countdown}</div>
              <div className="nrc-label">Next round starting…</div>
              {isHost && (
                <button className="cta" style={{marginTop:8,padding:"10px 0",fontSize:13}} onClick={() => { setStarted(true); onNextRound(); }}>
                  Start Now ▶
                </button>
              )}
            </div>
          </>
        )}
        {gs.gameOver && <button className="cta" onClick={() => window.location.reload()}>PLAY AGAIN</button>}
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [phase, setPhase] = useState("lobby");
  const [roomId, setRoomId] = useState(null);
  const [myName, setMyName] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [gameState, setGameState] = useState(null);
  const [showExitModal, setShowExitModal] = useState(false);

  const handleJoin = (code, name, host) => { setRoomId(code); setMyName(name); setIsHost(host); setPhase("waiting"); };
  const handleGameStart = (gs) => { setGameState(gs); setPhase("game"); };

  const inActiveSession = phase === "waiting" || phase === "game";

  // Helper: remove this player from the Firebase room and advance turn if needed
  const removePlayerFromRoom = async () => {
    if (!roomId || !myName) return;
    try {
      const r = await roomGet(roomId);
      if (!r || r.phase === "lobby") {
        // In lobby/waiting — just remove from players list
        r.players = (r.players || []).filter(p => p.name !== myName);
        if (r.players.length === 0) { await roomDelete(roomId); return; }
        // Transfer host if needed
        if (r.host === myName && r.players.length > 0) r.host = r.players[0].name;
        await roomSet(roomId, r);
        return;
      }
      // In game — remove and advance turn
      const wasCurrentPlayer = r.currentPlayerName === myName;
      r.players = (r.players || []).filter(p => p.name !== myName);
      if (r.hands) delete r.hands[myName];
      const aPlayers = r.players.filter(p => !p.eliminated);
      if (aPlayers.length <= 1) {
        // Only one left — they win
        r.roundOver = true;
        r.gameOver = true;
        r.winner = aPlayers[0]?.name || null;
      } else if (wasCurrentPlayer) {
        const newIdx = (r.currentPlayer || 0) % aPlayers.length;
        r.currentPlayer = newIdx;
        r.currentPlayerName = aPlayers[newIdx]?.name;
        r.turnStartedAt = Date.now();
      }
      // Transfer host if needed
      if (r.host === myName) {
        const remaining = r.players.filter(p => !p.eliminated);
        if (remaining.length > 0) {
          const newHost = remaining.reduce((a, b) => a.score <= b.score ? a : b);
          r.host = newHost.name;
        }
      }
      r.log = [`${myName} left the game`, ...(r.log || []).slice(0, 14)];
      await roomSet(roomId, r);
    } catch (e) { console.error('removePlayerFromRoom error', e); }
  };

  // ── Browser refresh / tab close — remove player then allow unload ──
  useEffect(() => {
    if (!inActiveSession) return;
    const onBeforeUnload = (e) => {
      // Fire-and-forget removal (synchronous XHR or sendBeacon not available for Realtime DB,
      // so we use the async call; it usually completes before tab closes)
      removePlayerFromRoom();
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inActiveSession, roomId, myName]);

  // ── Browser back button — show modal; on confirm remove player ──
  useEffect(() => {
    if (!inActiveSession) return;
    window.history.pushState({ lowcard: true }, "");
    const onPopState = () => {
      window.history.pushState({ lowcard: true }, "");
      setShowExitModal(true);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [inActiveSession]);

  const confirmExit = async () => {
    setShowExitModal(false);
    await removePlayerFromRoom();
    window.location.reload();
  };

  const cancelExit = () => {
    setShowExitModal(false);
  };

  return (
    <>
      <style>{CSS}</style>
      {phase === "lobby"   && <Lobby onJoin={handleJoin} />}
      {phase === "waiting" && <WaitingRoom roomId={roomId} myName={myName} isHost={isHost} onGameStart={handleGameStart} />}
      {phase === "game"    && <GameScreen roomId={roomId} myName={myName} initialState={gameState} />}

      {/* ── Exit Warning Modal ── */}
      {showExitModal && (
        <div className="exit-overlay">
          <div className="exit-modal">
            <div className="exit-icon">⚠️</div>
            <h2 className="exit-title">Leave the game?</h2>
            <p className="exit-body">
              {phase === "game"
                ? "You are in an active game. If you leave, your cards will remain but you won't be able to rejoin this session."
                : "You are in a room waiting for the game to start. Leaving will remove you from the room."}
            </p>
            <div className="exit-actions">
              <button className="exit-cancel" onClick={cancelExit}>Stay in Game</button>
              <button className="exit-confirm" onClick={confirmExit}>Leave Anyway</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=Nunito:wght@300;400;600;700&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
:root{--bg:#080f0d;--felt:#0c3d22;--gold:#d4a843;--gold2:#f0c96a;--cream:#f0ebe0;--red:#c0392b;--blk:#1a1a1a;--border:rgba(212,168,67,0.25);}
html,body{font-family:'Nunito',sans-serif;background:var(--bg);color:var(--cream);min-height:100vh;overflow-x:hidden;-webkit-text-size-adjust:100%;}

/* ── Lobby ── */
.lobby{min-height:100vh;display:flex;align-items:center;justify-content:center;background:radial-gradient(ellipse at 50% -10%,#1a5c35,#080f0d 65%);padding:16px;}
.lobby-card{background:rgba(8,20,12,0.97);border:1px solid var(--border);border-radius:20px;padding:28px 20px;width:100%;max-width:480px;box-shadow:0 24px 60px rgba(0,0,0,0.7);}
.brand{font-family:'Cinzel',serif;font-size:28px;color:var(--gold);letter-spacing:4px;text-align:center;margin-bottom:4px;}
.brand span{background:linear-gradient(135deg,var(--gold),var(--gold2));-webkit-background-clip:text;-webkit-text-fill-color:transparent;}
.brand-sub{text-align:center;font-size:11px;letter-spacing:2px;color:rgba(240,235,224,0.4);text-transform:uppercase;margin-bottom:20px;}
.tab-row{display:flex;background:rgba(255,255,255,0.04);border-radius:10px;padding:3px;margin-bottom:18px;border:1px solid rgba(255,255,255,0.07);}
.tab{flex:1;padding:9px;border:none;background:transparent;color:rgba(240,235,224,0.5);font-family:'Nunito',sans-serif;font-size:12px;letter-spacing:1px;text-transform:uppercase;cursor:pointer;border-radius:8px;transition:all 0.2s;}
.tab.on{background:var(--gold);color:#080f0d;font-weight:700;}
.field{margin-bottom:14px;}
.field-row{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
.field label{display:block;font-size:10px;letter-spacing:2px;color:var(--gold);text-transform:uppercase;margin-bottom:6px;}
.field input{width:100%;background:rgba(255,255,255,0.05);border:1px solid rgba(212,168,67,0.2);border-radius:10px;padding:11px 12px;color:var(--cream);font-size:15px;font-family:'Nunito',sans-serif;outline:none;transition:border-color 0.15s;}
.field input:focus{border-color:var(--gold);}
.code-input{text-transform:uppercase!important;letter-spacing:6px;font-size:20px;text-align:center;font-weight:700;}
.mini-btns{display:flex;flex-wrap:wrap;gap:5px;}
.nb{width:34px;height:34px;border-radius:7px;border:1px solid rgba(212,168,67,0.2);background:rgba(255,255,255,0.04);color:var(--cream);font-size:12px;cursor:pointer;font-family:'Nunito',sans-serif;transition:all 0.15s;}
.nb:hover{border-color:var(--gold);}
.nb.on{background:var(--gold);color:#080f0d;font-weight:700;border-color:var(--gold);}
.score-slider-row{display:flex;align-items:center;gap:12px;}
.slider{flex:1;-webkit-appearance:none;height:4px;border-radius:2px;background:rgba(212,168,67,0.2);outline:none;}
.slider::-webkit-slider-thumb{-webkit-appearance:none;width:20px;height:20px;border-radius:50%;background:var(--gold);cursor:pointer;}
.slider-val{font-size:18px;font-weight:700;color:var(--gold);min-width:44px;text-align:right;}
.cta{width:100%;padding:14px;margin-top:8px;background:linear-gradient(135deg,var(--gold),#a07830);border:none;border-radius:12px;color:#080f0d;font-size:15px;font-weight:700;letter-spacing:2px;cursor:pointer;font-family:'Nunito',sans-serif;transition:all 0.2s;text-transform:uppercase;}
.cta:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(212,168,67,0.35);}
.cta:active{transform:translateY(0);}
.cta:disabled{opacity:0.5;cursor:not-allowed;transform:none;}
.err{color:#e74c3c;font-size:13px;margin-bottom:8px;text-align:center;}
.lobby-hint{text-align:center;font-size:11px;color:rgba(240,235,224,0.3);margin-top:12px;}

/* ── Waiting Room ── */
.room-code-display{text-align:center;background:rgba(212,168,67,0.08);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:16px;}
.rc-label{display:block;font-size:10px;letter-spacing:2px;color:rgba(240,235,224,0.4);text-transform:uppercase;}
.rc-val{display:block;font-family:'Cinzel',serif;font-size:36px;color:var(--gold);letter-spacing:8px;margin:4px 0;}
.rc-hint{font-size:11px;color:rgba(240,235,224,0.4);}
.player-list{margin-bottom:14px;}
.pl-head{font-size:10px;letter-spacing:2px;color:var(--gold);text-transform:uppercase;margin-bottom:8px;}
.pl-item{display:flex;align-items:center;gap:8px;padding:9px 12px;background:rgba(255,255,255,0.04);border-radius:8px;margin-bottom:5px;font-size:13px;}
.pl-item.host{background:rgba(212,168,67,0.08);border:1px solid rgba(212,168,67,0.2);}
.host-badge,.you-badge{margin-left:auto;font-size:9px;padding:2px 7px;border-radius:10px;font-weight:700;letter-spacing:1px;}
.host-badge{background:var(--gold);color:#080f0d;}
.you-badge{background:rgba(255,255,255,0.1);color:var(--cream);}
.kick-btn{margin-left:auto;background:rgba(231,76,60,0.15);border:1px solid rgba(231,76,60,0.3);color:#e74c3c;border-radius:6px;padding:2px 8px;font-size:11px;cursor:pointer;font-family:'Nunito',sans-serif;font-weight:700;}
.kick-btn:hover{background:rgba(231,76,60,0.3);}
.room-meta{font-size:12px;color:rgba(240,235,224,0.4);text-align:center;margin-bottom:14px;}
.wait-hint{text-align:center;font-size:12px;color:rgba(240,235,224,0.4);margin-top:10px;}

/* ── Cards ── */
.card{background:#fffef9;border:1px solid #d4c5a9;border-radius:7px;position:relative;flex-shrink:0;user-select:none;transition:transform 0.15s,box-shadow 0.15s;}
.card-md{width:62px;height:88px;}
.card-sm{width:48px;height:68px;}
.card-xs{width:28px;height:40px;}
.card.tap{cursor:pointer;}
.card.tap:active{transform:translateY(-4px);}
.card.tap:hover{transform:translateY(-6px);box-shadow:0 10px 22px rgba(0,0,0,0.5);}
.card.sel{transform:translateY(-14px);box-shadow:0 16px 30px rgba(212,168,67,0.5),0 0 0 2px var(--gold);}
.card.joker-glow{box-shadow:0 0 0 2px gold,0 4px 16px rgba(255,215,0,0.4);}
.card.clash-glow{box-shadow:0 0 0 2px #e67e22,0 4px 16px rgba(230,126,34,0.4);}
.red .corner,.red .mid-suit{color:var(--red)!important;}
.blk .corner,.blk .mid-suit{color:var(--blk)!important;}
.corner{position:absolute;display:flex;flex-direction:column;align-items:center;line-height:1.1;}
.corner b{font-size:12px;font-weight:800;}
.corner span{font-size:9px;}
.card-sm .corner b{font-size:10px;}
.card-sm .corner span{font-size:8px;}
.card-xs .corner{display:none;}
.tl{top:3px;left:3px;}
.br{bottom:3px;right:3px;transform:rotate(180deg);}
.mid-suit{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:18px;opacity:0.13;}
.card-sm .mid-suit{font-size:14px;}
.joker-star{position:absolute;top:-7px;right:-7px;background:gold;border-radius:50%;width:15px;height:15px;display:flex;align-items:center;justify-content:center;font-size:8px;color:#080f0d;font-weight:700;}
.back{cursor:default;}
.back-pat{position:absolute;inset:4px;border-radius:4px;background:repeating-linear-gradient(45deg,#0e4a29 0,#0e4a29 4px,#0c3d22 4px,#0c3d22 8px);opacity:0.9;}
.card-wrap{position:relative;display:inline-flex;flex-direction:column;align-items:center;flex-shrink:0;}
.clash-highlight .card{animation:clash-pulse 1.2s infinite;}
@keyframes clash-pulse{0%,100%{box-shadow:0 0 0 2px #e67e22,0 3px 10px rgba(230,126,34,0.3);}50%{box-shadow:0 0 0 3px #e67e22,0 5px 18px rgba(230,126,34,0.6);}}
.counter-highlight .card{animation:counter-pulse 1.2s infinite;}
@keyframes counter-pulse{0%,100%{box-shadow:0 0 0 2px #3498db,0 3px 10px rgba(52,152,219,0.3);}50%{box-shadow:0 0 0 3px #3498db,0 5px 18px rgba(52,152,219,0.6);}}
.card-tip{font-size:10px;margin-top:2px;font-weight:700;text-align:center;}
.clash-tip{color:#e67e22;}
.counter-tip{color:#3498db;}
.clash-badge{font-size:9px;background:#e67e22;color:#fff;border-radius:6px;padding:1px 5px;margin-left:3px;font-weight:700;vertical-align:middle;}

/* ── Game layout — mobile-first ── */
.game-wrap{min-height:100vh;min-height:-webkit-fill-available;display:flex;flex-direction:column;background:radial-gradient(ellipse at 50% 20%,#0e4a29,#080f0d 75%);}

/* Top bar — compact */
.top-bar{display:flex;align-items:center;gap:6px;padding:7px 10px;background:rgba(0,0,0,0.45);border-bottom:1px solid var(--border);flex-wrap:nowrap;overflow:hidden;}
.tb-left{display:flex;align-items:center;gap:6px;flex-shrink:0;}
.tb-room{font-size:10px;letter-spacing:1px;color:rgba(240,235,224,0.4);font-weight:700;}
.tb-round{font-size:11px;color:var(--gold);font-weight:700;}
.tb-center{flex:1;text-align:center;display:flex;flex-direction:column;align-items:center;gap:1px;}
.joker-info{font-size:11px;color:rgba(240,235,224,0.7);}
.joker-info b{color:gold;}
.tb-timer{flex-shrink:0;}
.timer-ring{font-size:12px;font-weight:700;color:var(--gold);padding:2px 7px;border-radius:12px;background:rgba(212,168,67,0.1);}
.timer-warn{color:#e67e22;background:rgba(230,126,34,0.15);}
.timer-urgent{color:#e74c3c;background:rgba(231,76,60,0.15);animation:blink 0.6s infinite;}
@keyframes blink{0%,100%{opacity:1;}50%{opacity:0.4;}}
.tb-right{flex-shrink:0;}
.tb-score{font-size:11px;}
.tb-score b{color:var(--gold);}
.tb-cur-player{font-size:10px;color:rgba(240,235,224,0.55);font-weight:600;letter-spacing:0.5px;}
.tb-cur-me{color:#2ecc71!important;}
.sc-label{font-size:9px;color:rgba(240,235,224,0.5);}

/* Opponents — horizontal scroll strip of chips */
.others-row{display:flex;gap:6px;padding:6px 10px;overflow-x:auto;border-bottom:1px solid rgba(255,255,255,0.05);background:rgba(0,0,0,0.2);-webkit-overflow-scrolling:touch;}
.others-row::-webkit-scrollbar{display:none;}
.opp-chip{background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:6px 10px;min-width:94px;flex-shrink:0;position:relative;overflow:visible;}
.opp-chip-active{background:rgba(212,168,67,0.08);border-color:transparent;}
.opp-chip-elim{opacity:0.3;text-decoration:line-through;}
.opp-chip-top{display:flex;align-items:center;justify-content:space-between;gap:4px;margin-bottom:4px;}
.opp-chip-name{font-size:11px;font-weight:700;color:var(--cream);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:68px;}
.kick-game-btn{background:rgba(231,76,60,0.15);border:1px solid rgba(231,76,60,0.3);color:#e74c3c;border-radius:5px;width:18px;height:18px;display:flex;align-items:center;justify-content:center;font-size:10px;cursor:pointer;flex-shrink:0;line-height:1;}
.kick-game-btn:hover{background:rgba(231,76,60,0.35);}
.opp-chip-stats{display:flex;gap:6px;align-items:center;}
.opp-chip-cards{font-size:11px;color:rgba(240,235,224,0.7);}
.opp-chip-score{font-size:11px;color:var(--gold);font-weight:700;margin-left:auto;}
.afk-badge{font-size:9px;font-weight:700;margin-left:2px;}
.afk-warn{color:#e67e22!important;}
.afk-danger{color:#e74c3c!important;animation:blink 0.8s infinite;}

/* Table / felt — smaller on mobile */
.table-center{display:flex;flex-direction:column;align-items:center;padding:8px 10px;}
.felt-surface{background:radial-gradient(ellipse,#1a6b3a,#0c3d22);border-radius:14px;border:2px solid rgba(212,168,67,0.2);padding:12px 16px;display:flex;gap:16px;align-items:center;justify-content:center;flex-wrap:nowrap;box-shadow:inset 0 2px 14px rgba(0,0,0,0.4);width:100%;max-width:400px;}
.felt-group{display:flex;flex-direction:column;align-items:center;gap:4px;flex:1;max-width:80px;}
.felt-label{font-size:9px;letter-spacing:1px;color:rgba(240,235,224,0.5);text-transform:uppercase;text-align:center;}
.empty-pile{width:48px;height:68px;border:2px dashed rgba(240,235,224,0.15);border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:9px;color:rgba(240,235,224,0.3);}

/* Banners */
.draw-choice-banner{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:center;background:rgba(46,204,113,0.12);border:1px solid rgba(46,204,113,0.35);border-radius:10px;padding:8px 12px;font-size:12px;color:#2ecc71;margin-top:8px;width:100%;max-width:400px;}
.dcb-btn{border:none;border-radius:7px;font-family:'Nunito',sans-serif;font-size:12px;font-weight:700;padding:7px 12px;cursor:pointer;transition:all 0.15s;}
.pile-btn{background:rgba(255,255,255,0.13);color:var(--cream);}
.pile-btn:hover{background:rgba(255,255,255,0.22);}
.discard-btn{background:rgba(52,152,219,0.85);color:#fff;}
.discard-btn:hover{background:rgba(52,152,219,1);}
.penalty-banner{background:rgba(231,76,60,0.12);border:1px solid rgba(231,76,60,0.35);border-radius:10px;padding:8px 12px;font-size:12px;color:#e74c3c;margin-top:8px;text-align:center;width:100%;max-width:400px;}
.log-box{margin-top:6px;width:100%;max-width:400px;}
.log-line{font-size:10px;color:rgba(240,235,224,0.55);padding:1px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}

/* Draw/discard animations */
.draw-pick{box-shadow:0 0 0 2px #2ecc71,0 3px 14px rgba(46,204,113,0.4);animation:draw-pulse 1s infinite;}
@keyframes draw-pulse{0%,100%{box-shadow:0 0 0 2px #2ecc71,0 3px 10px rgba(46,204,113,0.3);}50%{box-shadow:0 0 0 4px #2ecc71,0 5px 18px rgba(46,204,113,0.6);}}
.discard-pick{box-shadow:0 0 0 2px #3498db,0 3px 14px rgba(52,152,219,0.4);animation:discard-pulse 1s infinite;}
@keyframes discard-pulse{0%,100%{box-shadow:0 0 0 2px #3498db,0 3px 10px rgba(52,152,219,0.3);}50%{box-shadow:0 0 0 4px #3498db,0 5px 18px rgba(52,152,219,0.6);}}

/* My hand area */
.my-area{background:rgba(0,0,0,0.45);border-top:2px solid rgba(212,168,67,0.2);padding:10px 10px 16px;flex:1;display:flex;flex-direction:column;transition:border-color 0.5s;}
.my-area-active{border-top-color:#2ecc71;}
.my-area-warn{border-top-color:#e67e22;}
.my-area-urgent{border-top-color:#e74c3c;animation:top-border-pulse 0.6s infinite;}
@keyframes top-border-pulse{0%,100%{border-top-color:#e74c3c;}50%{border-top-color:rgba(231,76,60,0.3);}}
.my-area.elim{opacity:0.5;}
.elim-msg{text-align:center;color:rgba(240,235,224,0.4);font-size:13px;padding:16px;}
.my-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;flex-wrap:wrap;gap:6px;}
.my-info{display:flex;align-items:center;gap:8px;}
.my-name{font-size:14px;font-weight:700;}
.my-count{background:rgba(255,255,255,0.08);border-radius:20px;padding:3px 12px;font-size:12px;font-weight:600;}
.low-count{background:rgba(39,174,96,0.2);color:#2ecc71;border:1px solid rgba(39,174,96,0.3);}
.my-actions{display:flex;gap:6px;flex-wrap:wrap;}
.act-btn{padding:8px 14px;border:none;border-radius:8px;font-family:'Nunito',sans-serif;font-size:12px;font-weight:700;cursor:pointer;letter-spacing:0.5px;text-transform:uppercase;transition:all 0.2s;white-space:nowrap;}
.act-btn:disabled{opacity:0.35;cursor:not-allowed;transform:none!important;box-shadow:none!important;}
.drop-btn{background:var(--gold);color:#080f0d;}
.drop-btn:hover:not(:disabled){box-shadow:0 3px 12px rgba(212,168,67,0.4);transform:translateY(-1px);}
.counter-btn{background:linear-gradient(135deg,#e67e22,#d35400);color:#fff;}
.counter-btn:hover:not(:disabled){transform:translateY(-1px);}
.invalid-btn{background:rgba(255,255,255,0.07);color:rgba(240,235,224,0.3);}
.show-btn{background:linear-gradient(135deg,#2ecc71,#27ae60);color:#fff;animation:pulse-show 1.5s infinite;}
@keyframes pulse-show{0%,100%{box-shadow:0 0 0 0 rgba(46,204,113,0.5);}50%{box-shadow:0 0 0 6px rgba(46,204,113,0);}}
.penalty-btn{background:#e74c3c;color:#fff;}
.penalty-btn:hover{transform:translateY(-1px);}
.wait-turn{font-size:11px;color:rgba(240,235,224,0.5);margin-bottom:6px;min-height:16px;line-height:1.4;}
.hand-row{display:flex;gap:6px;overflow-x:auto;padding:4px 0 6px;align-items:flex-end;-webkit-overflow-scrolling:touch;}
.hand-row::-webkit-scrollbar{height:3px;}
.hand-row::-webkit-scrollbar-thumb{background:rgba(212,168,67,0.3);border-radius:2px;}
.hand-locked{opacity:0.45;pointer-events:none;filter:grayscale(0.4);}

/* Flash message */
.flash-msg{position:fixed;top:60px;left:50%;transform:translateX(-50%);background:rgba(231,76,60,0.93);color:#fff;padding:9px 18px;border-radius:10px;font-size:13px;font-weight:600;z-index:999;pointer-events:none;animation:fadeFlash 3s forwards;white-space:nowrap;max-width:90vw;text-align:center;}
@keyframes fadeFlash{0%,75%{opacity:1;}100%{opacity:0;}}

/* Scores strip */
.scores-strip{display:flex;flex-wrap:wrap;gap:5px;padding:6px 10px;background:rgba(0,0,0,0.35);border-top:1px solid rgba(255,255,255,0.05);}
.score-chip{display:flex;align-items:center;gap:5px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.07);border-radius:16px;padding:3px 10px;font-size:11px;position:relative;overflow:visible;}
.score-chip.active-chip{background:rgba(212,168,67,0.12);border-color:var(--gold);}
.score-chip.elim-chip{opacity:0.3;text-decoration:line-through;}
.sc{color:var(--gold);font-weight:700;}

/* Round Over */
.round-over-screen{min-height:100vh;display:flex;align-items:center;justify-content:center;background:radial-gradient(ellipse at 50% 0%,#0e4a29,#080f0d 70%);padding:16px;}
.ro-card{background:rgba(8,20,12,0.97);border:1px solid var(--border);border-radius:20px;padding:24px 16px;width:100%;max-width:720px;box-shadow:0 30px 80px rgba(0,0,0,0.7);overflow-x:auto;}
.ro-title{font-family:'Cinzel',serif;font-size:20px;color:var(--gold);text-align:center;margin-bottom:4px;}
.winner-title{font-size:26px;color:var(--gold2);}
.ro-winner{font-family:'Cinzel',serif;font-size:36px;text-align:center;background:linear-gradient(135deg,var(--gold),var(--gold2));-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:16px;}
.ro-sub{text-align:center;font-size:11px;letter-spacing:2px;color:rgba(240,235,224,0.4);margin-bottom:18px;}
.ro-table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:14px;}
.ro-table th{padding:7px 8px;text-align:left;color:var(--gold);font-size:9px;letter-spacing:1px;text-transform:uppercase;border-bottom:1px solid var(--border);}
.ro-table td{padding:8px;border-bottom:1px solid rgba(255,255,255,0.05);}
.hand-preview{font-size:10px;color:rgba(240,235,224,0.5);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.show-row{background:rgba(212,168,67,0.08);}
.elim-row{opacity:0.4;}
.penalty-add{color:#e74c3c;font-weight:700;}
.elim-note{font-size:11px;color:rgba(240,235,224,0.4);text-align:center;margin-bottom:14px;}

/* Exit modal */
.exit-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.78);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;}
.exit-modal{background:#0a1f14;border:1px solid rgba(231,76,60,0.4);border-radius:18px;padding:28px 22px;max-width:380px;width:100%;text-align:center;box-shadow:0 30px 70px rgba(0,0,0,0.8);}
.exit-icon{font-size:40px;margin-bottom:10px;}
.exit-title{font-family:'Cinzel',serif;font-size:18px;color:#e74c3c;margin-bottom:10px;letter-spacing:2px;}
.exit-body{font-size:13px;color:rgba(240,235,224,0.7);line-height:1.6;margin-bottom:22px;}
.exit-actions{display:flex;gap:10px;justify-content:center;}
.exit-cancel{flex:1;padding:12px;background:linear-gradient(135deg,var(--gold),#a07830);border:none;border-radius:10px;color:#080f0d;font-size:14px;font-weight:700;cursor:pointer;font-family:'Nunito',sans-serif;transition:all 0.2s;}
.exit-cancel:hover{transform:translateY(-1px);}
.exit-confirm{flex:1;padding:12px;background:rgba(231,76,60,0.15);border:1px solid rgba(231,76,60,0.4);border-radius:10px;color:#e74c3c;font-size:14px;font-weight:700;cursor:pointer;font-family:'Nunito',sans-serif;transition:all 0.2s;}
.exit-confirm:hover{background:rgba(231,76,60,0.25);}

.loading-screen{min-height:100vh;display:flex;align-items:center;justify-content:center;color:var(--gold);font-family:'Cinzel',serif;font-size:20px;letter-spacing:3px;}
/* Current turn banner */
.current-turn-banner{text-align:center;padding:4px 0 2px;margin-top:4px;}
.ctb-name{font-size:12px;font-weight:700;letter-spacing:1px;padding:3px 12px;border-radius:20px;display:inline-block;}
.ctb-me{background:rgba(46,204,113,0.15);color:#2ecc71;border:1px solid rgba(46,204,113,0.3);animation:ctb-blink 1.2s infinite;}
.ctb-other{background:rgba(212,168,67,0.1);color:var(--gold);border:1px solid rgba(212,168,67,0.2);animation:ctb-blink 1.2s infinite;}
@keyframes ctb-blink{0%,100%{opacity:1;}50%{opacity:0.45;}}
.next-round-countdown{display:flex;flex-direction:column;align-items:center;margin-top:16px;padding:16px;background:rgba(212,168,67,0.08);border:1px solid var(--border);border-radius:14px;}
.nrc-timer{font-family:'Cinzel',serif;font-size:52px;color:var(--gold);line-height:1;font-weight:900;}
.nrc-label{font-size:12px;color:rgba(240,235,224,0.5);letter-spacing:2px;text-transform:uppercase;margin-top:4px;}
.scores-icon-btn{background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);color:var(--cream);border-radius:7px;padding:4px 8px;font-size:14px;cursor:pointer;margin-left:6px;transition:background 0.15s;}
.scores-icon-btn:hover{background:rgba(255,255,255,0.16);}
.sb-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.82);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;z-index:8888;padding:16px;}
.sb-modal{background:#0a1f14;border:1px solid var(--border);border-radius:18px;width:100%;max-width:680px;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 30px 80px rgba(0,0,0,0.8);}
.sb-header{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--border);}
.sb-title{font-family:'Cinzel',serif;font-size:16px;color:var(--gold);letter-spacing:2px;}
.sb-close{background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);color:var(--cream);border-radius:7px;width:28px;height:28px;cursor:pointer;font-size:13px;}
.sb-empty{padding:32px;text-align:center;color:rgba(240,235,224,0.4);font-size:13px;}
.sb-scroll{overflow:auto;padding:12px 16px 20px;-webkit-overflow-scrolling:touch;}
.sb-table{width:100%;border-collapse:collapse;font-size:12px;min-width:300px;}
.sb-table th{padding:8px 10px;text-align:center;color:var(--gold);font-size:10px;letter-spacing:1px;text-transform:uppercase;border-bottom:1px solid var(--border);white-space:nowrap;position:sticky;top:0;background:#0a1f14;}
.sb-table th:first-child{text-align:left;}
.sb-th-round{min-width:50px;}
.sb-th-elim{opacity:0.4;text-decoration:line-through;}
.sb-table td{padding:8px 10px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.04);}
.sb-td-round{text-align:left;font-weight:700;color:rgba(240,235,224,0.5);font-size:11px;}
.sb-row-even{background:rgba(255,255,255,0.02);}
.sb-penalty{color:#e74c3c;font-weight:700;}
.sb-zero{color:#2ecc71;font-weight:700;}
.sb-td-elim{opacity:0.4;}
.sb-total-row{background:rgba(212,168,67,0.1);border-top:2px solid var(--border);}
.sb-td-total{color:var(--gold);font-weight:700;font-size:13px;}
::-webkit-scrollbar{height:3px;width:3px;}
::-webkit-scrollbar-track{background:transparent;}
::-webkit-scrollbar-thumb{background:rgba(212,168,67,0.3);border-radius:2px;}
.wait-turn-row{display:flex;align-items:center;gap:8px;margin-bottom:6px;}
.wait-turn{font-size:12px;color:rgba(240,235,224,0.5);min-height:16px;flex:1;}
.sort-btns{display:flex;gap:4px;flex-shrink:0;}
.sort-btn{background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:var(--cream);border-radius:6px;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;cursor:pointer;transition:all 0.15s;}
.sort-btn:hover{background:rgba(212,168,67,0.2);border-color:var(--gold);color:var(--gold);}

/* ══════════════════════════════════════════════
   MOBILE ONLY  (≤600px)
   Strategy: game-wrap = 100dvh flex column.
   Every section gets a fixed or flex-shrink size.
   Cards scale with vw so they always fit.
   NO scrolling needed.
   ══════════════════════════════════════════════ */
@media (max-width: 600px) {

  /* Root: full viewport, flex column, nothing overflows */
  .game-wrap {
    display: flex !important;
    flex-direction: column !important;
    height: 100dvh !important;          /* dvh = dynamic viewport, accounts for iOS bar */
    height: 100svh !important;          /* fallback: small viewport height */
    min-height: unset !important;
    overflow: hidden !important;
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }

  /* Top bar — fixed small height, never grows */
  .top-bar {
    flex-shrink: 0 !important;
    padding: 5px 8px !important;
  }
  .tb-room   { font-size: 9px !important; }
  .tb-round  { font-size: 10px !important; }
  .joker-info { font-size: 10px !important; }
  .tb-score  { font-size: 10px !important; }
  .timer-ring { font-size: 10px !important; padding: 2px 5px !important; }

  /* Opponents grid — shrinks tightly */
  .others-row {
    flex-shrink: 0 !important;
    display: grid !important;
    grid-template-columns: 1fr 1fr;
    gap: 4px !important;
    padding: 4px 8px !important;
    overflow: visible !important;
    border-bottom: 1px solid rgba(255,255,255,0.05);
  }
  .opp-chip {
    min-width: unset !important;
    width: 100% !important;
    padding: 4px 6px !important;  /* tighter padding */
  }
  .opp-chip-name   { font-size: 10px !important; }
  .opp-chip-cards  { font-size: 10px !important; }
  .opp-chip-score  { font-size: 10px !important; }
  .opp-chip-top    { margin-bottom: 2px !important; }

  /* Table/felt — shrinks, minimal padding */
  .table-center {
    flex-shrink: 0 !important;
    padding: 5px 8px !important;
  }
  .felt-surface {
    gap: 10px !important;
    padding: 8px 10px !important;
    border-radius: 10px !important;
  }
  /* Smaller cards on the felt */
  .felt-surface .card-sm { width: 42px !important; height: 60px !important; }
  .felt-surface .card-sm .corner b   { font-size: 9px !important; }
  .felt-surface .card-sm .corner span { font-size: 8px !important; }
  .felt-surface .card-sm .mid-suit   { font-size: 13px !important; }
  .felt-label { font-size: 8px !important; }
  /* Smaller joker star badge */
  .joker-star { width: 13px !important; height: 13px !important; font-size: 7px !important; top: -5px !important; right: -5px !important; }

  .log-box    { display: block !important; margin-top: 4px !important; max-height: 28px !important; overflow: hidden !important; }
  .log-line   { font-size: 9px !important; color: rgba(240,235,224,0.5) !important; }
  .penalty-banner { padding: 5px 8px !important; font-size: 10px !important; margin-top: 5px !important; }
  .draw-choice-banner { padding: 5px 8px !important; font-size: 11px !important; gap: 5px !important; margin-top: 5px !important; }
  .dcb-btn { padding: 5px 10px !important; font-size: 11px !important; }

  /* My area — flex col, takes remaining space, no overflow */
  .my-area {
    flex: 1 1 0 !important;
    min-height: 0 !important;       /* critical: allows flex child to shrink below content */
    overflow: hidden !important;
    padding: 6px 8px 4px !important;
  }
  .my-area.elim { padding: 6px 8px !important; }
  .my-header { margin-bottom: 3px !important; }
  .my-name   { font-size: 13px !important; }
  .my-count  { font-size: 11px !important; padding: 2px 10px !important; }
  .act-btn   { padding: 6px 10px !important; font-size: 11px !important; }
  .wait-turn { font-size: 10px !important; margin-bottom: 3px !important; min-height: unset !important; }

  /* Cards — single horizontal row with horizontal scroll only */
  .my-area {
    flex: 1 1 0 !important;
    min-height: 0 !important;
    overflow: hidden !important;
    padding: 5px 8px 4px !important;
    display: flex !important;
    flex-direction: column !important;
  }
  /* hand-row: horizontal scroll, no wrapping */
  .hand-row {
    display: flex !important;
    flex-wrap: nowrap !important;
    gap: 5px !important;
    overflow-x: auto !important;
    overflow-y: hidden !important;
    -webkit-overflow-scrolling: touch !important;
    justify-content: flex-start !important;
    padding: 4px 0 8px !important;
    align-items: flex-end !important;
    flex: 0 0 auto !important;
    min-height: 0 !important;
  }
  .hand-row .card-wrap { flex: 0 0 auto !important; }

  /* Cards: fixed compact size, horizontally scrollable */
  .hand-row .card-md {
    width: 52px !important;
    height: 72px !important;
  }
  .hand-row .card-md .corner b    { font-size: 10px !important; }
  .hand-row .card-md .corner span { font-size: 8px !important; }
  .hand-row .card-md .mid-suit    { font-size: 14px !important; }
  .hand-row .card-md .joker-star  {
    width: 12px !important; height: 12px !important;
    font-size: 7px !important; top: -4px !important; right: -4px !important;
  }

  /* Scores strip — fixed height at very bottom */
  .scores-strip {
    flex-shrink: 0 !important;
    position: relative !important;
    bottom: unset !important;
    padding: 5px 8px calc(5px + env(safe-area-inset-bottom, 0px)) !important;
    background: rgba(8,15,13,0.98) !important;
    border-top: 1px solid rgba(255,255,255,0.06) !important;
    flex-wrap: wrap !important;
    justify-content: center !important;
    gap: 4px !important;
    z-index: 50;
  }
  .score-chip { padding: 3px 8px !important; font-size: 10px !important; }
  .afk-badge  { font-size: 8px !important; }
}

/* Very small screens (≤360px width) — same horizontal scroll, just smaller cards */
@media (max-width: 360px) {
  .hand-row .card-md {
    width: 46px !important;
    height: 64px !important;
  }
  .hand-row .card-md .corner b    { font-size: 9px !important; }
  .hand-row .card-md .corner span { font-size: 7px !important; }
  .hand-row .card-md .mid-suit    { font-size: 12px !important; }
  .others-row { gap: 3px !important; padding: 3px 6px !important; }
  .opp-chip   { padding: 3px 5px !important; }
  .top-bar    { padding: 4px 6px !important; }
}

/* Short height screens (≤700px tall) — scale cards down by available height */
@media (max-height: 700px) {
  .hand-row .card-md {
    width:  calc(13dvh) !important;
    height: calc(13dvh * 1.42) !important;
  }
  .hand-row .card-md .corner b    { font-size: clamp(8px, 1.5dvh, 12px) !important; }
  .hand-row .card-md .corner span { font-size: clamp(6px, 1.2dvh, 10px) !important; }
  .hand-row .card-md .mid-suit    { font-size: clamp(11px, 2dvh, 18px)  !important; }
}

/* Very short screens (≤620px tall) — even smaller */
@media (max-height: 620px) {
  .hand-row .card-md {
    width:  calc(11dvh) !important;
    height: calc(11dvh * 1.42) !important;
  }
  .felt-surface { padding: 6px 8px !important; gap: 8px !important; }
  .felt-surface .card-sm { width: 36px !important; height: 52px !important; }
  .opp-chip { padding: 2px 5px !important; }
  .opp-chip-name { font-size: 9px !important; }
  .my-name  { font-size: 12px !important; }
  .act-btn  { padding: 5px 8px !important; font-size: 10px !important; }
}
`;