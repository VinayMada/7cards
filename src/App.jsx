import { useState } from "react";
import { db } from "./firebase.js";
import { ref, set, get } from "firebase/database";

const SUITS = ["♠","♥","♦","♣"];
const RANKS = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];

function genRoomCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

async function roomGet(roomId) {
  try {
    const snap = await get(ref(db, `rooms/${roomId}`));
    return snap.exists() ? snap.val() : null;
  } catch {
    return null;
  }
}

async function roomSet(roomId, state) {
  try {
    await set(ref(db, `rooms/${roomId}`), state);
  } catch (e) {
    console.error("roomSet error", e);
  }
}

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
    if (!name.trim()) {
      setErr("Enter your name");
      return;
    }

    setLoading(true);
    setErr("");

    const code = genRoomCode();

    const room = {
      code,
      host: name.trim(),
      maxPlayers: numPlayers,
      numSets,
      maxScore,
      players: [
        {
          name: name.trim(),
          score: 0,
          eliminated: false,
        },
      ],
      phase: "lobby",
      log: ["Room created. Waiting for players…"],
    };

    await roomSet(code, room);
    onJoin(code, name.trim(), true);
    setLoading(false);
  };

  const handleJoin = async () => {
    if (!name.trim()) {
      setErr("Enter your name");
      return;
    }

    if (!roomCode.trim()) {
      setErr("Enter room code");
      return;
    }

    setLoading(true);
    setErr("");

    const room = await roomGet(roomCode.toUpperCase());

    if (!room) {
      setErr("Room not found");
      setLoading(false);
      return;
    }

    if (room.phase !== "lobby") {
      setErr("Game already started");
      setLoading(false);
      return;
    }

    if (room.players.length >= room.maxPlayers) {
      setErr("Room is full");
      setLoading(false);
      return;
    }

    room.players.push({
      name: name.trim(),
      score: 0,
      eliminated: false,
    });

    await roomSet(roomCode.toUpperCase(), room);
    onJoin(roomCode.toUpperCase(), name.trim(), false);
    setLoading(false);
  };

  return (
    <div className="lobby">
      <div className="lobby-card">
        <h1>🃏 LOW CARD</h1>

        <div className="tabs">
          <button
            onClick={() => setMode("create")}
            className={mode === "create" ? "active" : ""}
          >
            Create Room
          </button>

          <button
            onClick={() => setMode("join")}
            className={mode === "join" ? "active" : ""}
          >
            Join Room
          </button>
        </div>

        <input
          type="text"
          placeholder="Your Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        {mode === "create" ? (
          <>
            <div className="options">
              <label>Players: {numPlayers}</label>
              <input
                type="range"
                min="2"
                max="12"
                value={numPlayers}
                onChange={(e) => setNumPlayers(Number(e.target.value))}
              />

              <label>Card Sets: {numSets}</label>
              <input
                type="range"
                min="1"
                max="4"
                value={numSets}
                onChange={(e) => setNumSets(Number(e.target.value))}
              />

              <label>Max Score: {maxScore}</label>
              <input
                type="range"
                min="50"
                max="500"
                step="50"
                value={maxScore}
                onChange={(e) => setMaxScore(Number(e.target.value))}
              />
            </div>

            <button onClick={handleCreate} disabled={loading}>
              {loading ? "Creating..." : "Create Room"}
            </button>
          </>
        ) : (
          <>
            <input
              type="text"
              placeholder="Room Code"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            />

            <button onClick={handleJoin} disabled={loading}>
              {loading ? "Joining..." : "Join Room"}
            </button>
          </>
        )}

        {err && <p style={{ color: "red" }}>{err}</p>}

        <div style={{ marginTop: "20px" }}>
          Available Suits: {SUITS.join(" ")}
          <br />
          Ranks: {RANKS.join(", ")}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [roomId, setRoomId] = useState(null);
  const [myName, setMyName] = useState(null);

  const handleJoin = (code, name) => {
    setRoomId(code);
    setMyName(name);
  };

  return (
    <div>
      {!roomId ? (
        <Lobby onJoin={handleJoin} />
      ) : (
        <div style={{ padding: "20px" }}>
          <h2>Welcome {myName}</h2>
          <p>Room ID: {roomId}</p>
        </div>
      )}
    </div>
  );
}
