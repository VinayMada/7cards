# 🃏 LOW CARD — Online Multiplayer Card Game

A real-time multiplayer card game built with React + Firebase Realtime Database.

---

## STEP 1 — Create a Firebase Project (Free)

1. Go to https://console.firebase.google.com
2. Click **"Add project"** → give it any name (e.g. `lowcard-game`) → click Continue
3. Disable Google Analytics (not needed) → click **"Create project"**
4. Once created, click **"Continue"**

---

## STEP 2 — Set Up Realtime Database

1. In the Firebase console left sidebar, click **"Build"** → **"Realtime Database"**
2. Click **"Create Database"**
3. Choose a location (any region is fine) → click **Next**
4. Select **"Start in test mode"** → click **Enable**
   - ⚠️ Test mode allows open read/write for 30 days — fine for playing with friends.
   - For long-term use, set up proper security rules (see bottom of this file).

---

## STEP 3 — Get Your Firebase Config

1. In the Firebase console, click the **gear icon ⚙️** (top left) → **"Project settings"**
2. Scroll down to **"Your apps"** section
3. Click the **Web icon `</>`** to add a web app
4. Give it a nickname (e.g. `lowcard-web`) → click **"Register app"**
5. You'll see a `firebaseConfig` object like this:

```js
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "lowcard-game.firebaseapp.com",
  databaseURL: "https://lowcard-game-default-rtdb.firebaseio.com",
  projectId: "lowcard-game",
  storageBucket: "lowcard-game.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

6. Copy these values.

---

## STEP 4 — Paste Config into the App

Open `src/firebase.js` and replace every `REPLACE_WITH_YOUR_...` value with your actual values:

```js
const firebaseConfig = {
  apiKey:            "AIzaSy...",           // ← your value
  authDomain:        "yourapp.firebaseapp.com",
  databaseURL:       "https://yourapp-default-rtdb.firebaseio.com",
  projectId:         "yourapp",
  storageBucket:     "yourapp.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123:web:abc123",
};
```

**Important:** Make sure `databaseURL` is included — it's required for Realtime Database.

---

## STEP 5 — Install & Test Locally

Make sure you have Node.js installed (https://nodejs.org — download LTS version).

Open a terminal in the `lowcard` folder and run:

```bash
npm install
npm start
```

The game opens at http://localhost:3000 — test it by opening two browser tabs!

---

## STEP 6A — Deploy to Vercel (Recommended)

1. Push your code to GitHub:
   ```bash
   git init
   git add .
   git commit -m "lowcard game"
   ```
   Then create a repo at https://github.com/new and follow the instructions to push.

2. Go to https://vercel.com → Sign up free with GitHub

3. Click **"Add New Project"** → Import your GitHub repo

4. Leave all settings as default → click **"Deploy"**

5. Done! You get a link like: `https://lowcard-abc123.vercel.app`

Share that link with friends — they open it on any device and join your room!

---

## STEP 6B — Deploy to Netlify (Alternative)

1. Push to GitHub (same as above)

2. Go to https://netlify.com → Sign up free

3. Click **"Add new site"** → **"Import from Git"** → Connect GitHub

4. Set:
   - Build command: `npm run build`
   - Publish directory: `build`

5. Click **"Deploy site"**

6. You get a link like: `https://lowcard-abc.netlify.app`

---

## How to Play

1. **Host** opens the link → Create Room → sets players/sets/score limit → shares the 5-letter code
2. **Friends** open the same link → Join Room → enter the code
3. Host clicks **START GAME** when everyone is in
4. Each player only sees their own cards!

### Rules Summary
- Each player gets 7 cards. Goal: get your count ≤ 5.
- A=1, J/Q/K=10, numbers=face value, Joker=0
- On your turn: select same-rank cards to drop.
  - Drop 1-2 cards → must draw 1 new card
  - Drop 3+ cards → no draw needed
- **J** = next player is skipped
- **7** = next player must counter with 7s / 3+ same cards, or draw penalty × 2
- **HIT SHOW** = declare win when your count ≤ 5
  - If no one has equal/lower → you get 0 pts, others add their count
  - If someone ties or beats you → you get +50 penalty
- Players eliminated when score reaches the limit (default 200)
- Last player standing wins!

---

## Firebase Security Rules (For Production)

After 30 days, test mode expires. Go to Firebase Console → Realtime Database → Rules and paste:

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

This keeps rooms open for anyone with the code. For more security, add Firebase Authentication.
