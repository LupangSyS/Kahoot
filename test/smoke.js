// End-to-end smoke test: one host, three players, full game over real sockets.
const assert = require('assert');
const { io: connect } = require('socket.io-client');
const { server } = require('../server');

const once = (s, ev) => new Promise((r) => s.once(ev, r));
const emit = (s, ev, ...a) => new Promise((r) => s.emit(ev, ...a, r));

(async () => {
  await new Promise((r) => server.listen(0, r));
  const url = `http://localhost:${server.address().port}`;
  const mk = () => connect(url, { forceNew: true });
  const host = mk(), [a, b, c] = [mk(), mk(), mk()];

  const quiz = { title: 't', questions: [
    { text: 'q1', choices: ['x', 'y'], correct: 0, time: 5 },
    { text: 'q2', choices: ['x', 'y', 'z'], correct: 2, time: 5 },
  ] };
  assert((await emit(host, 'host:create', { title: 'bad', questions: [] })).error, 'rejects invalid quiz');
  const { pin } = await emit(host, 'host:create', quiz);
  assert(/^\d{6}$/.test(pin));

  assert((await emit(a, 'player:join', { pin: '000000', name: 'A' })).error, 'bad pin');
  const ja = await emit(a, 'player:join', { pin, name: 'Ann' });
  await emit(b, 'player:join', { pin, name: 'Bob' });
  await emit(c, 'player:join', { pin, name: 'Cy' });
  assert((await emit(mk(), 'player:join', { pin, name: 'ann' })).error, 'duplicate nickname');

  const resA = [], resB = [];
  a.on('answer:result', (r) => resA.push(r)); b.on('answer:result', (r) => resB.push(r));

  // Q1: Ann + Bob right, Cy wrong -> all answered, auto-ends
  let ended = once(host, 'question:end');
  host.emit('host:start');
  await once(a, 'question:start');
  a.emit('player:answer', 0); b.emit('player:answer', 0); c.emit('player:answer', 1);
  let r = await ended;
  assert.deepStrictEqual(r.counts, [2, 1]);
  assert.strictEqual(r.correct, 0);
  await new Promise((r) => setTimeout(r, 100));
  assert(resA[0].correct && resA[0].gained >= 900, 'fast correct answer scores ~1000');
  assert(resA[0].score > 0);

  // Q2: only Ann answers (right); host skips
  ended = once(host, 'question:end');
  host.emit('host:next');
  await once(a, 'question:start');
  a.emit('player:answer', 2);
  a.emit('player:answer', 0); // second answer must be ignored
  await new Promise((r) => setTimeout(r, 100));
  host.emit('host:skip');
  r = await ended;
  assert.deepStrictEqual(r.counts, [0, 0, 1]);
  assert.strictEqual(r.leaderboard[0].name, 'Ann');
  assert(r.last);
  await new Promise((r) => setTimeout(r, 100));
  assert(resA[1].streak === 2 && resB[1].streak === 0 && !resB[1].answered);

  // Rejoin with the saved player id mid-game
  const a2 = mk();
  const rj = await emit(a2, 'player:join', { pin, playerId: ja.playerId });
  assert.strictEqual(rj.name, 'Ann');
  assert(rj.score > 1000);

  const fin = once(host, 'game:end');
  host.emit('host:next');
  const end = await fin;
  assert.strictEqual(end.leaderboard[0].name, 'Ann');

  console.log('smoke test passed');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
