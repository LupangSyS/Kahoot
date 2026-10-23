# Quizzo – เกมควิซสด (Kahoot-style) สำหรับงานแต่ง / อีเวนต์

Live quiz game: guests scan a QR code, answer on their phones, the big screen shows questions, results and a leaderboard in real time.

## Run
```
npm install
ADMIN_PASSWORD=your-secret PUBLIC_URL=https://your-domain npm start   # http://localhost:3000
npm test
```
| env | meaning |
|---|---|
| `ADMIN_PASSWORD` | password for `/admin` (default `admin` – change it!) |
| `PUBLIC_URL` | address guests use; goes into the QR code. If unset it is taken from the address the host screen was opened at |
| `DATA_DIR` | where quizzes (`quizzes.json`) and uploaded images live (default `./data`). Put on a persistent disk when deploying |
| `PORT` | default 3000 |

## Using it at the wedding
1. Open **/admin**, log in, create a quiz (or edit the Thai sample).
   - Items: **question** (scored, speed + streak bonus), **poll** (no score, shows the vote split) and **slide** (title/text/photo for presenting).
   - Each item can have a photo. Reorder with ↑ ↓.
   - **Theme tab**: couple's names, logo, background photo, colours (presets included), font, answer colours – live preview.
2. Press **▶ Launch** → the big-screen page opens with the **QR code + PIN**. Put it on the projector (⛶ fullscreen button).
3. Guests scan the QR (no app needed), type a nickname. Late guests can join mid-game.
4. Host controls: **Start**, **Next** (or Space / → key), **Skip** to end a question early.
   The host page survives refresh and network drops – the game keeps running.

## Online / going public
The server must be reachable by guests' phones. Easiest options:
- Deploy to any host that supports WebSockets (Render, Railway, Fly.io, a VPS), set `ADMIN_PASSWORD` and `PUBLIC_URL`, and mount a persistent volume at `DATA_DIR`.
- Or run locally and tunnel: `ngrok http 3000` / `cloudflared tunnel --url http://localhost:3000`, then open the **tunnel URL** for `/admin` so the QR points to it.

Game state is in memory (one server instance); quizzes and images are on disk. UI is Thai by default with an EN/TH toggle.
