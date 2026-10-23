const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const QRCode = require('qrcode');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const QUIZ_FILE = path.join(DATA_DIR, 'quizzes.json');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
const MAX_PLAYERS = 500;

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
app.set('trust proxy', true);
const server = http.createServer(app);
const io = new Server(server);

// ======================================================================
// Quiz storage + validation
// ======================================================================
const FONTS = ['system', 'Prompt', 'Kanit', 'Sarabun', 'Mitr', 'Playfair Display', 'Dancing Script'];
const DEFAULT_THEME = {
  eventName: '', subtitle: '', welcome: '',
  bg1: '#46178f', bg2: '#331166', accent: '#ffffff', text: '#ffffff', font: 'Prompt',
  bgImage: '', logo: '',
  choiceColors: ['#e21b3c', '#1368ce', '#d89e00', '#26890c'],
};

const color = (v, d) => (/^#[0-9a-fA-F]{6}$/.test(v) ? v : d);
const img = (v) => (typeof v === 'string' && /^\/uploads\/[\w.-]+$/.test(v) ? v : '');
const str = (v, n) => String(v ?? '').trim().slice(0, n);

function sanitizeTheme(t = {}) {
  const d = DEFAULT_THEME;
  return {
    eventName: str(t.eventName, 80), subtitle: str(t.subtitle, 120), welcome: str(t.welcome, 200),
    bg1: color(t.bg1, d.bg1), bg2: color(t.bg2, d.bg2), accent: color(t.accent, d.accent), text: color(t.text, d.text),
    font: FONTS.includes(t.font) ? t.font : d.font,
    bgImage: img(t.bgImage), logo: img(t.logo),
    choiceColors: d.choiceColors.map((c, i) => color(Array.isArray(t.choiceColors) ? t.choiceColors[i] : null, c)),
  };
}

// Returns { quiz } or { error }
function sanitizeQuiz(raw) {
  if (!raw || !Array.isArray(raw.questions) || !raw.questions.length) return { error: 'Add at least one question or slide.' };
  const questions = [];
  for (const [i, q] of raw.questions.slice(0, 200).entries()) {
    const n = i + 1;
    const type = ['quiz', 'poll', 'slide'].includes(q.type) ? q.type : 'quiz';
    const text = str(q.text, 300);
    if (!text) return { error: `Item ${n}: text is required.` };
    const item = { type, text, body: str(q.body, 600), image: img(q.image) };
    if (type === 'slide') {
      item.time = 0; item.choices = []; item.correct = null;
    } else {
      // keep original positions so the "correct" index survives blank choices being dropped
      const raws = (Array.isArray(q.choices) ? q.choices : []).slice(0, 4).map((c) => str(c, 100));
      const choices = []; let correct = null;
      raws.forEach((c, ci) => { if (c) { if (ci === Number(q.correct)) correct = choices.length; choices.push(c); } });
      if (choices.length < 2) return { error: `Item ${n}: at least 2 answers are required.` };
      if (type === 'quiz' && correct === null) return { error: `Item ${n}: mark a correct answer.` };
      item.choices = choices;
      item.correct = type === 'quiz' ? correct : null;
      item.time = Math.min(180, Math.max(5, Number(q.time) || 20));
    }
    questions.push(item);
  }
  return { quiz: { title: str(raw.title, 80) || 'Untitled quiz', theme: sanitizeTheme(raw.theme), questions } };
}

function sampleQuiz() {
  const mk = (text, choices, correct, extra = {}) => ({ type: 'quiz', text, body: '', image: '', choices, correct, time: 20, ...extra });
  return {
    id: 'sample', title: 'ตัวอย่าง: ใครรู้จักคู่บ่าวสาวดีที่สุด',
    theme: { ...DEFAULT_THEME, eventName: 'งานแต่งงาน เอ & บี', subtitle: 'ขอบคุณที่มาร่วมแสดงความยินดี', welcome: 'รอสักครู่ พิธีกรกำลังจะเริ่มเกม' },
    questions: [
      { type: 'slide', text: 'ยินดีต้อนรับ!', body: 'ตอบคำถามเกี่ยวกับคู่บ่าวสาว ตอบเร็วได้คะแนนมาก', image: '', choices: [], correct: null, time: 0 },
      mk('คู่บ่าวสาวพบกันครั้งแรกที่ไหน?', ['ที่ทำงาน', 'มหาวิทยาลัย', 'งานเลี้ยงเพื่อน', 'แอปหาคู่'], 1),
      mk('ใครเป็นฝ่ายบอกรักก่อน?', ['เจ้าบ่าว', 'เจ้าสาว'], 0, { time: 15 }),
      { type: 'poll', text: 'ทริปฮันนีมูนที่อยากให้ไปที่สุด?', body: '', image: '', choices: ['ญี่ปุ่น', 'ยุโรป', 'มัลดีฟส์', 'เกาหลี'], correct: null, time: 20 },
      mk('คู่บ่าวสาวคบกันมากี่ปีก่อนแต่ง?', ['1-2 ปี', '3-5 ปี', '6-8 ปี', 'มากกว่า 8 ปี'], 2),
    ],
    updatedAt: Date.now(),
  };
}

let quizzes = {};
function loadQuizzes() {
  try { quizzes = JSON.parse(fs.readFileSync(QUIZ_FILE, 'utf8')); } catch { quizzes = {}; }
  if (!Object.keys(quizzes).length) { quizzes.sample = sampleQuiz(); saveQuizzes(); }
}
function saveQuizzes() {
  const tmp = QUIZ_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(quizzes, null, 2));
  fs.renameSync(tmp, QUIZ_FILE);
}
loadQuizzes();

// ======================================================================
// HTTP: static, admin API, uploads, QR
// ======================================================================
const tokens = new Map(); // token -> expiry
function validToken(t) {
  const exp = tokens.get(t);
  if (!exp) return false;
  if (exp < Date.now()) { tokens.delete(t); return false; }
  return true;
}
const auth = (req, res, next) => (validToken(req.get('x-admin-token')) ? next() : res.status(401).json({ error: 'Unauthorized' }));

app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d', setHeaders: (r) => r.setHeader('X-Content-Type-Options', 'nosniff') }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

let failedLogins = 0;
app.post('/api/admin/login', express.json(), async (req, res) => {
  if (failedLogins > 3) await new Promise((r) => setTimeout(r, Math.min(failedLogins, 10) * 500));
  const a = crypto.createHash('sha256').update(String(req.body?.password ?? '')).digest();
  const b = crypto.createHash('sha256').update(ADMIN_PASSWORD).digest();
  if (!crypto.timingSafeEqual(a, b)) { failedLogins++; return res.status(401).json({ error: 'Wrong password' }); }
  failedLogins = 0;
  const token = crypto.randomBytes(24).toString('hex');
  tokens.set(token, Date.now() + 24 * 3600 * 1000);
  res.json({ token, defaultPassword: ADMIN_PASSWORD === 'admin' });
});

const summary = (q) => ({ id: q.id, title: q.title, count: q.questions.length, updatedAt: q.updatedAt, theme: q.theme });
app.get('/api/admin/quizzes', auth, (req, res) => res.json(Object.values(quizzes).sort((a, b) => b.updatedAt - a.updatedAt).map(summary)));
app.get('/api/admin/quizzes/:id', auth, (req, res) => (quizzes[req.params.id] ? res.json(quizzes[req.params.id]) : res.status(404).json({ error: 'Not found' })));
app.post('/api/admin/quizzes', auth, express.json({ limit: '2mb' }), (req, res) => {
  const { quiz, error } = sanitizeQuiz(req.body);
  if (error) return res.status(400).json({ error });
  const id = crypto.randomBytes(5).toString('hex');
  quizzes[id] = { id, ...quiz, updatedAt: Date.now() };
  saveQuizzes();
  res.json(quizzes[id]);
});
app.put('/api/admin/quizzes/:id', auth, express.json({ limit: '2mb' }), (req, res) => {
  if (!quizzes[req.params.id]) return res.status(404).json({ error: 'Not found' });
  const { quiz, error } = sanitizeQuiz(req.body);
  if (error) return res.status(400).json({ error });
  quizzes[req.params.id] = { id: req.params.id, ...quiz, updatedAt: Date.now() };
  saveQuizzes();
  res.json(quizzes[req.params.id]);
});
app.delete('/api/admin/quizzes/:id', auth, (req, res) => {
  delete quizzes[req.params.id];
  saveQuizzes();
  res.json({ ok: true });
});

const IMG_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
app.post('/api/admin/upload', auth, express.raw({ type: Object.keys(IMG_EXT), limit: '8mb' }), (req, res) => {
  const ext = IMG_EXT[req.get('content-type')?.split(';')[0]];
  if (!ext || !Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'Upload a PNG, JPG, WEBP or GIF image (max 8MB).' });
  const name = `${crypto.randomBytes(8).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), req.body);
  res.json({ url: `/uploads/${name}` });
});

function baseUrl(req) {
  return PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
}
function joinUrl(req, pin) {
  return `${baseUrl(req)}/?pin=${pin}`;
}
app.get('/api/join-info/:pin', async (req, res) => {
  const pin = req.params.pin;
  const g = games.get(pin);
  if (!g) return res.status(404).json({ error: 'not found' });
  const url = joinUrl(req, pin);
  res.json({ url, qr: await QRCode.toString(url, { type: 'svg', margin: 1, width: 400 }) });
});
app.get('/api/game/:pin', (req, res) => {
  const g = games.get(req.params.pin);
  if (!g) return res.status(404).json({ error: 'not found' });
  res.json({ title: g.quiz.title, theme: g.quiz.theme });
});

// ======================================================================
// Game logic
// ======================================================================
const games = new Map(); // pin -> game

function makePin() {
  let pin;
  do pin = String(Math.floor(100000 + Math.random() * 900000));
  while (games.has(pin));
  return pin;
}
const randomId = () => crypto.randomBytes(8).toString('hex');

function leaderboard(game, limit) {
  const list = [...game.players.values()]
    .sort((a, b) => b.score - a.score)
    .map((p, i) => ({ id: p.id, name: p.name, score: p.score, rank: i + 1, streak: p.streak }));
  return limit ? list.slice(0, limit) : list;
}
const connectedCount = (g) => [...g.players.values()].filter((p) => p.socketId).length;
const playerList = (g) => [...g.players.values()].map((p) => ({ id: p.id, name: p.name, online: !!p.socketId }));
const toHost = (g, ev, payload) => g.host && io.to(g.host).emit(ev, payload);
const emitPlayers = (g) => toHost(g, 'lobby:players', { players: playerList(g) });
const currentItem = (g) => g.quiz.questions[g.index];

function startItem(game) {
  const q = currentItem(game);
  const base = { index: game.index, total: game.quiz.questions.length, type: q.type, text: q.text, body: q.body, image: q.image };
  clearTimeout(game.timer);
  if (q.type === 'slide') {
    game.state = 'slide';
    game.current = base;
    io.to(game.pin).emit('slide:show', base);
    return;
  }
  game.state = 'question';
  game.startedAt = Date.now();
  game.answers = new Map();
  game.current = { ...base, choices: q.choices, time: q.time };
  io.to(game.pin).emit('question:start', game.current);
  game.timer = setTimeout(() => endQuestion(game), q.time * 1000 + 300);
}

function endQuestion(game) {
  if (game.state !== 'question') return;
  clearTimeout(game.timer);
  game.state = 'reveal';
  const q = currentItem(game);
  const poll = q.type === 'poll';
  const counts = q.choices.map(() => 0);

  for (const p of game.players.values()) {
    const a = game.answers.get(p.id);
    let gained = 0; let correct = false;
    if (a) {
      counts[a.choice]++;
      if (!poll) {
        correct = a.choice === q.correct;
        if (correct) {
          const ratio = Math.min(1, a.elapsed / (q.time * 1000));
          gained = Math.round(1000 * (1 - ratio / 2));
          p.streak += 1;
          gained += Math.min(p.streak - 1, 5) * 100; // streak bonus
        } else p.streak = 0;
      }
    } else if (!poll) p.streak = 0;
    p.score += gained;
    p.result = { poll, answered: !!a, correct, gained, correctChoice: q.correct, streak: p.streak };
  }

  const board = leaderboard(game);
  game.reveal = {
    ...game.current, correct: q.correct, counts, poll,
    leaderboard: board.slice(0, 5), last: game.index === game.quiz.questions.length - 1,
  };
  toHost(game, 'question:end', game.reveal);
  for (const p of game.players.values()) {
    if (!p.socketId) continue;
    io.to(p.socketId).emit('answer:result', playerResult(game, p, board));
  }
}

function playerResult(game, p, board = leaderboard(game)) {
  const me = board.find((b) => b.id === p.id);
  return { ...p.result, score: p.score, rank: me.rank, players: board.length };
}
function playerEnd(game, p) {
  const board = leaderboard(game);
  const me = board.find((b) => b.id === p.id);
  return { score: p.score, rank: me.rank, players: board.length, podium: board.slice(0, 3) };
}

function finishGame(game) {
  clearTimeout(game.timer);
  game.state = 'ended';
  const board = leaderboard(game);
  game.final = { leaderboard: board.slice(0, 10), top3: board.slice(0, 3) };
  toHost(game, 'game:end', game.final);
  for (const p of game.players.values()) if (p.socketId) io.to(p.socketId).emit('game:end', playerEnd(game, p));
  scheduleCleanup(game, 3 * 3600 * 1000);
}

function scheduleCleanup(game, ms) {
  clearTimeout(game.cleanup);
  game.cleanup = setTimeout(() => destroyGame(game), ms);
  game.cleanup.unref?.();
}
function destroyGame(game) {
  clearTimeout(game.timer); clearTimeout(game.cleanup);
  games.delete(game.pin);
  io.to(game.pin).emit('game:closed');
}

function hostSnapshot(g) {
  const snap = {
    pin: g.pin, title: g.quiz.title, theme: g.quiz.theme, state: g.state,
    total: g.quiz.questions.length, index: g.index, players: playerList(g),
  };
  if (g.state === 'question') snap.question = { ...g.current, remaining: Math.max(0, g.current.time * 1000 - (Date.now() - g.startedAt)), answered: g.answers.size };
  if (g.state === 'slide') snap.slide = g.current;
  if (g.state === 'reveal') snap.reveal = g.reveal;
  if (g.state === 'ended') snap.final = g.final;
  return snap;
}

io.on('connection', (socket) => {
  // ---------- Host ----------
  const attachHost = (g) => {
    g.host = socket.id;
    socket.data.hostOf = g.pin;
    socket.join(g.pin);
    scheduleCleanup(g, 6 * 3600 * 1000);
  };

  socket.on('host:create', ({ token, quizId } = {}, ack) => {
    if (!validToken(token)) return ack?.({ error: 'auth' });
    const src = quizzes[quizId];
    if (!src) return ack?.({ error: 'Quiz not found.' });
    const pin = makePin();
    const game = {
      pin, quiz: JSON.parse(JSON.stringify(src)), host: null, state: 'lobby', index: -1,
      players: new Map(), answers: new Map(), timer: null, cleanup: null, startedAt: 0, current: null, reveal: null, final: null,
    };
    games.set(pin, game);
    attachHost(game);
    ack?.(hostSnapshot(game));
  });

  socket.on('host:resume', ({ token, pin } = {}, ack) => {
    if (!validToken(token)) return ack?.({ error: 'auth' });
    const g = games.get(String(pin));
    if (!g) return ack?.({ error: 'gone' });
    attachHost(g);
    ack?.(hostSnapshot(g));
  });

  const hostGame = () => {
    const g = games.get(socket.data.hostOf);
    return g && g.host === socket.id ? g : null;
  };

  socket.on('host:advance', () => {
    const g = hostGame();
    if (!g) return;
    if (g.state === 'lobby') {
      if (!g.players.size) return;
      g.index = 0;
    } else if (g.state === 'slide' || g.state === 'reveal') {
      if (g.index >= g.quiz.questions.length - 1) return finishGame(g);
      g.index++;
    } else return;
    startItem(g);
  });
  socket.on('host:skip', () => { const g = hostGame(); if (g) endQuestion(g); });
  socket.on('host:kick', (id) => {
    const g = hostGame();
    const p = g?.players.get(id);
    if (!p) return;
    if (p.socketId) io.to(p.socketId).emit('player:kicked');
    g.players.delete(id);
    emitPlayers(g);
  });
  socket.on('host:close', () => { const g = hostGame(); if (g) destroyGame(g); });

  // ---------- Player ----------
  socket.on('player:join', ({ pin, name, playerId } = {}, ack) => {
    const g = games.get(String(pin || '').trim());
    if (!g) return ack?.({ error: 'notfound' });
    const base = { theme: g.quiz.theme, title: g.quiz.title };

    const existing = playerId && g.players.get(playerId);
    if (existing) {
      existing.socketId = socket.id;
      socket.data.pin = g.pin; socket.data.playerId = existing.id;
      socket.join(g.pin);
      emitPlayers(g);
      const res = { ...base, playerId: existing.id, name: existing.name, state: g.state, score: existing.score };
      if (g.state === 'question') res.question = { ...g.current, remaining: Math.max(0, g.current.time * 1000 - (Date.now() - g.startedAt)), answered: g.answers.has(existing.id) };
      if (g.state === 'slide') res.slide = g.current;
      if (g.state === 'reveal' && existing.result) res.result = playerResult(g, existing);
      if (g.state === 'ended') res.end = playerEnd(g, existing);
      return ack?.(res);
    }

    const nm = str(name, 20);
    if (!nm) return ack?.({ error: 'noname' });
    if (g.state === 'ended') return ack?.({ error: 'ended' });
    if (g.players.size >= MAX_PLAYERS) return ack?.({ error: 'full' });
    for (const p of g.players.values()) if (p.name.toLowerCase() === nm.toLowerCase()) return ack?.({ error: 'taken' });

    const player = { id: randomId(), name: nm, socketId: socket.id, score: 0, streak: 0, result: null };
    g.players.set(player.id, player);
    socket.data.pin = g.pin; socket.data.playerId = player.id;
    socket.join(g.pin);
    emitPlayers(g);
    const res = { ...base, playerId: player.id, name: nm, state: g.state, score: 0 };
    if (g.state === 'question') res.question = { ...g.current, remaining: Math.max(0, g.current.time * 1000 - (Date.now() - g.startedAt)), answered: false };
    if (g.state === 'slide') res.slide = g.current;
    ack?.(res);
  });

  socket.on('player:answer', (choice, ack) => {
    const g = games.get(socket.data.pin);
    if (!g || g.state !== 'question') return;
    const id = socket.data.playerId;
    if (!g.players.has(id) || g.answers.has(id)) return;
    const q = currentItem(g);
    choice = Number(choice);
    if (!Number.isInteger(choice) || choice < 0 || choice >= q.choices.length) return;
    g.answers.set(id, { choice, elapsed: Date.now() - g.startedAt });
    ack?.({ ok: true });
    toHost(g, 'question:progress', { answered: g.answers.size, total: g.players.size });
    if (g.answers.size >= g.players.size) endQuestion(g);
  });

  socket.on('disconnect', () => {
    if (socket.data.hostOf) {
      const g = games.get(socket.data.hostOf);
      if (g && g.host === socket.id) { g.host = null; scheduleCleanup(g, 3 * 3600 * 1000); } // host can resume
      return;
    }
    const g = games.get(socket.data.pin);
    const p = g?.players.get(socket.data.playerId);
    if (!p || p.socketId !== socket.id) return;
    p.socketId = null;
    if (g.state === 'lobby') {
      // brief grace so a refreshing player keeps their spot
      setTimeout(() => { if (g.players.get(p.id) === p && !p.socketId && g.state === 'lobby') { g.players.delete(p.id); emitPlayers(g); } }, 15000).unref?.();
    }
    emitPlayers(g);
  });
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    if (ADMIN_PASSWORD === 'admin') console.log('WARNING: using default admin password. Set ADMIN_PASSWORD before hosting publicly.');
  });
}
module.exports = { server, io, games, quizzes };
