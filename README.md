# Quizzo – a live, real-time quiz game (Kahoot-style)

Host creates a quiz, players join with a PIN from their own devices, and everyone answers in real time.

## Run
```
npm install
npm start        # http://localhost:3000  (PORT env var to change)
npm test         # end-to-end smoke test
```

## How to play
1. Open the site → **Host a game**, edit (or keep) the sample quiz → **Create game**.
2. Players open the same URL on their phones, enter the PIN and a nickname.
3. Host clicks **Start**. Each question has a timer; faster correct answers score more (up to 1000, plus streak bonus).
4. Host sees live answer counts, per-question distribution and leaderboard, then a final podium.

Players who refresh mid-game rejoin automatically. Click a name in the lobby to remove a player.

Stack: Node, Express, Socket.IO; vanilla JS frontend. Game state is in memory (single server instance).
For internet play, deploy anywhere that supports WebSockets, or tunnel with e.g. `ngrok http 3000`.
