(() => {
  const socket = io();
  const st = { tick: null };
  const params = new URLSearchParams(location.search);
  let me = { pin: params.get('pin') || '', id: null, name: '' };
  let answered = false;
  let current = null; // last known screen, re-rendered on language change
  let theme = null;

  // Saved session (survives refresh) only counts when it is for this PIN
  try {
    const s = JSON.parse(safe.get('session') || 'null');
    if (s && (!me.pin || s.pin === me.pin)) me = s;
  } catch {}
  const saveSession = () => safe.set('session', JSON.stringify(me));
  const clearSession = () => { safe.del('session'); me = { pin: '', id: null, name: '' }; };

  const pinInput = $('pin');
  if (me.pin) pinInput.value = me.pin;
  if (params.get('pin')) { pinInput.hidden = true; fetchTheme(params.get('pin')); }
  function fetchTheme(pin) {
    fetch('/api/game/' + encodeURIComponent(pin)).then((r) => (r.ok ? r.json() : null)).then((g) => {
      if (g) { theme = g.theme; applyTheme(theme); $('default-logo').hidden = !!(theme.eventName || theme.logo); }
    }).catch(() => {});
  }

  function waiting(title, msg) {
    current = () => waiting(title, msg);
    $('wait-title').textContent = t(title); $('wait-name').textContent = me.name; $('wait-msg').textContent = t(msg === 'welcome' ? '' : msg);
    if (msg === 'wait_start' && theme?.welcome) $('wait-msg').textContent = theme.welcome;
    showView('v-wait');
  }

  function enter(res) {
    me.id = res.playerId; me.name = res.name; saveSession();
    theme = res.theme; applyTheme(theme);
    if (res.state === 'question' && res.question) showQuestion(res.question, res.question.remaining, res.score, res.question.answered);
    else if (res.state === 'slide') showSlide(res.slide);
    else if (res.state === 'reveal' && res.result) showResult(res.result);
    else if (res.state === 'ended' && res.end) showEnd(res.end, false);
    else if (res.state === 'lobby') waiting('in_title', 'wait_start');
    else waiting('in_title', 'wait_next');
  }

  $('join-form').addEventListener('submit', (e) => {
    e.preventDefault();
    me.pin = pinInput.value.trim();
    socket.emit('player:join', { pin: me.pin, name: $('nick').value }, (res) => {
      if (res.error) { $('join-error').textContent = t('err_' + res.error); return; }
      $('join-error').textContent = '';
      enter(res);
    });
  });

  socket.on('connect', () => {
    if (!me.pin || !me.id) return;
    socket.emit('player:join', { pin: me.pin, playerId: me.id }, (res) => {
      if (res.error) { clearSession(); showView('v-join'); return; }
      enter(res);
    });
  });

  function showQuestion(q, remaining, score, already) {
    answered = !!already;
    current = null;
    $('pq-count').textContent = t('q_of', { i: q.index + 1, n: q.total });
    $('pq-score').textContent = score || '';
    const box = $('pq-choices');
    box.classList.toggle('locked', answered);
    box.innerHTML = q.choices.map((c, i) => `<button class="choice c${i}" data-i="${i}"><span class="shape">${SHAPES[i]}</span>${esc(c)}</button>`).join('');
    countdown($('pq-timer'), remaining, st);
    showView('v-answer');
  }
  $('pq-choices').addEventListener('click', (e) => {
    const b = e.target.closest('.choice');
    if (!b || answered) return;
    answered = true;
    b.classList.add('picked');
    $('pq-choices').classList.add('locked');
    if (navigator.vibrate) navigator.vibrate(30);
    socket.emit('player:answer', Number(b.dataset.i));
  });

  function showSlide(s) {
    clearInterval(st.tick);
    current = () => showSlide(s);
    $('slide-text').textContent = s.text;
    showView('v-slide');
  }
  function showResult(r) {
    clearInterval(st.tick);
    current = () => showResult(r);
    const v = $('v-result');
    v.className = 'view center active ' + (r.poll ? 'neutral' : r.correct ? 'ok' : 'bad');
    $('res-title').textContent = r.poll ? (r.answered ? t('thanks') : t('timesup')) : r.correct ? t('correct') : r.answered ? t('wrong') : t('timesup');
    $('res-gain').textContent = r.poll ? '' : r.correct ? `+${r.gained}` : '+0';
    $('res-rank').textContent = r.poll ? '' : t('rank', r);
    $('res-streak').textContent = !r.poll && r.streak > 1 ? t('streak', { n: r.streak }) : '';
    showView('v-result');
  }
  function showEnd(r, celebrate = true) {
    clearInterval(st.tick);
    current = () => showEnd(r, false);
    $('pe-rank').textContent = r.rank <= 3 ? ['🥇 1', '🥈 2', '🥉 3'][r.rank - 1] : `#${r.rank}`;
    $('pe-score').textContent = t('pts_players', r);
    showView('v-end');
    if (celebrate && r.rank <= 3) confetti($('confetti'));
    safe.del('session');
  }

  socket.on('question:start', (q) => showQuestion(q, q.time * 1000, undefined, false));
  socket.on('slide:show', showSlide);
  socket.on('answer:result', showResult);
  socket.on('game:end', (r) => showEnd(r));
  socket.on('player:kicked', () => { clearSession(); showView('v-join'); toast(t('kicked')); });
  socket.on('game:closed', () => { clearSession(); showView('v-join'); toast(t('closed')); });
  $('pe-again').onclick = () => { clearSession(); location.href = '/'; };
  document.addEventListener('langchange', () => current && current());
})();
