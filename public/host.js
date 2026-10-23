(() => {
  const socket = io();
  const st = { tick: null };
  const token = safe.get('adminToken');
  const quizId = new URLSearchParams(location.search).get('quiz');
  let game = null;       // snapshot-ish state
  let redraw = null;     // re-render current screen (language change)
  let players = [];

  if (!token) location.href = '/admin';

  const setImg = (el, src) => { el.hidden = !src; if (src) el.src = src; };

  function boot() {
    const goAdmin = () => { safe.del('hostPin'); location.href = '/admin'; };
    const loaded = (snap) => {
      if (snap.error) return snap.error === 'auth' ? goAdmin() : (quizId ? goAdmin() : create());
      game = snap; safe.set('hostPin', snap.pin);
      history.replaceState(null, '', '/host');
      applyTheme(snap.theme);
      players = snap.players;
      render(snap);
    };
    const create = () => {
      if (!quizId) return goAdmin();
      socket.emit('host:create', { token, quizId }, loaded);
    };
    const pin = safe.get('hostPin');
    if (quizId) create();
    else if (pin) socket.emit('host:resume', { token, pin }, (s) => (s.error ? goAdmin() : loaded(s)));
    else goAdmin();
  }
  let booted = false;
  socket.on('connect', () => {
    if (!booted) { booted = true; boot(); return; }
    // reconnect after network blip: re-attach to the running game
    socket.emit('host:resume', { token, pin: game.pin }, (s) => { if (!s.error) { players = s.players; render(s); } });
  });

  function render(s) {
    if (s.state === 'lobby') showLobby();
    else if (s.state === 'slide') showSlide(s.slide);
    else if (s.state === 'question') showQuestion(s.question, s.question.remaining, s.question.answered);
    else if (s.state === 'reveal') showReveal(s.reveal);
    else if (s.state === 'ended') showFinal(s.final, false);
  }

  // ---------- lobby ----------
  function showLobby() {
    redraw = showLobby;
    $('game-pin').textContent = game.pin;
    $('join-host').textContent = location.host;
    fetch('/api/join-info/' + game.pin).then((r) => r.json()).then((j) => {
      $('qr').innerHTML = j.qr;
      $('join-host').textContent = j.url.replace(/^https?:\/\//, '').replace(/\/\?pin=.*/, '');
    });
    drawPlayers();
    showView('v-lobby');
  }
  function drawPlayers() {
    $('player-count').textContent = players.length;
    $('start-game').disabled = !players.length;
    $('kick-hint').hidden = !players.length;
    $('lobby-players').innerHTML = players.length
      ? players.map((p) => `<span class="chip ${p.online ? '' : 'offline'}" data-id="${p.id}">${esc(p.name)}</span>`).join('')
      : `<span class="hint">${t('no_players')}</span>`;
  }
  socket.on('lobby:players', (r) => { players = r.players; if ($('v-lobby').classList.contains('active')) drawPlayers(); });
  $('lobby-players').addEventListener('click', (e) => {
    const c = e.target.closest('.chip[data-id]');
    if (c) socket.emit('host:kick', c.dataset.id);
  });

  // ---------- items ----------
  function showSlide(s) {
    clearInterval(st.tick);
    redraw = () => showSlide(s);
    setImg($('sl-img'), s.image);
    $('sl-text').textContent = s.text; $('sl-body').textContent = s.body;
    game.state = 'slide';
    showView('v-slide');
  }
  function showQuestion(q, remaining, answered = 0) {
    redraw = () => showQuestion(q, remaining, answered);
    game.state = 'question'; game.q = q;
    $('hq-count').textContent = t('q_of', { i: q.index + 1, n: q.total });
    $('hq-text').textContent = q.text;
    setImg($('hq-img'), q.image);
    $('hq-answered').textContent = `${t('answers')}: ${answered}`;
    $('hq-choices').innerHTML = q.choices.map((c, i) => `<div class="choice c${i}"><span class="shape">${SHAPES[i]}</span>${esc(c)}</div>`).join('');
    countdown($('hq-timer'), remaining, st);
    showView('v-q');
  }
  socket.on('question:start', (q) => showQuestion(q, q.time * 1000));
  socket.on('slide:show', showSlide);
  socket.on('question:progress', ({ answered, total }) => { $('hq-answered').textContent = `${t('answers')}: ${answered} / ${total}`; });

  function showReveal(r) {
    clearInterval(st.tick);
    redraw = () => showReveal(r);
    game.state = 'reveal';
    $('hr-text').textContent = r.text;
    const max = Math.max(1, ...r.counts);
    $('hr-bars').innerHTML = r.counts.map((n, i) => `
      <div class="bar-col ${r.poll || i === r.correct ? '' : 'wrong'}">
        <div class="bar-label">${n}</div>
        <div class="bar-fill c${i}" style="height:${(n / max) * 170}px"></div>
        <div class="bar-label">${SHAPES[i]} ${!r.poll && i === r.correct ? '✓' : ''}</div>
        <div class="bar-name">${esc(r.choices[i])}</div>
      </div>`).join('');
    $('hr-board-wrap').hidden = r.poll;
    $('hr-board').innerHTML = r.leaderboard.map((p) => `<li><span>${p.rank}. ${esc(p.name)}</span><span>${p.score}</span></li>`).join('');
    $('next-q').textContent = r.last ? t('final_results') : t('next_q');
    showView('v-reveal');
  }
  socket.on('question:end', showReveal);

  function showFinal(f, celebrate = true) {
    clearInterval(st.tick);
    redraw = () => showFinal(f, false);
    game.state = 'ended';
    const medals = ['🥇', '🥈', '🥉'];
    const order = [1, 0, 2]; // 2nd, 1st, 3rd
    $('podium').innerHTML = order.filter((i) => f.top3[i]).map((i) => `<div class="step p${i + 1}"><div style="font-size:2.2rem">${medals[i]}</div>${esc(f.top3[i].name)}<div>${f.top3[i].score}</div></div>`).join('');
    $('final-board').innerHTML = f.leaderboard.map((p) => `<li><span>${p.rank}. ${esc(p.name)}</span><span>${p.score}</span></li>`).join('');
    showView('v-final');
    if (celebrate) confetti($('confetti'));
  }
  socket.on('game:end', showFinal);

  // ---------- controls ----------
  const advance = () => {
    if (['lobby', 'slide', 'reveal'].includes(game?.state)) socket.emit('host:advance');
  };
  $('start-game').onclick = () => socket.emit('host:advance');
  $('slide-next').onclick = advance;
  $('next-q').onclick = advance;
  $('skip-q').onclick = () => socket.emit('host:skip');
  $('back-admin').onclick = () => { socket.emit('host:close'); safe.del('hostPin'); location.href = '/admin'; };
  $('end-game').onclick = () => { if (confirm(t('end_game') + '?')) { socket.emit('host:close'); safe.del('hostPin'); location.href = '/admin'; } };
  $('fs').onclick = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen());
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input,textarea,select')) return;
    if (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'Enter') {
      e.preventDefault();
      if (game?.state !== 'lobby' || players.length) advance();
    }
  });
  document.addEventListener('langchange', () => redraw && redraw());
})();
