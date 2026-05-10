import { useState, useEffect, useCallback, useRef } from "react";
import { db } from "./firebase.js";
import { ref, set, get, onValue, off } from "firebase/database";

// ─── Card Engine ──────────────────────────────────────────────────────────────
const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

function cardValue(rank) {
  if (rank === "A") return 1;
  if (["J", "Q", "K"].includes(rank)) return 10;
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
  return hand.reduce((s, c) => s + (c.rank === jokerRank ? 0 : cardValue(c.rank)), 0);
}

function isRed(suit) { return suit === "♥" || suit === "♦"; }

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
  try {
    await set(ref(db, `rooms/${roomId}`), state);
  } catch (e) { console.error("roomSet error", e); }
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
      className={[
        "card",
        small ? "card-sm" : "card-md",
        red ? "red" : "blk",
        selected ? "sel" : "",
        onClick ? "tap" : "",
        faceDown ? "back" : "",
        isJoker ? "joker-glow" : "",
      ].filter(Boolean).join(" ")}
      onClick={onClick}
    >
      {faceDown ? (
        <div className="back-pat" />
      ) : (
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
      code,
      host: name.trim(),
      maxPlayers: numPlayers,
      numSets,
      maxScore,
      players: [{ name: name.trim(), score: 0, eliminated: false }],
      phase: "lobby",
      log: ["Room created. Waiting for players…"],
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
    if (room.players.find(p => p.name === name.trim())) { setErr("Name already taken"); setLoading(false); return; }
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
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Enter name" maxLength={14} onKeyDown={e => e.key === "Enter" && (mode === "create" ? handleCreate() : handleJoin())} />
        </div>

        {mode === "create" ? (
          <>
            <div className="field-row">
              <div className="field">
                <label>MAX PLAYERS</label>
                <div className="mini-btns">
                  {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => (
                    <button key={n} className={`nb ${numPlayers === n ? "on" : ""}`} onClick={() => setNumPlayers(n)}>{n}</button>
                  ))}
                </div>
              </div>
              <div className="field">
                <label>CARD SETS</label>
                <div className="mini-btns">
                  {[1, 2, 3, 4].map(n => (
                    <button key={n} className={`nb ${numSets === n ? "on" : ""}`} onClick={() => setNumSets(n)}>{n}</button>
                  ))}
                </div>
              </div>
            </div>
            <div className="field">
              <label>ELIMINATION SCORE — <b style={{ color: "var(--gold)" }}>{maxScore} pts</b> (min 50)</label>
              <div className="score-slider-row">
                <input type="range" min={50} max={500} step={50} value={maxScore}
                  onChange={e => setMaxScore(+e.target.value)} className="slider" />
                <span className="slider-val">{maxScore}</span>
              </div>
            </div>
            {err && <div className="err">{err}</div>}
            <button className="cta" onClick={handleCreate} disabled={loading}>
              {loading ? "Creating…" : "CREATE ROOM"}
            </button>
          </>
        ) : (
          <>
            <div className="field">
              <label>ROOM CODE</label>
              <input value={roomCode} onChange={e => setRoomCode(e.target.value.toUpperCase())}
                placeholder="e.g. AB3XY" maxLength={5} className="code-input" />
            </div>
            {err && <div className="err">{err}</div>}
            <button className="cta" onClick={handleJoin} disabled={loading}>
              {loading ? "Joining…" : "JOIN ROOM"}
            </button>
          </>
        )}

        <p className="lobby-hint">Share the room code with friends — they join from any device!</p>
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

    let deck = shuffle(buildDeck(r.numSets));
    const hands = {};
    for (const p of r.players) {
      hands[p.name] = deck.splice(0, 7);
    }

    // Joker: not J or 7
    const candidates = deck.filter(c => c.rank !== "J" && c.rank !== "7");
    const jokerCard = candidates[Math.floor(Math.random() * candidates.length)];
    deck.splice(deck.findIndex(c => c.id === jokerCard.id), 1);

    const gs = {
      ...r,
      phase: "playing",
      hands,
      drawPile: deck,
      discardPile: [],
      jokerRank: jokerCard.rank,
      jokerSuit: jokerCard.suit,
      currentPlayer: 0,
      sevenPenalty: 0,
      round: 1,
      showCaller: null,
      roundOver: false,
      gameOver: false,
      winner: null,
      log: [`Round 1 started! Joker: ${jokerCard.rank}${jokerCard.suit} = 0 pts`],
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
          <span className="rc-label">ROOM CODE — Share with friends</span>
          <span className="rc-val">{roomId}</span>
          <span className="rc-hint">They open the game link and enter this code</span>
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

        <div className="room-meta">
          Card Sets: <b>{room.numSets}</b> · Eliminated at: <b>{room.maxScore} pts</b>
        </div>

        {isHost && room.players.length >= 2 && (
          <button className="cta" onClick={startGame}>START GAME ▶</button>
        )}
        {isHost && room.players.length < 2 && (
          <p className="wait-hint">Need at least 2 players to start…</p>
        )}
        {!isHost && (
          <p className="wait-hint">Waiting for <b>{room.host}</b> to start the game…</p>
        )}
      </div>
    </div>
  );
}

// ─── Game Screen ──────────────────────────────────────────────────────────────
function GameScreen({ roomId, myName, initialState }) {
  const [gs, setGs] = useState(initialState);
  const [selected, setSelected] = useState([]);
  const [flashMsg, setFlashMsg] = useState("");
  const gsRef = useRef(gs);
  gsRef.current = gs;

  // Real-time listener
  useEffect(() => {
    const unsub = roomListen(roomId, r => setGs(r));
    return unsub;
  }, [roomId]);

  const flash = (m) => { setFlashMsg(m); setTimeout(() => setFlashMsg(""), 3000); };

  const activePlayers = (gs.players || []).filter(p => !p.eliminated);
  const cpIdx = (gs.currentPlayer || 0) % Math.max(activePlayers.length, 1);
  const currentPlayerName = activePlayers[cpIdx]?.name;
  const isMyTurn = currentPlayerName === myName;
  const myHand = gs.hands?.[myName] || [];
  const myPlayerData = gs.players?.find(p => p.name === myName);
  const myScore = myPlayerData?.score ?? 0;
  const isEliminated = myPlayerData?.eliminated;
  const jokerRank = gs.jokerRank;
  const myCount = handScore(myHand, jokerRank);
  const mustTakePenalty = isMyTurn && (gs.sevenPenalty || 0) > 0;

  const toggleSelect = (idx) => {
    if (!isMyTurn || gs.roundOver || mustTakePenalty) return;
    const card = myHand[idx];
    setSelected(prev => {
      if (prev.includes(idx)) return prev.filter(i => i !== idx);
      const allRanks = [...prev.map(i => myHand[i].rank), card.rank];
      if ([...new Set(allRanks)].length > 1) {
        flash("Select cards of the same rank only!");
        return prev;
      }
      return [...prev, idx];
    });
  };

  const doAction = async () => {
    if (!isMyTurn || selected.length === 0 || gs.roundOver) return;
    // Fetch fresh state to avoid conflicts
    const r = await roomGet(roomId);
    if (!r || r.roundOver) return;

    const hand = [...(r.hands[myName] || [])];
    const dropping = selected.map(i => hand[i]);
    const dropRank = dropping[0].rank;

    if (!dropping.every(c => c.rank === dropRank)) {
      flash("All dropped cards must be same rank!"); return;
    }

    const aPlayers = r.players.filter(p => !p.eliminated);
    const curIdx = (r.currentPlayer || 0) % aPlayers.length;

    // Handle active 7 penalty — player must counter or draw
    if ((r.sevenPenalty || 0) > 0) {
      if (dropRank === "7") {
        // Forward chain
      } else if (dropping.length > 2) {
        // Tackle with 3+ same cards — penalty cleared
        r.sevenPenalty = 0;
      } else {
        flash(`Can't counter! Drawing ${r.sevenPenalty * 2} penalty cards.`);
        const pen = r.sevenPenalty * 2;
        for (let i = 0; i < pen && r.drawPile.length > 0; i++) hand.push(r.drawPile.shift());
        r.hands[myName] = hand;
        r.sevenPenalty = 0;
        r.currentPlayer = (curIdx + 1) % aPlayers.length;
        r.log = [`${myName} drew ${pen} penalty cards (couldn't counter 7-chain)`, ...(r.log || []).slice(0, 14)];
        await roomSet(roomId, r);
        setSelected([]); return;
      }
    }

    // Remove dropped cards (descending index to preserve positions)
    const sortedIdx = [...selected].sort((a, b) => b - a);
    sortedIdx.forEach(i => hand.splice(i, 1));
    r.discardPile = [...dropping, ...(r.discardPile || [])];

    let logMsg = `${myName} dropped ${dropping.map(c => c.rank + c.suit).join(", ")}`;
    let jumped = false;
    let newPenalty = r.sevenPenalty || 0;

    if (dropRank === "J") {
      jumped = true;
      logMsg += " → Next player SKIPPED!";
    }

    if (dropRank === "7") {
      newPenalty = (r.sevenPenalty || 0) + dropping.length;
      r.sevenPenalty = newPenalty;
      logMsg += ` → 7-chain! Next player draws ${newPenalty * 2} unless they counter`;
    } else {
      r.sevenPenalty = 0;
    }

    // Must draw card if dropped ≤ 2 cards (and not 7)
    if (dropping.length <= 2 && dropRank !== "7") {
      if (r.drawPile.length > 0) {
        hand.push(r.drawPile.shift());
        logMsg += " (drew 1 card)";
      }
    }

    r.hands[myName] = hand;

    // Advance turn
    let next = (curIdx + 1) % aPlayers.length;
    if (jumped) next = (next + 1) % aPlayers.length;
    r.currentPlayer = next;
    r.log = [logMsg, ...(r.log || []).slice(0, 14)];

    await roomSet(roomId, r);
    setSelected([]);
  };

  const takePenalty = async () => {
    if (!isMyTurn || !gs.sevenPenalty) return;
    const r = await roomGet(roomId);
    if (!r) return;
    const pen = (r.sevenPenalty || 0) * 2;
    const hand = [...(r.hands[myName] || [])];
    for (let i = 0; i < pen && r.drawPile.length > 0; i++) hand.push(r.drawPile.shift());
    r.hands[myName] = hand;
    r.sevenPenalty = 0;
    const aPlayers = r.players.filter(p => !p.eliminated);
    const curIdx = (r.currentPlayer || 0) % aPlayers.length;
    r.currentPlayer = (curIdx + 1) % aPlayers.length;
    r.log = [`${myName} drew ${pen} penalty cards`, ...(r.log || []).slice(0, 14)];
    await roomSet(roomId, r);
    setSelected([]);
  };

  const hitShow = async () => {
    if (myCount > 5) { flash(`Your count is ${myCount}. Need ≤ 5 to Show!`); return; }
    const r = await roomGet(roomId);
    if (!r || r.roundOver) return;

    const myC = handScore(r.hands[myName] || [], r.jokerRank);
    const others = r.players.filter(p => !p.eliminated && p.name !== myName);
    const someoneBetter = others.some(p => handScore(r.hands[p.name] || [], r.jokerRank) <= myC);

    let newPlayers = r.players.map(p => {
      if (p.eliminated) return p;
      const pCount = handScore(r.hands[p.name] || [], r.jokerRank);
      let add;
      if (p.name === myName) {
        add = someoneBetter ? 50 : 0; // caller penalty if someone else is equal/lower
      } else {
        add = pCount;
      }
      return { ...p, score: p.score + add, lastAdd: add };
    });

    newPlayers = newPlayers.map(p => ({
      ...p, eliminated: p.eliminated || p.score >= r.maxScore,
    }));

    const remaining = newPlayers.filter(p => !p.eliminated);
    const gameOver = remaining.length <= 1;

    r.players = newPlayers;
    r.showCaller = myName;
    r.roundOver = true;
    r.gameOver = gameOver;
    r.winner = gameOver ? (remaining[0]?.name || null) : null;
    r.log = [
      `${myName} hit SHOW with count ${myC}${someoneBetter ? " — but someone had ≤ count → +50 penalty!" : " 🎉"}`,
      ...(r.log || []).slice(0, 14),
    ];

    await roomSet(roomId, r);
  };

  const nextRound = async () => {
    const r = await roomGet(roomId);
    if (!r) return;
    const active = r.players.filter(p => !p.eliminated);
    if (active.length <= 1) return;

    let deck = shuffle(buildDeck(r.numSets));
    const hands = {};
    for (const p of active) hands[p.name] = deck.splice(0, 7);

    const candidates = deck.filter(c => c.rank !== "J" && c.rank !== "7");
    const jc = candidates[Math.floor(Math.random() * candidates.length)];
    deck.splice(deck.findIndex(c => c.id === jc.id), 1);

    r.hands = hands;
    r.drawPile = deck;
    r.discardPile = [];
    r.jokerRank = jc.rank;
    r.jokerSuit = jc.suit;
    r.currentPlayer = 0;
    r.sevenPenalty = 0;
    r.round = (r.round || 1) + 1;
    r.showCaller = null;
    r.roundOver = false;
    r.gameOver = false;
    r.winner = null;
    r.log = [`Round ${r.round} started! Joker: ${jc.rank}${jc.suit} = 0 pts`];
    // Clear lastAdd
    r.players = r.players.map(p => ({ ...p, lastAdd: undefined }));

    await roomSet(roomId, r);
    setSelected([]);
  };

  // ── Round/Game over overlay ──
  if (gs.roundOver || gs.gameOver) {
    return (
      <RoundOver
        gs={gs}
        myName={myName}
        jokerRank={jokerRank}
        onNextRound={nextRound}
        isHost={gs.host === myName}
      />
    );
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
              <div className="opp-name">{p.name} {isCurrent && "▶"}</div>
              <div className="opp-cards">
                {oppHand.map((_, ci) => (
                  <div key={ci} className="card card-xs back"><div className="back-pat" /></div>
                ))}
              </div>
              <div className="opp-meta">{oppHand.length} cards · {p.score} pts</div>
            </div>
          );
        })}
      </div>

      {/* Table */}
      <div className="table-center">
        <div className="felt-surface">
          {/* Joker */}
          <div className="felt-group">
            <div className="felt-label">JOKER (0 pts)</div>
            <div className="card card-sm" style={{ background: "#fffef9", border: "2px solid gold", position: "relative" }}>
              <span className="corner tl" style={{ color: isRed(gs.jokerSuit) ? "#c0392b" : "#1a1a1a" }}>
                <b>{gs.jokerRank}</b><span>{gs.jokerSuit}</span>
              </span>
              <span className="mid-suit" style={{ color: isRed(gs.jokerSuit) ? "#c0392b" : "#1a1a1a", opacity: 0.15 }}>{gs.jokerSuit}</span>
              <span className="corner br" style={{ color: isRed(gs.jokerSuit) ? "#c0392b" : "#1a1a1a" }}>
                <b>{gs.jokerRank}</b><span>{gs.jokerSuit}</span>
              </span>
              <span style={{ position: "absolute", top: -8, right: -8, background: "gold", borderRadius: "50%", width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#082e1a", fontWeight: 700 }}>★</span>
            </div>
          </div>

          {/* Draw pile */}
          <div className="felt-group">
            <div className="felt-label">DRAW ({gs.drawPile?.length || 0})</div>
            <div className="card card-sm back"><div className="back-pat" /></div>
          </div>

          {/* Discard */}
          <div className="felt-group">
            <div className="felt-label">DISCARD</div>
            {gs.discardPile?.length > 0 ? (
              <div className={`card card-sm ${isRed(gs.discardPile[0].suit) ? "red" : "blk"}`}>
                <span className="corner tl"><b>{gs.discardPile[0].rank}</b><span>{gs.discardPile[0].suit}</span></span>
                <span className="mid-suit">{gs.discardPile[0].suit}</span>
                <span className="corner br"><b>{gs.discardPile[0].rank}</b><span>{gs.discardPile[0].suit}</span></span>
              </div>
            ) : <div className="empty-pile">Empty</div>}
          </div>
        </div>

        {/* 7 penalty banner */}
        {(gs.sevenPenalty || 0) > 0 && (
          <div className="penalty-banner">
            ⚠️ 7-Chain Active! {isMyTurn ? `You must counter with 7s / 3+ same cards, or draw ${gs.sevenPenalty * 2} cards` : `${currentPlayerName} must counter or draw ${gs.sevenPenalty * 2} cards`}
          </div>
        )}

        {/* Log */}
        <div className="log-box">
          {(gs.log || []).slice(0, 4).map((l, i) => (
            <div key={i} className="log-line" style={{ opacity: 1 - i * 0.22 }}>{l}</div>
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
                {isMyTurn && mustTakePenalty && (
                  <button className="act-btn penalty-btn" onClick={takePenalty}>
                    Draw {gs.sevenPenalty * 2} Cards
                  </button>
                )}
                {isMyTurn && !mustTakePenalty && selected.length > 0 && (
                  <button className="act-btn drop-btn" onClick={doAction}>
                    DROP {selected.length} {selected.length > 1 ? "CARDS" : "CARD"}
                    {selected.length <= 2 ? " + DRAW" : ""}
                  </button>
                )}
                {myCount <= 5 && !gs.roundOver && (
                  <button className="act-btn show-btn" onClick={hitShow}>
                    HIT SHOW 🎯
                  </button>
                )}
              </div>
            </div>

            <div className="wait-turn">
              {isMyTurn
                ? mustTakePenalty
                  ? "Your turn — counter with 7s / 3+ same cards, or draw the penalty!"
                  : selected.length === 0
                    ? "Your turn! Tap card(s) of the same rank to select, then DROP."
                    : `Dropping: ${selected.map(i => myHand[i].rank + myHand[i].suit).join(", ")} — click DROP to confirm`
                : `Waiting for ${currentPlayerName}…`
              }
            </div>

            <div className="hand-row">
              {myHand.map((card, idx) => (
                <CardFace
                  key={card.id}
                  card={card}
                  selected={selected.includes(idx)}
                  onClick={isMyTurn && !mustTakePenalty ? () => toggleSelect(idx) : undefined}
                  isJoker={card.rank === jokerRank}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Score strip */}
      <div className="scores-strip">
        {(gs.players || []).map((p, i) => (
          <div key={i} className={`score-chip ${p.eliminated ? "elim-chip" : ""} ${p.name === currentPlayerName ? "active-chip" : ""}`}>
            <span>{p.name}</span>
            <span className="sc">{p.score}</span>
          </div>
        ))}
      </div>

      {flashMsg && <div className="flash-msg">{flashMsg}</div>}
    </div>
  );
}

// ─── Round Over ───────────────────────────────────────────────────────────────
function RoundOver({ gs, myName, jokerRank, onNextRound, isHost }) {
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
            <tr>
              <th>Player</th>
              <th>Hand</th>
              <th>Count</th>
              <th>Added</th>
              <th>Total</th>
              <th>Status</th>
            </tr>
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
              Eliminated at {gs.maxScore} pts · Remaining: {(gs.players || []).filter(p => !p.eliminated).map(p => p.name).join(", ")}
            </div>
            {isHost ? (
              <button className="cta" onClick={onNextRound}>NEXT ROUND ▶</button>
            ) : (
              <p className="wait-hint">Waiting for <b>{gs.host}</b> to start next round…</p>
            )}
          </>
        )}
        {gs.gameOver && (
          <button className="cta" onClick={() => window.location.reload()}>PLAY AGAIN</button>
        )}
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

  const handleJoin = (code, name, host) => {
    setRoomId(code); setMyName(name); setIsHost(host);
    setPhase("waiting");
  };

  const handleGameStart = (gs) => {
    setGameState(gs); setPhase("game");
  };

  return (
    <>
      <style>{CSS}</style>
      {phase === "lobby" && <Lobby onJoin={handleJoin} />}
      {phase === "waiting" && <WaitingRoom roomId={roomId} myName={myName} isHost={isHost} onGameStart={handleGameStart} />}
      {phase === "game" && <GameScreen roomId={roomId} myName={myName} initialState={gameState} />}
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=Nunito:wght@300;400;600;700&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
:root{
  --bg:#080f0d;--felt:#0c3d22;--felt2:#0e4a29;
  --gold:#d4a843;--gold2:#f0c96a;
  --cream:#f0ebe0;--red:#c0392b;--blk:#1a1a1a;
  --border:rgba(212,168,67,0.25);
}
body{font-family:'Nunito',sans-serif;background:var(--bg);color:var(--cream);min-height:100vh;overflow-x:hidden;}

/* Lobby */
.lobby{min-height:100vh;display:flex;align-items:center;justify-content:center;
  background:radial-gradient(ellipse at 50% -10%,#1a5c35,#080f0d 65%);padding:20px;}
.lobby-card{background:rgba(8,20,12,0.97);border:1px solid var(--border);border-radius:24px;
  padding:40px 36px;width:100%;max-width:560px;
  box-shadow:0 40px 100px rgba(0,0,0,0.7),inset 0 1px 0 rgba(212,168,67,0.15);}
.brand{font-family:'Cinzel',serif;font-size:36px;color:var(--gold);letter-spacing:6px;text-align:center;margin-bottom:4px;}
.brand span{background:linear-gradient(135deg,var(--gold),var(--gold2));-webkit-background-clip:text;-webkit-text-fill-color:transparent;}
.brand-sub{text-align:center;font-size:12px;letter-spacing:2px;color:rgba(240,235,224,0.4);text-transform:uppercase;margin-bottom:28px;}
.tab-row{display:flex;background:rgba(255,255,255,0.04);border-radius:10px;padding:4px;margin-bottom:24px;border:1px solid rgba(255,255,255,0.07);}
.tab{flex:1;padding:10px;border:none;background:transparent;color:rgba(240,235,224,0.5);
  font-family:'Nunito',sans-serif;font-size:13px;letter-spacing:1px;text-transform:uppercase;cursor:pointer;border-radius:8px;transition:all 0.2s;}
.tab.on{background:var(--gold);color:#080f0d;font-weight:700;}
.field{margin-bottom:18px;}
.field-row{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
.field label{display:block;font-size:10px;letter-spacing:2px;color:var(--gold);text-transform:uppercase;margin-bottom:8px;}
.field input{width:100%;background:rgba(255,255,255,0.05);border:1px solid rgba(212,168,67,0.2);
  border-radius:10px;padding:12px 14px;color:var(--cream);font-size:15px;
  font-family:'Nunito',sans-serif;outline:none;transition:border-color 0.15s;}
.field input:focus{border-color:var(--gold);}
.code-input{text-transform:uppercase!important;letter-spacing:6px;font-size:22px;text-align:center;font-weight:700;}
.mini-btns{display:flex;flex-wrap:wrap;gap:6px;}
.nb{width:36px;height:36px;border-radius:7px;border:1px solid rgba(212,168,67,0.2);
  background:rgba(255,255,255,0.04);color:var(--cream);font-size:13px;cursor:pointer;font-family:'Nunito',sans-serif;transition:all 0.15s;}
.nb:hover{border-color:var(--gold);}
.nb.on{background:var(--gold);color:#080f0d;font-weight:700;border-color:var(--gold);}
.score-slider-row{display:flex;align-items:center;gap:14px;}
.slider{flex:1;-webkit-appearance:none;height:4px;border-radius:2px;background:rgba(212,168,67,0.2);outline:none;}
.slider::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:50%;background:var(--gold);cursor:pointer;}
.slider-val{font-size:20px;font-weight:700;color:var(--gold);min-width:50px;text-align:right;}
.cta{width:100%;padding:16px;margin-top:8px;background:linear-gradient(135deg,var(--gold),#a07830);
  border:none;border-radius:12px;color:#080f0d;font-size:16px;font-weight:700;letter-spacing:3px;
  cursor:pointer;font-family:'Nunito',sans-serif;transition:all 0.2s;text-transform:uppercase;}
.cta:hover{transform:translateY(-2px);box-shadow:0 10px 30px rgba(212,168,67,0.35);}
.cta:active{transform:translateY(0);}
.cta:disabled{opacity:0.5;cursor:not-allowed;transform:none;}
.err{color:#e74c3c;font-size:13px;margin-bottom:8px;text-align:center;}
.lobby-hint{text-align:center;font-size:12px;color:rgba(240,235,224,0.3);margin-top:16px;}

/* Waiting */
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

/* Cards */
.card{background:#fffef9;border:1px solid #d4c5a9;border-radius:8px;position:relative;flex-shrink:0;user-select:none;transition:transform 0.15s,box-shadow 0.15s;}
.card-md{width:68px;height:96px;}
.card-sm{width:54px;height:76px;}
.card-xs{width:32px;height:46px;}
.card.tap{cursor:pointer;}
.card.tap:hover{transform:translateY(-8px);box-shadow:0 14px 28px rgba(0,0,0,0.5);}
.card.sel{transform:translateY(-16px);box-shadow:0 18px 36px rgba(212,168,67,0.5),0 0 0 2px var(--gold);}
.card.joker-glow{box-shadow:0 0 0 2px gold,0 4px 20px rgba(255,215,0,0.4);}
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

/* Game */
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
.felt-surface{background:radial-gradient(ellipse,#1a6b3a,#0c3d22);border-radius:20px;border:3px solid rgba(212,168,67,0.2);
  padding:20px 28px;display:flex;gap:28px;align-items:center;justify-content:center;flex-wrap:wrap;
  box-shadow:inset 0 2px 20px rgba(0,0,0,0.4);}
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
.drop-btn{background:var(--gold);color:#080f0d;}
.drop-btn:hover{box-shadow:0 4px 16px rgba(212,168,67,0.4);transform:translateY(-1px);}
.show-btn{background:linear-gradient(135deg,#2ecc71,#27ae60);color:#fff;animation:pulse-show 1.5s infinite;}
@keyframes pulse-show{0%,100%{box-shadow:0 0 0 0 rgba(46,204,113,0.5);}50%{box-shadow:0 0 0 8px rgba(46,204,113,0);}}
.penalty-btn{background:#e74c3c;color:#fff;}
.wait-turn{font-size:12px;color:rgba(240,235,224,0.4);margin-bottom:8px;min-height:18px;}
.hand-row{display:flex;gap:8px;overflow-x:auto;padding:4px 0 2px;}
.flash-msg{position:fixed;top:70px;left:50%;transform:translateX(-50%);background:rgba(231,76,60,0.92);
  color:#fff;padding:10px 22px;border-radius:10px;font-size:14px;font-weight:600;z-index:999;
  pointer-events:none;animation:fadeFlash 3s forwards;white-space:nowrap;}
@keyframes fadeFlash{0%,75%{opacity:1;}100%{opacity:0;}}
.scores-strip{display:flex;flex-wrap:wrap;gap:6px;padding:8px 18px;background:rgba(0,0,0,0.3);border-top:1px solid rgba(255,255,255,0.05);}
.score-chip{display:flex;align-items:center;gap:6px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.07);border-radius:20px;padding:4px 12px;font-size:12px;}
.score-chip.active-chip{background:rgba(212,168,67,0.12);border-color:var(--gold);}
.score-chip.elim-chip{opacity:0.35;text-decoration:line-through;}
.sc{color:var(--gold);font-weight:700;}

/* Round Over */
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
::-webkit-scrollbar{height:4px;width:4px;}
::-webkit-scrollbar-track{background:transparent;}
::-webkit-scrollbar-thumb{background:rgba(212,168,67,0.3);border-radius:2px;}
`;
