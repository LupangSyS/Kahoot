// End-to-end test: admin API, uploads, QR, then a full game (slide + quiz + poll) over real sockets.
process.env.DATA_DIR = require('fs').mkdtempSync(require('os').tmpdir() + '/quiz-test-');
process.env.ADMIN_PASSWORD = 'secret';
const assert = require('assert');
const { io: connect } = require('socket.io-client');
const { server } = require('../server');

const once = (s, ev) => new Promise((r) => s.once(ev, r));
const emit = (s, ev, ...a) => new Promise((r) => s.emit(ev, ...a, r));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = `http://localhost:${server.address().port}`;
  const http = async (method, path, body, token, headers = {}) => {
    const res = await fetch(base + path, {
      method, headers: { ...(body && !headers['Content-Type'] ? { 'Content-Type': 'application/json' } : {}), ...(token ? { 'x-admin-token': token } : {}), ...headers },
      body: body && (headers['Content-Type'] ? body : JSON.stringify(body)),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };

  // ---- admin auth + CRUD ----
  assert.strictEqual((await http('POST', '/api/admin/login', { password: 'nope' })).status, 401);
  const { token } = (await http('POST', '/api/admin/login', { password: 'secret' })).body;
  assert(token);
  assert.strictEqual((await http('GET', '/api/admin/quizzes')).status, 401, 'list requires auth');
  assert((await http('GET', '/api/admin/quizzes', null, token)).body.length >= 1, 'sample quiz seeded');

  const bad = await http('POST', '/api/admin/quizzes', { title: 'x', questions: [{ type: 'quiz', text: 'q', choices: ['a', 'b'] }] }, token);
  assert.strictEqual(bad.status, 400, 'quiz without correct answer rejected');

  const up = await http('POST', '/api/admin/upload', Buffer.from('89504e470d0a1a0a', 'hex'), token, { 'Content-Type': 'image/png' });
  assert(/^\/uploads\/\w+\.png$/.test(up.body.url));
  assert.strictEqual((await fetch(base + up.body.url)).status, 200, 'upload is served');
  assert.strictEqual((await http('POST', '/api/admin/upload', Buffer.from('<svg/>'), token, { 'Content-Type': 'image/svg+xml' })).status, 400, 'svg refused');

  const created = (await http('POST', '/api/admin/quizzes', {
    title: 'Wedding',
    theme: { eventName: 'A & B', bg1: '#112233', bgImage: 'http://evil/x.png', font: 'NotAFont' },
    questions: [
      { type: 'slide', text: 'Welcome', body: 'hi', image: up.body.url },
      // blank first answer: correct index must follow the text, not the slot
      { type: 'quiz', text: 'q1', choices: ['', 'x', 'y'], correct: 2, time: 5 },
      { type: 'poll', text: 'p1', choices: ['u', 'v'], time: 5 },
    ],
  }, token)).body;
  assert.strictEqual(created.theme.bgImage, '', 'external bg image stripped');
  assert.strictEqual(created.theme.font, 'Prompt', 'unknown font falls back');
  assert.deepStrictEqual(created.questions[1].choices, ['x', 'y']);
  assert.strictEqual(created.questions[1].correct, 1);

  // ---- game ----
  const mk = () => connect(base, { forceNew: true });
  const host = mk(), [a, b, c] = [mk(), mk(), mk()];
  assert.strictEqual((await emit(host, 'host:create', { token: 'bad', quizId: created.id })).error, 'auth');
  const snap = await emit(host, 'host:create', { token, quizId: created.id });
  const pin = snap.pin;
  assert(/^\d{6}$/.test(pin));

  const info = (await http('GET', `/api/join-info/${pin}`)).body;
  assert(info.qr.startsWith('<svg') && info.url.endsWith(`/?pin=${pin}`));
  assert.strictEqual((await http('GET', `/api/game/${pin}`)).body.theme.eventName, 'A & B');

  assert.strictEqual((await emit(a, 'player:join', { pin: '000000', name: 'A' })).error, 'notfound');
  const ja = await emit(a, 'player:join', { pin, name: 'Ann' });
  assert.strictEqual(ja.theme.eventName, 'A & B');
  await emit(b, 'player:join', { pin, name: 'Bob' });
  await emit(c, 'player:join', { pin, name: 'Cy' });
  assert.strictEqual((await emit(mk(), 'player:join', { pin, name: 'ann' })).error, 'taken');

  const resA = [], resB = [];
  a.on('answer:result', (r) => resA.push(r)); b.on('answer:result', (r) => resB.push(r));

  // slide
  let slide = once(a, 'slide:show');
  host.emit('host:advance');
  assert.strictEqual((await slide).text, 'Welcome');

  // Q1 (all answer -> auto end)
  let ended = once(host, 'question:end');
  host.emit('host:advance');
  await once(a, 'question:start');
  a.emit('player:answer', 1); b.emit('player:answer', 1); c.emit('player:answer', 0);
  let r = await ended;
  assert.deepStrictEqual(r.counts, [1, 2]);
  assert.strictEqual(r.correct, 1);
  await wait(100);
  assert(resA[0].correct && resA[0].gained >= 900);

  // host refreshes mid-game and resumes
  const host2 = mk();
  const resumed = await emit(host2, 'host:resume', { token, pin });
  assert.strictEqual(resumed.state, 'reveal');
  assert.strictEqual(resumed.reveal.correct, 1);
  host.disconnect();

  // Q2 poll: no scoring; Cy skips, host ends it
  ended = once(host2, 'question:end');
  host2.emit('host:advance');
  await once(a, 'question:start');
  a.emit('player:answer', 0); b.emit('player:answer', 1);
  await wait(100);
  host2.emit('host:skip');
  r = await ended;
  assert(r.poll && r.last);
  assert.deepStrictEqual(r.counts, [1, 1]);
  await wait(100);
  assert(resA[1].poll && resA[1].gained === 0);
  assert.strictEqual(resA[1].score, resA[0].score, 'poll gives no points');

  // late joiner in end-of-game state is refused; rejoin works
  const a2 = mk();
  const rj = await emit(a2, 'player:join', { pin, playerId: ja.playerId });
  assert.strictEqual(rj.name, 'Ann');
  assert.strictEqual(rj.state, 'reveal');
  assert(rj.result.rank >= 1);

  const fin = once(host2, 'game:end');
  host2.emit('host:advance');
  const end = await fin;
  assert(['Ann', 'Bob'].includes(end.top3[0].name));
  assert.strictEqual((await emit(mk(), 'player:join', { pin, name: 'Late' })).error, 'ended');

  console.log('all tests passed');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
