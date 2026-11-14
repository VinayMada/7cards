# 🃏 LOW CARD — Online Multiplayer Card Game

Low Card is a real-time multiplayer card game for 2–12 players. The goal is to hold the lowest hand score and be the last player standing. Play instantly in any browser or install as an Android app — no account required.

**Live:** https://7cards-vinay.vercel.app

---

## Table of Contents

- [How to Play](#how-to-play)
- [Full Rules](#full-rules)
- [Special Cards](#special-cards)
- [Scoring & Elimination](#scoring--elimination)
- [Game Features](#game-features)
- [Chat & Voice](#chat--voice)
- [Android App](#android-app)
- [Setup for Developers](#setup-for-developers)
- [Tech Stack](#tech-stack)

---

## How to Play

### Starting a Game

1. Open the game link on any device
2. Enter your name
3. **Create Room** — choose number of players (2–12), card sets (1–4), and the elimination score limit
4. Share the 5-letter room code with your friends
5. Friends open the same link → **Join Room** → enter the code
6. Once everyone is in, the host clicks **START GAME**

Each player sees only their own hand. The game is fully real-time — all actions update instantly for every player.

---

## Full Rules

### Setup

- Each player is dealt **7 cards**
- One card is randomly selected as the **Joker rank** for the round (displayed on the table). All cards of that rank are worth **0 points**
- The Joker rank is never a Jack (J) or a Seven (7)
- Remaining cards form the **draw pile**

### Card Values

| Card | Points |
|------|--------|
| Ace (A) | 1 |
| 2–10 | Face value |
| Jack (J) | 10 |
| Queen (Q) | 10 |
| King (K) | 10 |
| Joker rank | **0** |

Your **hand score** is the sum of all your cards, with the Joker rank counting as 0.

### Your Turn

On your turn, you **must** drop one or more cards of the **same rank**, then draw:

| Cards dropped | Draw rule |
|---------------|-----------|
| 1 card | Must draw 1 card (from draw pile or discard pile) |
| 2 cards | Must draw 1 card (from pile or discard) |
| 3+ cards | No draw needed |

**Dropping from discard:** After dropping, you may take the card that was just dropped by the previous player (visible on top of the discard pile), instead of drawing from the face-down pile. You **cannot** take a J or 7 from the discard.

### The Clash Mechanic ⚡

If you drop the **same rank** that was dropped immediately before you, it is a **Clash** — you skip your draw entirely. No card is taken from the pile or discard. This is shown as ⚡ CLASH in the log.

### Calling Show 🎉

When your hand score is **5 or less**, you can click **HIT SHOW** to end the round and reveal hands.

- **Correct Show:** Nobody else has a score equal to or lower than yours → you add **0 points** to your total; all other active players add their hand score
- **Wrong Show:** Someone else has a score equal to or lower than yours → you receive a **+50 penalty** added to your total; all other players still add their hand score

**Exception:** If your count is exactly 0, you must have the strict lowest — a tie at 0 does not count as a wrong show.

### Empty Hand

If you ever run out of cards after dropping, the game automatically draws one card for you to keep you in the round.

### Draw Pile Reshuffle

When the draw pile is exhausted, all discard cards except the top one are shuffled back into the draw pile automatically. The game logs this event as ♻️.

---

## Special Cards

### Jack (J) — Skip 🚫

- Dropping **1 Jack** skips the next player's turn
- Dropping **2 Jacks** skips the next 2 players
- Dropping **3 Jacks** skips 3 players, and so on
- After dropping Jacks, no draw is needed

### Seven (7) — Chain Penalty ⚡

Dropping a 7 starts a **chain**. The next player must respond:

| Response | Effect |
|----------|--------|
| Drop 7(s) | Chain continues — penalty doubles for the next player |
| Drop 3+ cards of the same rank | **Tackle** — chain is broken, no penalty |
| Click "Draw N cards" | Accept the penalty: draw `penalty count × 2` cards |

Penalty stacks: 1 seven → draw 2, two sevens chained → draw 4, three chained → draw 6, and so on.

**Auto-response on timeout:** If a player's timer runs out during a 7-chain, the game auto-forwards their 7s if they have any, or auto-tackles with 3+ matching cards if available, or auto-takes the penalty.

---

## Scoring & Elimination

- After each round, active players add their **current hand score** to their running total
- A player is **eliminated** when their total score reaches or exceeds the **elimination limit** (set by the host before the game, default 200 pts)
- The last remaining player wins the game

### Round Start Order

Each new round starts with the **next player** in sequence (rotating). The starting player for the current round is shown in the game log.

### Host Transfer

If the host is eliminated, the host role automatically passes to the remaining player with the lowest score.

---

## Game Features

### Turn Timer ⏱

Each player has **60 seconds** to act. The timer is visible to all players:

- Green border: more than 50% time remaining
- Orange border: between 20–50%
- Red border: under 20 seconds
- The active player's opponent chip also shows the countdown as a shrinking border arc

When the timer hits zero, the game auto-acts on behalf of the player (drops highest card, draws from pile).

### AFK System ❤️

Each player has **5 lives** (shown as ❤️ on their chip). A life is lost every time the turn timer expires. At **0 lives**, the player is automatically removed from the game. AFK counts carry across all rounds.

### Scoreboard 📊

Tap the 📊 button at any time to see a full history of scores by round — who gained how many points each round, and the current totals.

### Hand Sorting

Use the **↑** and **↓** sort buttons next to your hand to sort cards by value (low to high or high to low). Sorting resets when a card is drawn or dropped.

### Host Controls

The host can **remove players** from the waiting room and from an in-progress game. If the removed player is currently taking their turn, the turn advances automatically.

### Discard Pile Choice

After dropping cards, a banner appears letting you choose:
- **Draw from pile** — take the top face-down card
- **Take from discard** — take the card just played by the previous player (not available for J or 7)

---

## Chat & Voice

### Text Chat 💬

A collapsible chat strip sits below your hand. It is collapsed by default (one input row) to save screen space on small phones.

- Tap **💬** to expand/collapse the message history
- The button shows an unread count badge when there are new messages while collapsed
- Type a message and press Enter or ➤ to send
- All players in the room see the chat in real-time

### Voice Chat 🎤

Tap the **🎤** button to join the voice channel. All players in the same room share one channel.

- The 🎤 icon next to an opponent's name pulses when they are speaking
- Tap the mic again to **mute/unmute** yourself
- Tap **✕** next to the mic to leave the voice channel
- Works in both the browser and the Android app
- Browser will ask for microphone permission on first use

---

## Android App

Low Card is available as an Android APK built with Capacitor.

### Features in the App

- **Interstitial ads** shown between rounds (skippable)
- **Rewarded ads** available to earn extra benefits
- **Ad-free subscription** available via Google Play in-app purchase — removes all ads permanently. Linked to your Google Play account, no separate login needed
- Tap **Remove Ads** to subscribe, or **Restore** if you already purchased on another device

### Install

Download the latest APK from the GitHub Actions build artifacts or ask for a direct link. The app loads the live game from the server so it is always up to date without reinstalling.

---

## Room Settings (Host Options)

| Setting | Options | Default |
|---------|---------|---------|
| Max Players | 2–12 | 4 |
| Card Sets | 1–4 decks | 1 |
| Elimination Score | 50–500 pts | 200 |

Using more card sets is recommended for larger player counts to avoid running out of cards.

---

## Setup for Developers

### Prerequisites

- Node.js LTS (https://nodejs.org)
- Firebase account (https://console.firebase.google.com)
- Agora account for voice (https://console.agora.io) — optional

### Step 1 — Firebase Setup

1. Create a Firebase project → enable **Realtime Database** in test mode
2. Add a Web App → copy the `firebaseConfig`
3. Open `src/firebase.js` and replace the placeholder values

### Step 2 — Agora Voice Setup (optional)

1. Create an Agora project at console.agora.io
2. Copy your **App ID** and **Primary Certificate**
3. Add to Vercel environment variables:
   - `REACT_APP_AGORA_APP_ID` — your Agora App ID
   - `AGORA_APP_CERTIFICATE` — your Agora certificate (used server-side for token generation)

### Step 3 — Run Locally

```bash
npm install
npm start
```

The game opens at http://localhost:3000. Open two tabs to test multiplayer.

### Step 4 — Deploy to Vercel

1. Push to GitHub
2. Import the repo at https://vercel.com
3. Add environment variables in Vercel dashboard (Settings → Environment Variables)
4. Deploy

### Step 5 — Build Android APK

```bash
npm run build
npx cap sync android
cd android && ./gradlew assembleRelease
```

Or push to the `main` branch — GitHub Actions builds a signed APK and AAB automatically.

### Firebase Security Rules

After the 30-day test mode expires, update rules in Firebase Console → Realtime Database → Rules:

```json
{
  "rules": {
    "rooms": {
      "$roomId": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React (Create React App) |
| Real-time data | Firebase Realtime Database |
| Voice chat | Agora RTC Web SDK |
| Token auth | Vercel serverless function (`/api/agora-token`) |
| Hosting | Vercel |
| Android wrapper | Capacitor |
| Ads | Google AdMob (Android only) |
| Subscriptions | RevenueCat + Google Play Billing (Android only) |
| CI/CD | GitHub Actions (builds signed APK + AAB on push) |

---

## License

MIT
