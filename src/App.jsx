import { useState, useEffect } from "react";
import { db } from "./firebase";
import { ref, set, get, onValue, off } from "firebase/database";

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
      jokerRank: jc.rank, jokerSuit: jc.suit, currentPlayer: 0,
      sevenPenalty: 0, lastDropRank: null,
      round: 1, showCaller: null, roundOver: false, gameOver: false, winner: null,
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

// ─── Game Screen ──────────────────────────────────────────────────────────────
function GameScreen({ roomId, myName, initialState }) {
  const [gs, setGs] = useState(initialState);
  const [selected, setSelected] = useState([]);
  const [flashMsg, setFlashMsg] = useState("");
  // pendingDraw: after dropping cards that require a draw, hold the mid-turn state
  // so player can choose: draw from pile OR take from discard
  const [pendingDraw, setPendingDraw] = useState(false);

  // Real-time listener — all game state comes from Firebase
  useEffect(() => {
    const unsub = roomListen(roomId, r => { setGs(r); setSelected([]); setPendingDraw(false); });
    return unsub;
  }, [roomId]);

  const flash = (m) => { setFlashMsg(m); setTimeout(() => setFlashMsg(""), 3000); };

  const activePlayers = (gs.players || []).filter(p => !p.eliminated);
  const cpIdx = (gs.currentPlayer || 0) % Math.max(activePlayers.length, 1);
  const currentPlayerName = activePlayers[cpIdx]?.name;
  const isMyTurn = currentPlayerName === myName;
  const myHand = gs.hands?.[myName] || [];
  const myScore = gs.players?.find(p => p.name === myName)?.score ?? 0;
  const isEliminated = gs.players?.find(p => p.name === myName)?.eliminated;
  const jokerRank = gs.jokerRank;
  const myCount = handScore(myHand, jokerRank);
  const sevenPenalty = gs.sevenPenalty || 0;
  const lastDropRank = gs.lastDropRank || null;

  // mustTakePenalty is true only if penalty > 0 AND it's your turn AND you have NOT selected cards yet
  // We keep it as a derived flag for the "take penalty" button, but card selection is always allowed on your turn
  const penaltyActive = isMyTurn && sevenPenalty > 0;

  // ── FIXED: Allow card selection even during 7-penalty so player can counter ──
  const toggleSelect = (idx) => {
    if (!isMyTurn || gs.roundOver) return;
    const card = myHand[idx];
    setSelected(prev => {
      if (prev.includes(idx)) return prev.filter(i => i !== idx);
      const allRanks = [...prev.map(i => myHand[i].rank), card.rank];
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
    const dropping = selected.map(i => hand[i]);
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

    // ── Remove dropped cards ──
    [...selected].sort((a, b) => b - a).forEach(i => hand.splice(i, 1));
    r.discardPile = [...dropping, ...(r.discardPile || [])];
    r.hands[myName] = hand;

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

    // ── Must draw? ──
    const mustDraw = dropping.length <= 2 && dropRank !== "J" && dropRank !== "7" && !isClash;

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
      setPendingDraw(true); // show draw-choice UI locally
    } else {
      // No draw needed — advance turn immediately
      r.currentPlayer = (curIdx + 1 + skipCount) % aPlayers.length;
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
    r.currentPlayer = (curIdx + 1 + skipCount) % aPlayers.length;
    r._awaitingDraw = null;
    r._pendingSkip = null;
    r._pendingPlayer = null;
    await roomSet(roomId, r);
    setPendingDraw(false);
  };

  // ── Draw from the discard pile (not J or 7) ──
  const drawFromDiscard = async () => {
    if (!pendingDraw) return;
    const r = await roomGet(roomId);
    if (!r || !r._awaitingDraw) return;
    const topDiscard = (r.discardPile || [])[0];
    if (!topDiscard) { flash("Discard pile is empty!"); return; }
    if (topDiscard.rank === "J" || topDiscard.rank === "7") {
      flash("Cannot take J or 7 from discard pile!"); return;
    }
    const skipCount = r._pendingSkip || 0;
    const curIdx = r._pendingPlayer || 0;
    const aPlayers = r.players.filter(p => !p.eliminated);
    const hand = [...(r.hands[myName] || [])];
    hand.push(topDiscard);
    r.discardPile = r.discardPile.slice(1);
    r.hands[myName] = hand;
    r.log = [`${myName} took ${topDiscard.rank}${topDiscard.suit} from discard`, ...(r.log || []).slice(0, 14)];
    r.currentPlayer = (curIdx + 1 + skipCount) % aPlayers.length;
    r._awaitingDraw = null;
    r._pendingSkip = null;
    r._pendingPlayer = null;
    await roomSet(roomId, r);
    setPendingDraw(false);
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
    r.log = [`${myName} drew ${pen} penalty cards`, ...(r.log || []).slice(0, 14)];
    await roomSet(roomId, r);
    setSelected([]);
  };

  // ── Hit Show ──
  const hitShow = async () => {
    if (myCount > 5) { flash(`Your count is ${myCount}. Need ≤ 5 to Show!`); return; }
    const r = await roomGet(roomId);
    if (!r || r.roundOver) return;
    const myC = handScore(r.hands[myName] || [], r.jokerRank);
    const others = r.players.filter(p => !p.eliminated && p.name !== myName);
    const someoneBetter = others.some(p => handScore(r.hands[p.name] || [], r.jokerRank) <= myC);
    let newPlayers = r.players.map(p => {
      if (p.eliminated) return p;
      const add = p.name === myName ? (someoneBetter ? 50 : 0) : handScore(r.hands[p.name] || [], r.jokerRank);
      return { ...p, score: p.score + add, lastAdd: add };
    });
    newPlayers = newPlayers.map(p => ({ ...p, eliminated: p.eliminated || p.score >= r.maxScore }));
    const remaining = newPlayers.filter(p => !p.eliminated);
    const gameOver = remaining.length <= 1;
    r.players = newPlayers;
    r.showCaller = myName;
    r.roundOver = true;
    r.gameOver = gameOver;
    r.winner = gameOver ? (remaining[0]?.name || null) : null;
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
    const nextState = {
      code: r.code, host: r.host, maxPlayers: r.maxPlayers,
      numSets: r.numSets, maxScore: r.maxScore, phase: "playing",
      players: r.players.map(p => ({ name: p.name, score: p.score, eliminated: p.eliminated })),
      hands, drawPile: deck, discardPile: [],
      jokerRank: jc.rank, jokerSuit: jc.suit,
      currentPlayer: 0, sevenPenalty: 0, lastDropRank: null,
      round: newRound, showCaller: null,
      roundOver: false, gameOver: false, winner: null,
      log: [`Round ${newRound} started! Joker: ${jc.rank}${jc.suit} = 0 pts`],
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
          <span className="joker-info">JOKER: <b>{gs.jokerRank}{gs.jokerSuit}</b> = 0</span>
        </div>
        <div className="tb-right">
          <span className="tb-score">My Score: <b>{myScore}</b></span>
        </div>
      </div>

      {/* Opponents */}
      <div className="others-row">
        {activePlayers.filter(p => p.name !== myName).map((p, i) => {
          const isCurrent = p.name === currentPlayerName;
          const oppHand = gs.hands?.[p.name] || [];
          return (
            <div key={i} className={`opp ${isCurrent ? "opp-active" : ""}`}>
              <div className="opp-name">{p.name}{isCurrent ? " ▶" : ""}</div>
              <div className="opp-cards">
                {oppHand.map((_, ci) => <div key={ci} className="card card-xs back"><div className="back-pat" /></div>)}
              </div>
              <div className="opp-meta">{oppHand.length} cards · {p.score} pts</div>
            </div>
          );
        })}
      </div>

      {/* Table */}
      <div className="table-center">
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
          {/* Discard pile */}
          <div className="felt-group">
            <div className="felt-label">
              DISCARD {isMyTurn && lastDropRank && !penaltyActive && !pendingDraw ? <span className="clash-badge">⚡ CLASH</span> : ""}
            </div>
            {gs.discardPile?.length > 0 ? (() => {
              const topCard = gs.discardPile[0];
              const canDrawFromDiscard = pendingDraw && topCard.rank !== "J" && topCard.rank !== "7";
              return (
                <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                  <div
                    className={`card card-sm ${isRed(topCard.suit) ? "red" : "blk"} ${isMyTurn && lastDropRank && !penaltyActive && !pendingDraw ? "clash-glow" : ""} ${canDrawFromDiscard ? "discard-pick tap" : ""}`}
                    onClick={canDrawFromDiscard ? drawFromDiscard : undefined}
                    title={canDrawFromDiscard ? `Take ${topCard.rank}${topCard.suit} from discard` : ""}
                  >
                    <span className="corner tl"><b>{topCard.rank}</b><span>{topCard.suit}</span></span>
                    <span className="mid-suit">{topCard.suit}</span>
                    <span className="corner br"><b>{topCard.rank}</b><span>{topCard.suit}</span></span>
                  </div>
                  {pendingDraw && (topCard.rank === "J" || topCard.rank === "7") && (
                    <span style={{fontSize:9,color:"rgba(231,76,60,0.8)",marginTop:2}}>Can't take J/7</span>
                  )}
                </div>
              );
            })() : <div className="empty-pile">Empty</div>}
          </div>
        </div>

        {/* Draw choice banner — shown after dropping when draw is needed */}
        {pendingDraw && (
          <div className="draw-choice-banner">
            🃏 Choose where to draw from:
            <button className="dcb-btn pile-btn" onClick={drawFromPile}>
              Draw Pile ({gs.drawPile?.length || 0})
            </button>
            {gs.discardPile?.length > 0 && gs.discardPile[0].rank !== "J" && gs.discardPile[0].rank !== "7" && (
              <button className="dcb-btn discard-btn" onClick={drawFromDiscard}>
                Take {gs.discardPile[0].rank}{gs.discardPile[0].suit} from Discard
              </button>
            )}
          </div>
        )}

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
      <div className={`my-area ${isEliminated ? "elim" : ""}`}>
        {isEliminated ? (
          <div className="elim-msg">You've been eliminated. Spectating…</div>
        ) : (
          <>
            <div className="my-header">
              <div className="my-info">
                <span className="my-name">{myName}</span>
                <span className={`my-count ${myCount <= 5 ? "low-count" : ""}`}>Count: {myCount}</span>
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
                {/* Show button — only on your turn */}
                {isMyTurn && myCount <= 5 && !gs.roundOver && (
                  <button className="act-btn show-btn" onClick={hitShow}>HIT SHOW 🎯</button>
                )}
              </div>
            </div>

            <div className="wait-turn">{hintText}</div>

            <div className="hand-row">
              {myHand.map((card, idx) => {
                // Highlight cards that can clash (match lastDropRank, not 7, not J)
                const canClash = isMyTurn && !penaltyActive && lastDropRank
                  && card.rank === lastDropRank && card.rank !== "7" && card.rank !== "J";
                // Highlight 7s when penalty is active (valid counter)
                const canCounter = isMyTurn && penaltyActive && card.rank === "7";
                return (
                  <div key={card.id} className={`card-wrap ${canClash ? "clash-highlight" : ""} ${canCounter ? "counter-highlight" : ""}`}>
                    <CardFace
                      card={card}
                      selected={selected.includes(idx)}
                      onClick={isMyTurn ? () => toggleSelect(idx) : undefined}
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

      {/* Scores strip */}
      <div className="scores-strip">
        {(gs.players || []).map((p, i) => (
          <div key={i} className={`score-chip ${p.eliminated ? "elim-chip" : ""} ${p.name === currentPlayerName ? "active-chip" : ""}`}>
            <span>{p.name}</span><span className="sc">{p.score}</span>
          </div>
        ))}
      </div>

      {flashMsg && <div className="flash-msg">{flashMsg}</div>}
    </div>
  );
}

// ─── Round Over ───────────────────────────────────────────────────────────────
function RoundOver({ gs, myName, jokerRank, onNextRound, isHost }) {
  const active = (gs.players || []).filter(p => !p.eliminated);
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
            <div className="elim-note">Eliminated at {gs.maxScore} pts · Remaining: {active.map(p => p.name).join(", ")}</div>
            {isHost
              ? <button className="cta" onClick={onNextRound}>NEXT ROUND ▶</button>
              : <p className="wait-hint">Waiting for <b>{gs.host}</b> to start next round…</p>}
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

  // ── Browser refresh / tab close warning ──
  useEffect(() => {
    if (!inActiveSession) return;
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = ""; // triggers browser's native "Leave site?" dialog
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [inActiveSession]);

  // ── Browser back button — intercept and show our custom modal ──
  useEffect(() => {
    if (!inActiveSession) return;
    // Push a dummy history entry so back button fires popstate instead of navigating away
    window.history.pushState({ lowcard: true }, "");
    const onPopState = (e) => {
      // Re-push so the URL doesn't actually change
      window.history.pushState({ lowcard: true }, "");
      setShowExitModal(true);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [inActiveSession]);

  const confirmExit = () => {
    setShowExitModal(false);
    // Actually leave — remove the beforeunload guard first so it doesn't double-prompt
    window.removeEventListener("beforeunload", () => {});
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
:root{--bg:#080f0d;--felt:#0c3d22;--felt2:#0e4a29;--gold:#d4a843;--gold2:#f0c96a;--cream:#f0ebe0;--red:#c0392b;--blk:#1a1a1a;--border:rgba(212,168,67,0.25);}
body{font-family:'Nunito',sans-serif;background:var(--bg);color:var(--cream);min-height:100vh;overflow-x:hidden;}
.lobby{min-height:100vh;display:flex;align-items:center;justify-content:center;background:radial-gradient(ellipse at 50% -10%,#1a5c35,#080f0d 65%);padding:20px;}
.lobby-card{background:rgba(8,20,12,0.97);border:1px solid var(--border);border-radius:24px;padding:40px 36px;width:100%;max-width:560px;box-shadow:0 40px 100px rgba(0,0,0,0.7),inset 0 1px 0 rgba(212,168,67,0.15);}
.brand{font-family:'Cinzel',serif;font-size:36px;color:var(--gold);letter-spacing:6px;text-align:center;margin-bottom:4px;}
.brand span{background:linear-gradient(135deg,var(--gold),var(--gold2));-webkit-background-clip:text;-webkit-text-fill-color:transparent;}
.brand-sub{text-align:center;font-size:12px;letter-spacing:2px;color:rgba(240,235,224,0.4);text-transform:uppercase;margin-bottom:28px;}
.tab-row{display:flex;background:rgba(255,255,255,0.04);border-radius:10px;padding:4px;margin-bottom:24px;border:1px solid rgba(255,255,255,0.07);}
.tab{flex:1;padding:10px;border:none;background:transparent;color:rgba(240,235,224,0.5);font-family:'Nunito',sans-serif;font-size:13px;letter-spacing:1px;text-transform:uppercase;cursor:pointer;border-radius:8px;transition:all 0.2s;}
.tab.on{background:var(--gold);color:#080f0d;font-weight:700;}
.field{margin-bottom:18px;}
.field-row{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
.field label{display:block;font-size:10px;letter-spacing:2px;color:var(--gold);text-transform:uppercase;margin-bottom:8px;}
.field input{width:100%;background:rgba(255,255,255,0.05);border:1px solid rgba(212,168,67,0.2);border-radius:10px;padding:12px 14px;color:var(--cream);font-size:15px;font-family:'Nunito',sans-serif;outline:none;transition:border-color 0.15s;}
.field input:focus{border-color:var(--gold);}
.code-input{text-transform:uppercase!important;letter-spacing:6px;font-size:22px;text-align:center;font-weight:700;}
.mini-btns{display:flex;flex-wrap:wrap;gap:6px;}
.nb{width:36px;height:36px;border-radius:7px;border:1px solid rgba(212,168,67,0.2);background:rgba(255,255,255,0.04);color:var(--cream);font-size:13px;cursor:pointer;font-family:'Nunito',sans-serif;transition:all 0.15s;}
.nb:hover{border-color:var(--gold);}
.nb.on{background:var(--gold);color:#080f0d;font-weight:700;border-color:var(--gold);}
.score-slider-row{display:flex;align-items:center;gap:14px;}
.slider{flex:1;-webkit-appearance:none;height:4px;border-radius:2px;background:rgba(212,168,67,0.2);outline:none;}
.slider::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:50%;background:var(--gold);cursor:pointer;}
.slider-val{font-size:20px;font-weight:700;color:var(--gold);min-width:50px;text-align:right;}
.cta{width:100%;padding:16px;margin-top:8px;background:linear-gradient(135deg,var(--gold),#a07830);border:none;border-radius:12px;color:#080f0d;font-size:16px;font-weight:700;letter-spacing:3px;cursor:pointer;font-family:'Nunito',sans-serif;transition:all 0.2s;text-transform:uppercase;}
.cta:hover{transform:translateY(-2px);box-shadow:0 10px 30px rgba(212,168,67,0.35);}
.cta:active{transform:translateY(0);}
.cta:disabled{opacity:0.5;cursor:not-allowed;transform:none;}
.err{color:#e74c3c;font-size:13px;margin-bottom:8px;text-align:center;}
.lobby-hint{text-align:center;font-size:12px;color:rgba(240,235,224,0.3);margin-top:16px;}
.room-code-display{text-align:center;background:rgba(212,168,67,0.08);border:1px solid var(--border);border-radius:14px;padding:20px;margin-bottom:20px;}
.rc-label{display:block;font-size:10px;letter-spacing:2px;color:rgba(240,235,224,0.4);text-transform:uppercase;}
.rc-val{display:block;font-family:'Cinzel',serif;font-size:42px;color:var(--gold);letter-spacing:10px;margin:6px 0;}
.rc-hint{font-size:12px;color:rgba(240,235,224,0.4);}
.player-list{margin-bottom:16px;}
.pl-head{font-size:10px;letter-spacing:2px;color:var(--gold);text-transform:uppercase;margin-bottom:10px;}
.pl-item{display:flex;align-items:center;gap:8px;padding:10px 14px;background:rgba(255,255,255,0.04);border-radius:8px;margin-bottom:6px;font-size:14px;}
.pl-item.host{background:rgba(212,168,67,0.08);border:1px solid rgba(212,168,67,0.2);}
.host-badge,.you-badge{margin-left:auto;font-size:10px;padding:2px 8px;border-radius:10px;font-weight:700;letter-spacing:1px;}
.host-badge{background:var(--gold);color:#080f0d;}
.you-badge{background:rgba(255,255,255,0.1);color:var(--cream);}
.room-meta{font-size:13px;color:rgba(240,235,224,0.4);text-align:center;margin-bottom:16px;}
.wait-hint{text-align:center;font-size:13px;color:rgba(240,235,224,0.4);margin-top:12px;}
.card{background:#fffef9;border:1px solid #d4c5a9;border-radius:8px;position:relative;flex-shrink:0;user-select:none;transition:transform 0.15s,box-shadow 0.15s;}
.card-md{width:68px;height:96px;}
.card-sm{width:54px;height:76px;}
.card-xs{width:32px;height:46px;}
.card.tap{cursor:pointer;}
.card.tap:hover{transform:translateY(-8px);box-shadow:0 14px 28px rgba(0,0,0,0.5);}
.card.sel{transform:translateY(-16px);box-shadow:0 18px 36px rgba(212,168,67,0.5),0 0 0 2px var(--gold);}
.card.joker-glow{box-shadow:0 0 0 2px gold,0 4px 20px rgba(255,215,0,0.4);}
.card.clash-glow{box-shadow:0 0 0 2px #e67e22,0 4px 20px rgba(230,126,34,0.4);}
.red .corner,.red .mid-suit{color:var(--red)!important;}
.blk .corner,.blk .mid-suit{color:var(--blk)!important;}
.corner{position:absolute;display:flex;flex-direction:column;align-items:center;line-height:1.1;}
.corner b{font-size:13px;font-weight:800;}
.corner span{font-size:10px;}
.card-sm .corner b{font-size:11px;}
.card-sm .corner span{font-size:9px;}
.card-xs .corner{display:none;}
.tl{top:3px;left:4px;}
.br{bottom:3px;right:4px;transform:rotate(180deg);}
.mid-suit{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:20px;opacity:0.13;}
.card-sm .mid-suit{font-size:16px;}
.joker-star{position:absolute;top:-7px;right:-7px;background:gold;border-radius:50%;width:16px;height:16px;display:flex;align-items:center;justify-content:center;font-size:9px;color:#080f0d;font-weight:700;}
.back{cursor:default;}
.back-pat{position:absolute;inset:5px;border-radius:4px;background:repeating-linear-gradient(45deg,#0e4a29 0,#0e4a29 4px,#0c3d22 4px,#0c3d22 8px);opacity:0.9;}
.card-wrap{position:relative;display:inline-flex;flex-direction:column;align-items:center;flex-shrink:0;}
.clash-highlight .card{animation:clash-pulse 1.2s infinite;}
@keyframes clash-pulse{0%,100%{box-shadow:0 0 0 2px #e67e22,0 4px 14px rgba(230,126,34,0.3);}50%{box-shadow:0 0 0 3px #e67e22,0 6px 22px rgba(230,126,34,0.6);}}
.counter-highlight .card{animation:counter-pulse 1.2s infinite;}
@keyframes counter-pulse{0%,100%{box-shadow:0 0 0 2px #3498db,0 4px 14px rgba(52,152,219,0.3);}50%{box-shadow:0 0 0 3px #3498db,0 6px 22px rgba(52,152,219,0.6);}}
.card-tip{font-size:11px;margin-top:3px;font-weight:700;text-align:center;}
.clash-tip{color:#e67e22;}
.counter-tip{color:#3498db;}
.clash-badge{font-size:9px;background:#e67e22;color:#fff;border-radius:8px;padding:1px 6px;margin-left:4px;font-weight:700;vertical-align:middle;}
.game-wrap{min-height:100vh;display:flex;flex-direction:column;background:radial-gradient(ellipse at 50% 20%,#0e4a29,#080f0d 75%);}
.top-bar{display:flex;align-items:center;justify-content:space-between;padding:10px 18px;background:rgba(0,0,0,0.4);border-bottom:1px solid var(--border);}
.tb-left,.tb-right{display:flex;align-items:center;gap:12px;}
.tb-room{font-size:11px;letter-spacing:2px;color:rgba(240,235,224,0.4);font-weight:700;}
.tb-round{font-size:13px;color:var(--gold);font-weight:700;}
.joker-info{font-size:13px;color:rgba(240,235,224,0.7);}
.joker-info b{color:gold;}
.tb-score{font-size:13px;}
.tb-score b{color:var(--gold);}
.others-row{display:flex;gap:12px;padding:12px 18px;overflow-x:auto;border-bottom:1px solid rgba(255,255,255,0.05);min-height:100px;}
.opp{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:10px 14px;min-width:130px;transition:all 0.3s;}
.opp-active{background:rgba(212,168,67,0.1);border-color:var(--gold);box-shadow:0 0 20px rgba(212,168,67,0.15);}
.opp-name{font-size:12px;font-weight:700;margin-bottom:6px;}
.opp-cards{display:flex;gap:3px;flex-wrap:wrap;margin-bottom:5px;}
.opp-meta{font-size:10px;color:rgba(240,235,224,0.4);}
.table-center{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;}
.felt-surface{background:radial-gradient(ellipse,#1a6b3a,#0c3d22);border-radius:20px;border:3px solid rgba(212,168,67,0.2);padding:20px 28px;display:flex;gap:28px;align-items:center;justify-content:center;flex-wrap:wrap;box-shadow:inset 0 2px 20px rgba(0,0,0,0.4);}
.felt-group{display:flex;flex-direction:column;align-items:center;gap:6px;}
.felt-label{font-size:10px;letter-spacing:1.5px;color:rgba(240,235,224,0.5);text-transform:uppercase;}
.empty-pile{width:54px;height:76px;border:2px dashed rgba(240,235,224,0.15);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:10px;color:rgba(240,235,224,0.3);}
.penalty-banner{background:rgba(231,76,60,0.15);border:1px solid rgba(231,76,60,0.4);border-radius:10px;padding:10px 16px;font-size:13px;color:#e74c3c;margin-top:12px;text-align:center;max-width:520px;}
.log-box{margin-top:10px;width:100%;max-width:520px;}
.log-line{font-size:11px;color:rgba(240,235,224,0.6);padding:2px 0;}
.my-area{background:rgba(0,0,0,0.4);border-top:2px solid rgba(212,168,67,0.2);padding:14px 18px 20px;}
.my-area.elim{opacity:0.5;}
.elim-msg{text-align:center;color:rgba(240,235,224,0.4);font-size:14px;padding:20px;}
.my-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;flex-wrap:wrap;gap:8px;}
.my-info{display:flex;align-items:center;gap:10px;}
.my-name{font-size:16px;font-weight:700;}
.my-count{background:rgba(255,255,255,0.08);border-radius:20px;padding:4px 14px;font-size:13px;font-weight:600;}
.low-count{background:rgba(39,174,96,0.2);color:#2ecc71;border:1px solid rgba(39,174,96,0.3);}
.my-actions{display:flex;gap:8px;flex-wrap:wrap;}
.act-btn{padding:8px 18px;border:none;border-radius:8px;font-family:'Nunito',sans-serif;font-size:13px;font-weight:700;cursor:pointer;letter-spacing:1px;text-transform:uppercase;transition:all 0.2s;}
.act-btn:disabled{opacity:0.35;cursor:not-allowed;transform:none!important;box-shadow:none!important;}
.drop-btn{background:var(--gold);color:#080f0d;}
.drop-btn:hover:not(:disabled){box-shadow:0 4px 16px rgba(212,168,67,0.4);transform:translateY(-1px);}
.counter-btn{background:linear-gradient(135deg,#e67e22,#d35400);color:#fff;}
.counter-btn:hover:not(:disabled){box-shadow:0 4px 16px rgba(230,126,34,0.5);transform:translateY(-1px);}
.invalid-btn{background:rgba(255,255,255,0.08);color:rgba(240,235,224,0.35);}
.show-btn{background:linear-gradient(135deg,#2ecc71,#27ae60);color:#fff;animation:pulse-show 1.5s infinite;}
@keyframes pulse-show{0%,100%{box-shadow:0 0 0 0 rgba(46,204,113,0.5);}50%{box-shadow:0 0 0 8px rgba(46,204,113,0);}}
.penalty-btn{background:#e74c3c;color:#fff;}
.penalty-btn:hover{box-shadow:0 4px 16px rgba(231,76,60,0.4);transform:translateY(-1px);}
.wait-turn{font-size:12px;color:rgba(240,235,224,0.5);margin-bottom:8px;min-height:18px;}
.hand-row{display:flex;gap:8px;overflow-x:auto;padding:4px 0 2px;align-items:flex-end;}
.flash-msg{position:fixed;top:70px;left:50%;transform:translateX(-50%);background:rgba(231,76,60,0.92);color:#fff;padding:10px 22px;border-radius:10px;font-size:14px;font-weight:600;z-index:999;pointer-events:none;animation:fadeFlash 3s forwards;white-space:nowrap;}
@keyframes fadeFlash{0%,75%{opacity:1;}100%{opacity:0;}}
.scores-strip{display:flex;flex-wrap:wrap;gap:6px;padding:8px 18px;background:rgba(0,0,0,0.3);border-top:1px solid rgba(255,255,255,0.05);}
.score-chip{display:flex;align-items:center;gap:6px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.07);border-radius:20px;padding:4px 12px;font-size:12px;}
.score-chip.active-chip{background:rgba(212,168,67,0.12);border-color:var(--gold);}
.score-chip.elim-chip{opacity:0.35;text-decoration:line-through;}
.sc{color:var(--gold);font-weight:700;}
.round-over-screen{min-height:100vh;display:flex;align-items:center;justify-content:center;background:radial-gradient(ellipse at 50% 0%,#0e4a29,#080f0d 70%);padding:20px;}
.ro-card{background:rgba(8,20,12,0.97);border:1px solid var(--border);border-radius:24px;padding:36px 28px;width:100%;max-width:800px;box-shadow:0 40px 100px rgba(0,0,0,0.7);}
.ro-title{font-family:'Cinzel',serif;font-size:24px;color:var(--gold);text-align:center;margin-bottom:4px;}
.winner-title{font-size:32px;color:var(--gold2);}
.ro-winner{font-family:'Cinzel',serif;font-size:48px;text-align:center;background:linear-gradient(135deg,var(--gold),var(--gold2));-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:20px;}
.ro-sub{text-align:center;font-size:12px;letter-spacing:2px;color:rgba(240,235,224,0.4);margin-bottom:24px;}
.ro-table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px;}
.ro-table th{padding:8px 10px;text-align:left;color:var(--gold);font-size:10px;letter-spacing:1px;text-transform:uppercase;border-bottom:1px solid var(--border);}
.ro-table td{padding:10px;border-bottom:1px solid rgba(255,255,255,0.05);}
.hand-preview{font-size:11px;color:rgba(240,235,224,0.5);}
.show-row{background:rgba(212,168,67,0.08);}
.elim-row{opacity:0.45;}
.penalty-add{color:#e74c3c;font-weight:700;}
.elim-note{font-size:12px;color:rgba(240,235,224,0.4);text-align:center;margin-bottom:16px;}
.loading-screen{min-height:100vh;display:flex;align-items:center;justify-content:center;color:var(--gold);font-family:'Cinzel',serif;font-size:24px;letter-spacing:4px;}
.draw-choice-banner{display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:center;background:rgba(46,204,113,0.12);border:1px solid rgba(46,204,113,0.4);border-radius:10px;padding:10px 16px;font-size:13px;color:#2ecc71;margin-top:12px;max-width:520px;}
.dcb-btn{border:none;border-radius:8px;font-family:'Nunito',sans-serif;font-size:12px;font-weight:700;padding:7px 14px;cursor:pointer;letter-spacing:0.5px;transition:all 0.2s;}
.pile-btn{background:rgba(255,255,255,0.15);color:var(--cream);}
.pile-btn:hover{background:rgba(255,255,255,0.25);transform:translateY(-1px);}
.discard-btn{background:rgba(52,152,219,0.85);color:#fff;}
.discard-btn:hover{background:rgba(52,152,219,1);transform:translateY(-1px);}
.draw-pick{box-shadow:0 0 0 3px #2ecc71,0 4px 20px rgba(46,204,113,0.4);animation:draw-pulse 1s infinite;}
@keyframes draw-pulse{0%,100%{box-shadow:0 0 0 2px #2ecc71,0 4px 14px rgba(46,204,113,0.3);}50%{box-shadow:0 0 0 4px #2ecc71,0 6px 22px rgba(46,204,113,0.6);}}
.discard-pick{box-shadow:0 0 0 3px #3498db,0 4px 20px rgba(52,152,219,0.4);animation:discard-pulse 1s infinite;}
@keyframes discard-pulse{0%,100%{box-shadow:0 0 0 2px #3498db,0 4px 14px rgba(52,152,219,0.3);}50%{box-shadow:0 0 0 4px #3498db,0 6px 22px rgba(52,152,219,0.6);}}
::-webkit-scrollbar{height:4px;width:4px;}
::-webkit-scrollbar-track{background:transparent;}
::-webkit-scrollbar-thumb{background:rgba(212,168,67,0.3);border-radius:2px;}
.exit-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.75);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;}
.exit-modal{background:#0a1f14;border:1px solid rgba(231,76,60,0.4);border-radius:20px;padding:36px 32px;max-width:420px;width:100%;text-align:center;box-shadow:0 40px 80px rgba(0,0,0,0.8),inset 0 1px 0 rgba(255,255,255,0.05);}
.exit-icon{font-size:48px;margin-bottom:12px;}
.exit-title{font-family:'Cinzel',serif;font-size:22px;color:#e74c3c;margin-bottom:12px;letter-spacing:2px;}
.exit-body{font-size:14px;color:rgba(240,235,224,0.7);line-height:1.6;margin-bottom:28px;}
.exit-actions{display:flex;gap:12px;justify-content:center;}
.exit-cancel{flex:1;padding:13px;background:linear-gradient(135deg,var(--gold),#a07830);border:none;border-radius:10px;color:#080f0d;font-size:14px;font-weight:700;cursor:pointer;font-family:'Nunito',sans-serif;transition:all 0.2s;}
.exit-cancel:hover{transform:translateY(-1px);box-shadow:0 6px 20px rgba(212,168,67,0.35);}
.exit-confirm{flex:1;padding:13px;background:rgba(231,76,60,0.15);border:1px solid rgba(231,76,60,0.4);border-radius:10px;color:#e74c3c;font-size:14px;font-weight:700;cursor:pointer;font-family:'Nunito',sans-serif;transition:all 0.2s;}
.exit-confirm:hover{background:rgba(231,76,60,0.25);transform:translateY(-1px);}
`;
