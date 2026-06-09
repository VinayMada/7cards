# Chat & Voice Chat Design — LowCard Game

**Date:** 2026-06-09
**Status:** Approved

---

## Overview

Add two communication features to the LowCard multiplayer card game:
1. **Text chat** — shared group chat per room, stored in Firebase
2. **Voice chat** — always-on open mic via Agora RTC, opt-in per player

Both features work in the Capacitor Android APK and in the browser (Vercel deployment). No native Android changes required.

---

## Text Chat

### Data Model

New Firebase path, separate from game state so chat messages do not trigger game re-renders:

```
rooms/{roomId}/chat/{pushKey} = {
  name: string,   // player name
  text: string,   // message content
  time: number    // Date.now() timestamp
}
```

Messages are append-only. On room deletion (game ends, host exits), the entire `rooms/{roomId}` node is removed — chat is cleaned up automatically.

### UI

- A 💬 icon button appears next to each player's card count in the player strip at the top of the game screen
- When new messages arrive while the popup is closed, a red dot badge appears on the icon
- Tapping the icon opens a centered modal popup containing:
  - Scrollable message list (newest at bottom), showing `PlayerName: message` with relative time
  - A text input + Send button at the bottom
  - Close button (✕) in the top-right corner
- The popup is shared — all players see the same group chat; tapping any player's icon opens the same popup

### Component

New file: `src/Chat.jsx`

Exports:
- `useChat(roomId)` — hook that subscribes to `rooms/{roomId}/chat`, returns `{ messages, sendMessage, unreadCount, markRead }`
- `<ChatButton unreadCount onClick />` — the 💬 icon with red badge
- `<ChatPopup roomId myName onClose />` — the full popup with message list and input

`GameScreen` in `App.jsx` imports and renders these. `useChat` uses a separate `onValue` listener — not mixed into the existing game state listener.

---

## Voice Chat

### Service

**Agora RTC** (`agora-rtc-sdk-ng`)
- Free tier: 10,000 minutes/month
- JavaScript SDK works in browser and Capacitor WebView (no native plugin needed)
- No self-hosted server required — Agora manages infrastructure
- Room/channel concept maps directly to game rooms (channel name = roomId)

**Setup required (one-time):**
1. Sign up at agora.io
2. Create a project → copy the App ID
3. Add `REACT_APP_AGORA_APP_ID=your_id` to `.env` and Vercel env vars

### Flow

1. Player taps 🎤 button → joins Agora channel for the room, microphone track published (always on — no push-to-talk)
2. Player taps 🎤 again → mutes/unmutes local mic (stays in channel, just silences outgoing audio)
3. All other players in the same room who have also joined automatically hear each other
4. On room exit / game end → `AgoraRTC.leave()` called to disconnect cleanly

### Speaking Indicators

Agora fires `volume-indicator` events every 2 seconds with per-user volume levels. When a player's volume exceeds a threshold (e.g. 5), their name in the player strip gets a green pulse ring. Indicator disappears when they stop speaking.

### UI

- 🎤 button lives in the game controls area (same row as sort buttons)
- States:
  - Off (grey) — not in voice chat
  - On (green) — in voice chat, mic active
  - Muted (red) — in voice chat but mic muted
- Small mic icon next to each player's name in the player strip (grey = not in voice, green = in voice + unmuted, red = muted)

### Component

Voice logic lives in `src/Chat.jsx` alongside text chat:

Exports:
- `useVoice(roomId, myName)` — hook managing Agora client lifecycle, returns `{ joined, muted, join, leave, toggleMute, speakingUsers }`
- `<VoiceMicButton />` — the 🎤 toggle button in game controls
- `<VoiceIndicator playerName speakingUsers joined />` — mic status icon shown per player in player strip

---

## Component Structure

```
src/
  Chat.jsx        ← new file: all chat + voice logic and UI
  App.jsx         ← imports ChatButton, ChatPopup, VoiceMicButton, VoiceIndicator from Chat.jsx
  firebase.js     ← unchanged
```

`App.jsx` changes are minimal — just import and render the new components in `GameScreen`. No logic moves out of `App.jsx`.

---

## Data Flow Summary

| Feature | Transport | Direction |
|---|---|---|
| Text messages | Firebase Realtime DB | All players ↔ Firebase |
| Voice audio | Agora RTC | Peer-to-peer via Agora infra |
| Speaking indicators | Agora volume events | Local only (each client detects independently) |

---

## Out of Scope

- Individual DMs between players (group chat only)
- Video chat
- Chat history persisted after room ends
- Message moderation / profanity filter
- Voice recording
