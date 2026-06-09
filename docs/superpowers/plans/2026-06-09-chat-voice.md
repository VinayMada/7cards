# Chat & Voice Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real-time group text chat (Firebase) and always-on voice chat (Agora RTC) to the LowCard multiplayer card game.

**Architecture:** A new `src/Chat.jsx` file contains all chat/voice logic — two hooks (`useChat`, `useVoice`) and four UI components (`ChatButton`, `ChatPopup`, `VoiceMicButton`, `VoiceIndicator`). `GameScreen` in `App.jsx` imports these and wires them in. No changes to game logic or Firebase game state.

**Tech Stack:** React hooks, Firebase Realtime Database (text messages), `agora-rtc-sdk-ng` (voice), CSS-in-JS (styled via `const CSS` in App.jsx).

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `src/Chat.jsx` | **Create** | All chat + voice hooks and components |
| `src/App.jsx` | **Modify** | Import/render chat+voice in `GameScreen` + add CSS |
| `.env` | **Modify** | Add `REACT_APP_AGORA_APP_ID` |

---

## Task 1: Install Package + Configure Env

**Files:**
- Modify: `.env` (project root)
- Modify: `package.json` (via npm)

- [ ] **Step 1: Install Agora SDK**

```bash
cd ~/Videos/lowcard-game/lowcard
npm install agora-rtc-sdk-ng
```

Expected: `added 1 package` (or similar), no errors.

- [ ] **Step 2: Add Agora App ID to .env**

Open `.env` (create it at `lowcard/.env` if it doesn't exist) and add:

```
REACT_APP_AGORA_APP_ID=e1b7d0479d5b4b86a8dafd3b197eefab
```

- [ ] **Step 3: Verify env loads**

```bash
node -e "require('dotenv').config(); console.log(process.env.REACT_APP_AGORA_APP_ID)"
```

Expected output: `e1b7d0479d5b4b86a8dafd3b197eefab`

(CRA automatically loads `.env` at build time — no extra config needed.)

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json .env
git commit -m "Add agora-rtc-sdk-ng, configure Agora App ID env var"
```

---

## Task 2: Create src/Chat.jsx — Text Chat

**Files:**
- Create: `src/Chat.jsx`

- [ ] **Step 1: Create the file with imports and useChat hook**

Create `src/Chat.jsx` with the following content:

```jsx
import { useState, useEffect, useRef, useCallback } from "react";
import { ref, push, onValue } from "firebase/database";
import { db } from "./firebase";
import AgoraRTC from "agora-rtc-sdk-ng";

const AGORA_APP_ID = process.env.REACT_APP_AGORA_APP_ID;

// ─── Text Chat Hook ────────────────────────────────────────────────────────────
export function useChat(roomId) {
  const [messages, setMessages] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const lastSeenRef = useRef(0);

  useEffect(() => {
    if (!roomId) return;
    const chatRef = ref(db, `rooms/${roomId}/chat`);
    const unsub = onValue(chatRef, snap => {
      if (!snap.exists()) { setMessages([]); setUnreadCount(0); return; }
      const msgs = Object.values(snap.val()).sort((a, b) => a.time - b.time);
      setMessages(msgs);
      setUnreadCount(Math.max(0, msgs.length - lastSeenRef.current));
    });
    return unsub;
  }, [roomId]);

  const markRead = useCallback((currentLength) => {
    lastSeenRef.current = currentLength;
    setUnreadCount(0);
  }, []);

  const sendMessage = useCallback(async (name, text) => {
    if (!text.trim() || !roomId) return;
    await push(ref(db, `rooms/${roomId}/chat`), {
      name,
      text: text.trim(),
      time: Date.now(),
    });
  }, [roomId]);

  return { messages, sendMessage, unreadCount, markRead };
}

// ─── Voice Hook ────────────────────────────────────────────────────────────────
export function useVoice(roomId, myName) {
  const [joined, setJoined] = useState(false);
  const [muted, setMuted] = useState(false);
  const [speakingUsers, setSpeakingUsers] = useState(new Set());
  const clientRef = useRef(null);
  const trackRef = useRef(null);

  useEffect(() => {
    const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
    clientRef.current = client;

    client.on("user-published", async (user, mediaType) => {
      await client.subscribe(user, mediaType);
      if (mediaType === "audio") user.audioTrack.play();
    });

    client.on("volume-indicator", volumes => {
      setSpeakingUsers(new Set(
        volumes.filter(v => v.level > 5).map(v => String(v.uid))
      ));
    });

    return () => {
      if (trackRef.current) {
        trackRef.current.stop();
        trackRef.current.close();
        trackRef.current = null;
      }
      client.leave().catch(() => {});
      client.removeAllListeners();
    };
  }, []);

  const join = async () => {
    const client = clientRef.current;
    if (!client || joined) return;
    try {
      await client.join(AGORA_APP_ID, roomId, null, myName);
      const track = await AgoraRTC.createMicrophoneAudioTrack();
      trackRef.current = track;
      await client.publish(track);
      client.enableAudioVolumeIndicator();
      setJoined(true);
      setMuted(false);
    } catch (e) {
      console.error("Voice join failed:", e);
    }
  };

  const leave = async () => {
    const client = clientRef.current;
    if (trackRef.current) {
      trackRef.current.stop();
      trackRef.current.close();
      trackRef.current = null;
    }
    if (client) await client.leave().catch(() => {});
    setJoined(false);
    setMuted(false);
    setSpeakingUsers(new Set());
  };

  const toggleMute = () => {
    if (!trackRef.current) return;
    const newMuted = !muted;
    trackRef.current.setEnabled(!newMuted);
    setMuted(newMuted);
  };

  return { joined, muted, join, leave, toggleMute, speakingUsers };
}

// ─── ChatButton ────────────────────────────────────────────────────────────────
export function ChatButton({ unreadCount, onClick }) {
  return (
    <button className="chat-icon-btn" onClick={onClick} title="Open chat">
      💬
      {unreadCount > 0 && (
        <span className="chat-badge">{unreadCount > 9 ? "9+" : unreadCount}</span>
      )}
    </button>
  );
}

// ─── ChatPopup ─────────────────────────────────────────────────────────────────
export function ChatPopup({ messages, myName, sendMessage, onClose }) {
  const [input, setInput] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleSend = () => {
    if (!input.trim()) return;
    sendMessage(myName, input);
    setInput("");
  };

  const handleKey = (e) => {
    if (e.key === "Enter") handleSend();
  };

  const fmt = (time) => {
    const d = new Date(time);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="chat-overlay" onClick={onClose}>
      <div className="chat-popup" onClick={e => e.stopPropagation()}>
        <div className="chat-header">
          <span className="chat-title">Room Chat</span>
          <button className="chat-close" onClick={onClose}>✕</button>
        </div>
        <div className="chat-messages">
          {messages.length === 0 && (
            <div className="chat-empty">No messages yet. Say hello!</div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`chat-msg ${m.name === myName ? "chat-msg-mine" : ""}`}>
              <span className="chat-msg-name">{m.name}</span>
              <span className="chat-msg-text">{m.text}</span>
              <span className="chat-msg-time">{fmt(m.time)}</span>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
        <div className="chat-input-row">
          <input
            className="chat-input"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Type a message..."
            maxLength={200}
            autoFocus
          />
          <button className="chat-send-btn" onClick={handleSend}>Send</button>
        </div>
      </div>
    </div>
  );
}

// ─── VoiceMicButton ────────────────────────────────────────────────────────────
export function VoiceMicButton({ joined, muted, onJoin, onLeave, onToggleMute }) {
  if (!joined) {
    return (
      <button className="voice-mic-btn voice-off" onClick={onJoin} title="Join voice chat">
        🎤
      </button>
    );
  }
  return (
    <span className="voice-controls">
      <button
        className={`voice-mic-btn ${muted ? "voice-muted" : "voice-on"}`}
        onClick={onToggleMute}
        title={muted ? "Unmute" : "Mute"}
      >
        {muted ? "🔇" : "🎤"}
      </button>
      <button className="voice-leave-btn" onClick={onLeave} title="Leave voice">✕</button>
    </span>
  );
}

// ─── VoiceIndicator ────────────────────────────────────────────────────────────
export function VoiceIndicator({ playerName, speakingUsers, voiceUsers }) {
  const inVoice = voiceUsers?.has(playerName);
  const isSpeaking = speakingUsers?.has(playerName);
  if (!inVoice) return null;
  return (
    <span className={`voice-dot ${isSpeaking ? "voice-speaking" : "voice-silent"}`} title={isSpeaking ? "Speaking" : "In voice"}>
      🎤
    </span>
  );
}
```

- [ ] **Step 2: Verify file saved cleanly**

```bash
node -e "require('./src/Chat.jsx')" 2>&1 || echo "Check — CRA uses Babel so this is OK"
wc -l src/Chat.jsx
```

Expected: file exists, no obvious syntax errors visible, ~160 lines.

- [ ] **Step 3: Commit**

```bash
git add src/Chat.jsx
git commit -m "Add Chat.jsx: useChat, useVoice, ChatButton, ChatPopup, VoiceMicButton, VoiceIndicator"
```

---

## Task 3: Wire Chat into GameScreen (App.jsx)

**Files:**
- Modify: `src/App.jsx`

The plan below shows the exact `old_string` → `new_string` for each edit.

- [ ] **Step 1: Add import at top of App.jsx**

Find this line (line ~5, after the StatusBar import):
```js
import { Purchases, LOG_LEVEL } from "@capgo/capacitor-purchases";
```

Add after it:
```js
import { useChat, useVoice, ChatButton, ChatPopup, VoiceMicButton, VoiceIndicator } from "./Chat";
```

- [ ] **Step 2: Add hooks + showChat state to GameScreen**

Find the block in `GameScreen` (around line 459–462):
```js
  const [handOrder, setHandOrder] = useState(null); // null = use natural Firebase order
  const handOrderRef = useRef(null); // tracks hand length to auto-reset on change
```

Add after it:
```js
  const [showChat, setShowChat] = useState(false);
  const { messages, sendMessage, unreadCount, markRead } = useChat(roomId);
  const { joined: voiceJoined, muted: voiceMuted, join: joinVoice, leave: leaveVoice,
          toggleMute: toggleVoiceMute, speakingUsers } = useVoice(roomId, myName);
  const [voiceUsers, setVoiceUsers] = useState(new Set());
```

- [ ] **Step 3: Sync voiceUsers via Firebase**

Voice users are tracked in Firebase so all players can see who is in voice. Add this `useEffect` right after the existing real-time listener `useEffect` (around line 498):

```js
  // Track which players have joined voice (stored in Firebase)
  useEffect(() => {
    if (!roomId) return;
    const voiceRef = ref(db, `rooms/${roomId}/voice`);
    const unsub = onValue(voiceRef, snap => {
      if (!snap.exists()) { setVoiceUsers(new Set()); return; }
      setVoiceUsers(new Set(Object.keys(snap.val()).filter(k => snap.val()[k])));
    });
    return unsub;
  }, [roomId]);
```

- [ ] **Step 4: Update join/leave voice to write to Firebase**

Still in `GameScreen`, add a `joinVoiceAndFlag` helper right before the `return (` statement (around line 1000):

```js
  const joinVoiceAndFlag = async () => {
    await joinVoice();
    await set(ref(db, `rooms/${roomId}/voice/${myName}`), true);
  };
  const leaveVoiceAndFlag = async () => {
    await leaveVoice();
    await set(ref(db, `rooms/${roomId}/voice/${myName}`), false);
  };
```

- [ ] **Step 5: Add ChatButton + VoiceIndicator to each opponent chip**

Find this block in the `opp-chip-stats` div (around line 1041–1043):
```jsx
              <div className="opp-chip-stats">
                <span className="opp-chip-cards">🃏 {oppHand.length}</span>
                <span className="opp-chip-score">{p.score} pts</span>
                {(() => { const afkL = 5 - (gs.afkCounts?.[p.name] || 0); return <span className={`afk-badge ${afkL <= 1 ? "afk-danger" : afkL <= 2 ? "afk-warn" : ""}`}>❤️{afkL}</span>; })()}
              </div>
```

Replace with:
```jsx
              <div className="opp-chip-stats">
                <span className="opp-chip-cards">🃏 {oppHand.length}</span>
                <ChatButton unreadCount={unreadCount} onClick={() => { setShowChat(true); markRead(messages.length); }} />
                <VoiceIndicator playerName={p.name} speakingUsers={speakingUsers} voiceUsers={voiceUsers} />
                <span className="opp-chip-score">{p.score} pts</span>
                {(() => { const afkL = 5 - (gs.afkCounts?.[p.name] || 0); return <span className={`afk-badge ${afkL <= 1 ? "afk-danger" : afkL <= 2 ? "afk-warn" : ""}`}>❤️{afkL}</span>; })()}
              </div>
```

- [ ] **Step 6: Add ChatButton + VoiceIndicator to my-info**

Find (around line 1166–1170):
```jsx
              <div className="my-info">
                <span className="my-name">{myName}</span>
                <span className={`my-count ${myCount <= 5 ? "low-count" : ""}`}>Count: {myCount}</span>
                {(() => { const myLives = 5 - (gs.afkCounts?.[myName] || 0); return <span className={`afk-badge ${myLives <= 1 ? "afk-danger" : myLives <= 2 ? "afk-warn" : ""}`}>❤️{myLives}</span>; })()}
              </div>
```

Replace with:
```jsx
              <div className="my-info">
                <span className="my-name">{myName}</span>
                <span className={`my-count ${myCount <= 5 ? "low-count" : ""}`}>Count: {myCount}</span>
                <ChatButton unreadCount={unreadCount} onClick={() => { setShowChat(true); markRead(messages.length); }} />
                <VoiceIndicator playerName={myName} speakingUsers={speakingUsers} voiceUsers={voiceUsers} />
                {(() => { const myLives = 5 - (gs.afkCounts?.[myName] || 0); return <span className={`afk-badge ${myLives <= 1 ? "afk-danger" : myLives <= 2 ? "afk-warn" : ""}`}>❤️{myLives}</span>; })()}
              </div>
```

- [ ] **Step 7: Add VoiceMicButton to wait-turn-row**

Find (around line 1224–1229):
```jsx
              {!pendingDraw && (
                <span className="sort-btns">
                  <button className="sort-btn" onClick={() => sortHand("asc")} title="Sort low to high">↑</button>
                  <button className="sort-btn" onClick={() => sortHand("desc")} title="Sort high to low">↓</button>
                </span>
              )}
```

Replace with:
```jsx
              {!pendingDraw && (
                <span className="sort-btns">
                  <button className="sort-btn" onClick={() => sortHand("asc")} title="Sort low to high">↑</button>
                  <button className="sort-btn" onClick={() => sortHand("desc")} title="Sort high to low">↓</button>
                </span>
              )}
              <VoiceMicButton
                joined={voiceJoined}
                muted={voiceMuted}
                onJoin={joinVoiceAndFlag}
                onLeave={leaveVoiceAndFlag}
                onToggleMute={toggleVoiceMute}
              />
```

- [ ] **Step 8: Add ChatPopup to GameScreen return**

Find the closing of the `game-wrap` div (just before `</div>` at end of GameScreen return):

The last element inside `game-wrap` before its closing `</div>` is the scoreboard modal. Find it — it looks like:
```jsx
      {showScoreBoard && (
        <div className="sb-overlay" onClick={() => setShowScoreBoard(false)}>
```

Add right before the closing `</div>` of `game-wrap`:
```jsx
      {showChat && (
        <ChatPopup
          messages={messages}
          myName={myName}
          sendMessage={sendMessage}
          onClose={() => { setShowChat(false); markRead(messages.length); }}
        />
      )}
```

- [ ] **Step 9: Add ref import for voiceRef usage**

The `ref` function from Firebase is already imported in App.jsx (`import { ref, set, get, remove, onValue, off } from "firebase/database"`). Verify `set` is in that import — it is. No changes needed.

- [ ] **Step 10: Commit**

```bash
git add src/App.jsx
git commit -m "Wire chat and voice into GameScreen"
```

---

## Task 4: Add CSS

**Files:**
- Modify: `src/App.jsx` (CSS string at bottom)

- [ ] **Step 1: Add chat + voice CSS to the CSS constant in App.jsx**

Find this line in the `CSS` constant (near bottom of App.jsx):
```css
.sub-btn{background:linear-gradient(135deg,#d4a843,#f0c96a);color:#080f0d;}
.sub-btn:hover{transform:translateY(-1px);filter:brightness(1.1);}
.sub-msg{font-size:13px;color:#f0c96a;text-align:center;margin:8px 0 0;padding:6px 10px;background:rgba(212,168,67,0.1);border-radius:6px;}
```

Add after it:
```css
/* ── Chat ── */
.chat-icon-btn{background:none;border:none;cursor:pointer;font-size:14px;padding:2px 4px;position:relative;line-height:1;}
.chat-badge{position:absolute;top:-4px;right:-4px;background:#e74c3c;color:#fff;border-radius:50%;width:14px;height:14px;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center;line-height:1;}
.chat-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:200;display:flex;align-items:center;justify-content:center;padding:16px;}
.chat-popup{background:#0c1f18;border:1px solid rgba(212,168,67,0.3);border-radius:16px;width:100%;max-width:420px;max-height:70vh;display:flex;flex-direction:column;overflow:hidden;}
.chat-header{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid rgba(212,168,67,0.15);}
.chat-title{font-family:'Cinzel',serif;color:var(--gold);font-size:14px;letter-spacing:2px;}
.chat-close{background:none;border:none;color:rgba(240,235,224,0.5);font-size:16px;cursor:pointer;padding:2px 6px;}
.chat-close:hover{color:var(--cream);}
.chat-messages{flex:1;overflow-y:auto;padding:12px 16px;display:flex;flex-direction:column;gap:8px;min-height:0;}
.chat-empty{color:rgba(240,235,224,0.35);font-size:13px;text-align:center;margin:auto;}
.chat-msg{display:flex;flex-direction:column;gap:1px;}
.chat-msg-mine .chat-msg-name{color:var(--gold);}
.chat-msg-name{font-size:11px;font-weight:700;color:rgba(240,235,224,0.6);text-transform:uppercase;letter-spacing:0.5px;}
.chat-msg-text{font-size:13px;color:var(--cream);word-break:break-word;}
.chat-msg-time{font-size:10px;color:rgba(240,235,224,0.3);}
.chat-input-row{display:flex;gap:8px;padding:10px 16px;border-top:1px solid rgba(212,168,67,0.15);}
.chat-input{flex:1;background:rgba(255,255,255,0.07);border:1px solid rgba(212,168,67,0.2);border-radius:8px;color:var(--cream);font-size:13px;padding:8px 10px;outline:none;font-family:'Nunito',sans-serif;}
.chat-input:focus{border-color:rgba(212,168,67,0.5);}
.chat-send-btn{background:var(--gold);color:#080f0d;border:none;border-radius:8px;padding:8px 14px;font-weight:700;font-size:12px;cursor:pointer;font-family:'Nunito',sans-serif;}
.chat-send-btn:hover{filter:brightness(1.1);}
/* ── Voice ── */
.voice-mic-btn{border:none;border-radius:6px;padding:4px 7px;font-size:13px;cursor:pointer;font-family:'Nunito',sans-serif;}
.voice-off{background:rgba(255,255,255,0.1);color:rgba(240,235,224,0.5);}
.voice-off:hover{background:rgba(255,255,255,0.18);color:var(--cream);}
.voice-on{background:rgba(39,174,96,0.25);color:#2ecc71;}
.voice-muted{background:rgba(192,57,43,0.25);color:#e74c3c;}
.voice-controls{display:flex;align-items:center;gap:3px;}
.voice-leave-btn{background:none;border:none;color:rgba(240,235,224,0.4);font-size:11px;cursor:pointer;padding:2px 4px;}
.voice-leave-btn:hover{color:#e74c3c;}
.voice-dot{font-size:10px;line-height:1;}
.voice-speaking{animation:pulse-show 0.8s infinite;}
```

- [ ] **Step 2: Check build compiles**

```bash
npm run build 2>&1 | tail -20
```

Expected: `Compiled successfully.`

If you get `Module not found: @capgo/capacitor-purchases` — that plugin isn't installed yet (from the subscription task). Add a mock at the top of App.jsx temporarily, or install it:
```bash
npm install @capgo/capacitor-purchases
```

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "Add CSS for chat popup, chat badge, voice mic button, speaking indicator"
```

---

## Task 5: Manual Verification + Push

**Files:** none (testing only)

- [ ] **Step 1: Start dev server**

```bash
npm start
```

Open browser to `http://localhost:3000`.

- [ ] **Step 2: Test text chat**

1. Create a room, join with two browser tabs (different names)
2. Verify 💬 icon appears next to card count in the opponent chip and in my-info area
3. Click 💬 → popup opens with "No messages yet" empty state
4. Type a message → click Send (or press Enter)
5. Switch to the other tab — verify message appears in real time
6. Close popup → reopen → verify red badge count appeared before reopening
7. Verify badge clears when popup opens

- [ ] **Step 3: Test voice chat**

1. Open two tabs in the same room
2. Click 🎤 button in the wait-turn-row in tab 1 — button should turn green
3. Check console — no Agora errors
4. Click 🎤 in tab 2 — tab 2 joins voice
5. Speak into mic on tab 1 — green pulse ring should appear on tab 1's player name in tab 2's view (within ~2 seconds)
6. Click 🎤 on tab 1 (now green) → should turn red (muted)
7. Click ✕ leave button → mic turns grey, back to off state

- [ ] **Step 4: Push to GitHub (triggers APK build)**

```bash
git push origin master
```

GitHub Actions will build and sign the APK. Download from Actions → latest run → Artifacts.

---

## Notes

- **Agora token auth:** Currently using `null` token (works in Agora "testing mode" for up to 10,000 min/month). For production scale, generate tokens server-side using the Agora token builder. This is optional for now.
- **Firebase voice presence:** Voice user presence is written to `rooms/{roomId}/voice/{playerName}`. On abnormal disconnect (app crash), the flag may stay `true`. It clears when `leaveVoiceAndFlag` is called. A Firebase `onDisconnect` rule can auto-clear this — add later if needed.
- **`@capgo/capacitor-purchases`:** If not yet installed (from subscription task), install it before running `npm run build` — the import in App.jsx will cause a compile error otherwise.
