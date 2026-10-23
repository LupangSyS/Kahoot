const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const games = new Map(); // pin -> game
const MAX_PLAYERS = 200;

function makePin() {
  let pin;
  do pin = String(Math.floor(100000 + Math.random() * 900000));
  while (games.has(pin));
  return pin;
}

function randomId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function sanitizeQuiz(raw) {
  if (!raw || !Array.isArray(raw.questions) || !raw.questions.length) return null;
  const questions = [];
  for (const q of raw.questions.slice(0, 100)) {
    const text = String(q.text || '').trim().slice(0, 200);
    const choices = (Array.isArray(q.choices) ? q.choices : [])
      .map((c) => String(c || '').trim().slice(0, 100))
      .filter(Boolean)
      .slice(0, 4);
    const correct = Number(q.correct);
    if (!text || choices.length < 2 || !Number.isInteger(correct) || correct < 0 || correct >= choices.length) {
      return null;
    }
    const time = Math.min(120, Math.max(5, Number(q.time) || 20));
    questions.push({ text, choices, correct, time });
  }
  return { title: String(raw.title || 'Untitled quiz').trim().slice(0, 80), questions };
}

function leaderboard(game, limit) {
  const list = [...game.players.values()]
    .sort((a, b) => b.score - a.score)
    .map((p, i) => ({ id: p.id, name: p.name, score: p.score, rank: i + 1, streak: p.streak }));
  return limit ? list.slice(0, limit) : list;
}

function connectedCount(game) {
  let n = 0;
  for (const p of game.players.values()) if (p.socketId) n++;
  return n;
}

function emitPlayers(game) {
  io.to(game.host).emit('lobby:players', {
    players: [...game.players.values()].map((p) => ({ id: p.id, name: p.name, online: !!p.socketId })),
  });
}

function currentQuestion(game) {
  return game.quiz.questions[game.index];
}

function startQuestion(game) {
  const q = currentQuestion(game);
  game.state = 'question';
  game.startedAt = Date.now();
  game.answers = new Map();
  for (const p of game.players.values()) p.lastResult = null;
  const payload = {
    index: game.index,
    total: game.quiz.questions.length,
    text: q.text,
    choices: q.choices,
    time: q.time,
  };
  io.to(game.pin).emit('question:start', payload);
  clearTimeout(game.timer);
  game.timer = setTimeout(() => endQuestion(game), q.time * 1000 + 300);
}

function endQuestion(game) {
  if (game.state !== 'question') return;
  clearTimeout(game.timer);
  game.state = 'reveal';
  const q = currentQuestion(game);
  const counts = q.choices.map(() => 0);

  for (const p of game.players.values()) {
    const a = game.answers.get(p.id);
    let gained = 0;
    let correct = false;
    if (a) {
      counts[a.choice]++;
      correct = a.choice === q.correct;
      if (correct) {
        const ratio = Math.min(1, a.elapsed / (q.time * 1000));
        gained = Math.round(1000 * (1 - ratio / 2));
        p.streak += 1;
        gained += Math.min(p.streak - 1, 5) * 100; // streak bonus
      } else p.streak = 0;
    } else p.streak = 0;
    p.score += gained;
    p.lastResult = { answered: !!a, correct, gained };
  }

  const board = leaderboard(game);
  const top = board.slice(0, 5);
  io.to(game.host).emit('question:end', {
    correct: q.correct,
    counts,
    leaderboard: top,
    last: game.index === game.quiz.questions.length - 1,
  });
  for (const p of game.players.values()) {
    if (!p.socketId) continue;
    const me = board.find((b) => b.id === p.id);
    io.to(p.socketId).emit('answer:result', {
      ...p.lastResult,
      correctChoice: q.correct,
      score: p.score,
      rank: me.rank,
      streak: p.streak,
      players: board.length,
    });
  }
}

function finishGame(game) {
  clearTimeout(game.timer);
  game.state = 'ended';
  const board = leaderboard(game);
  io.to(game.host).emit('game:end', { leaderboard: board.slice(0, 10) });
  for (const p of game.players.values()) {
    if (!p.socketId) continue;
    const me = board.find((b) => b.id === p.id);
    io.to(p.socketId).emit('game:end', { score: p.score, rank: me.rank, players: board.length, podium: board.slice(0, 3) });
  }
  setTimeout(() => destroyGame(game), 10 * 60 * 1000).unref();
}

function destroyGame(game) {
  clearTimeout(game.timer);
  games.delete(game.pin);
  io.to(game.pin).emit('game:closed');
}

io.on('connection', (socket) => {
  // ---------- Host ----------
  socket.on('host:create', (rawQuiz, ack) => {
    const quiz = sanitizeQuiz(rawQuiz);
    if (!quiz) return ack?.({ error: 'Invalid quiz. Each question needs text, 2-4 choices and a correct answer.' });
    const pin = makePin();
    const game = {
      pin, quiz, host: socket.id, state: 'lobby', index: -1,
      players: new Map(), answers: new Map(), timer: null, startedAt: 0,
    };
    games.set(pin, game);
    socket.data.hostOf = pin;
    socket.join(pin);
    ack?.({ pin, title: quiz.title, total: quiz.questions.length });
  });

  const hostGame = () => {
    const g = games.get(socket.data.hostOf);
    return g && g.host === socket.id ? g : null;
  };

  socket.on('host:start', () => {
    const g = hostGame();
    if (!g || g.state !== 'lobby' || !g.players.size) return;
    g.index = 0;
    startQuestion(g);
  });

  socket.on('host:skip', () => {
    const g = hostGame();
    if (g) endQuestion(g);
  });

  socket.on('host:next', () => {
    const g = hostGame();
    if (!g || g.state !== 'reveal') return;
    if (g.index >= g.quiz.questions.length - 1) return finishGame(g);
    g.index++;
    startQuestion(g);
  });

  socket.on('host:kick', (id) => {
    const g = hostGame();
    const p = g?.players.get(id);
    if (!p) return;
    if (p.socketId) io.to(p.socketId).emit('player:kicked');
    g.players.delete(id);
    emitPlayers(g);
  });

  socket.on('host:close', () => {
    const g = hostGame();
    if (g) destroyGame(g);
  });

  // ---------- Player ----------
  socket.on('player:join', ({ pin, name, playerId } = {}, ack) => {
    const g = games.get(String(pin || '').trim());
    if (!g) return ack?.({ error: 'Game not found. Check the PIN.' });

    // Rejoin after refresh / reconnect
    const existing = playerId && g.players.get(playerId);
    if (existing) {
      existing.socketId = socket.id;
      socket.data.pin = g.pin;
      socket.data.playerId = existing.id;
      socket.join(g.pin);
      emitPlayers(g);
      const q = g.state === 'question' ? currentQuestion(g) : null;
      return ack?.({
        playerId: existing.id, name: existing.name, state: g.state,
        question: q && {
          index: g.index, total: g.quiz.questions.length, choices: q.choices,
          remaining: Math.max(0, q.time * 1000 - (Date.now() - g.startedAt)),
          answered: g.answers.has(existing.id),
        },
        score: existing.score,
      });
    }

    name = String(name || '').trim().slice(0, 20);
    if (!name) return ack?.({ error: 'Please enter a nickname.' });
    if (g.state !== 'lobby') return ack?.({ error: 'This game has already started.' });
    if (g.players.size >= MAX_PLAYERS) return ack?.({ error: 'This game is full.' });
    for (const p of g.players.values()) {
      if (p.name.toLowerCase() === name.toLowerCase()) return ack?.({ error: 'That nickname is taken.' });
    }
    const player = { id: randomId(), name, socketId: socket.id, score: 0, streak: 0, lastResult: null };
    g.players.set(player.id, player);
    socket.data.pin = g.pin;
    socket.data.playerId = player.id;
    socket.join(g.pin);
    emitPlayers(g);
    ack?.({ playerId: player.id, name, state: 'lobby', score: 0 });
  });

  socket.on('player:answer', (choice, ack) => {
    const g = games.get(socket.data.pin);
    if (!g || g.state !== 'question') return;
    const id = socket.data.playerId;
    if (!g.players.has(id) || g.answers.has(id)) return;
    const q = currentQuestion(g);
    choice = Number(choice);
    if (!Number.isInteger(choice) || choice < 0 || choice >= q.choices.length) return;
    g.answers.set(id, { choice, elapsed: Date.now() - g.startedAt });
    ack?.({ ok: true });
    io.to(g.host).emit('question:progress', { answered: g.answers.size, total: g.players.size });
    if (g.answers.size >= connectedCount(g) && g.answers.size >= g.players.size) endQuestion(g);
  });

  socket.on('disconnect', () => {
    const hostPin = socket.data.hostOf;
    if (hostPin) {
      const g = games.get(hostPin);
      if (g && g.host === socket.id) destroyGame(g);
      return;
    }
    const g = games.get(socket.data.pin);
    const p = g?.players.get(socket.data.playerId);
    if (!p || p.socketId !== socket.id) return;
    p.socketId = null;
    if (g.state === 'lobby') g.players.delete(p.id); // lobby leavers vanish; in-game players may rejoin
    emitPlayers(g);
  });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  server.listen(PORT, () => console.log(`Quiz server running on http://localhost:${PORT}`));
}
module.exports = { server, io, games };
