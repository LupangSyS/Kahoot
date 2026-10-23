(() => {
  const socket = io();
  const $ = (id) => document.getElementById(id);
  const SHAPES = ['▲', '◆', '●', '■'];
  const SAMPLE = {
    title: 'General Knowledge',
    questions: [
      { text: 'What is the capital of France?', choices: ['Berlin', 'Paris', 'Madrid', 'Rome'], correct: 1, time: 15 },
      { text: 'Which planet is known as the Red Planet?', choices: ['Venus', 'Jupiter', 'Mars', 'Mercury'], correct: 2, time: 15 },
      { text: 'How many continents are there?', choices: ['5', '6', '7', '8'], correct: 2, time: 15 },
      { text: 'Which is the largest ocean?', choices: ['Atlantic', 'Pacific', 'Indian', 'Arctic'], correct: 1, time: 20 },
    ],
  };

  // ---------- helpers ----------
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function show(id) {
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    $(id).classList.add('active');
  }
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 2500);
  }
  let tick = null;
  function countdown(el, ms) {
    clearInterval(tick);
    const end = Date.now() + ms;
    const upd = () => { el.textContent = Math.max(0, Math.ceil((end - Date.now()) / 1000)); };
    upd(); tick = setInterval(upd, 200);
  }
  function renderBoard(ol, rows) {
    ol.innerHTML = rows.map((r) => `<li><span>${r.rank}. ${esc(r.name)}</span><span>${r.score}</span></li>`).join('');
  }
  const store = {
    get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { sessionStorage.setItem(k, v); } catch {} },
    del: (k) => { try { sessionStorage.removeItem(k); } catch {} },
  };

  // =================== PLAYER ===================
  let me = { pin: store.get('pin'), id: store.get('pid'), name: store.get('pname') };

  function enterGame(res) {
    me.id = res.playerId; me.name = res.name;
    store.set('pin', me.pin); store.set('pid', me.id); store.set('pname', me.name);
    if (res.state === 'question' && res.question) {
      showQuestion(res.question, res.question.remaining, res.score, res.question.answered);
    } else if (res.state === 'lobby') {
      waiting("You're in!", 'Waiting for the host to start…');
    } else {
      waiting('Get ready', 'Next question is coming up…');
    }
  }
  function waiting(title, msg) {
    $('wait-title').textContent = title; $('wait-name').textContent = me.name; $('wait-msg').textContent = msg;
    show('v-wait');
  }

  $('join-form').addEventListener('submit', (e) => {
    e.preventDefault();
    me.pin = $('pin').value.trim();
    socket.emit('player:join', { pin: me.pin, name: $('nick').value }, (res) => {
      if (res.error) { $('join-error').textContent = res.error; return; }
      $('join-error').textContent = '';
      enterGame(res);
    });
  });

  // auto-rejoin after refresh / network blip
  function tryRejoin() {
    if (!me.pin || !me.id || hosting) return;
    socket.emit('player:join', { pin: me.pin, playerId: me.id }, (res) => {
      if (res.error) { clearSession(); show('v-join'); return; }
      enterGame(res);
    });
  }
  function clearSession() { ['pin', 'pid', 'pname'].forEach(store.del); me = {}; }
  socket.on('connect', tryRejoin);

  let answered = false;
  function showQuestion(q, remaining, score, alreadyAnswered) {
    answered = !!alreadyAnswered;
    $('pq-count').textContent = `${q.index + 1} / ${q.total}`;
    $('pq-score').textContent = score ?? '';
    const box = $('pq-choices');
    box.classList.toggle('locked', answered);
    box.innerHTML = q.choices.map((c, i) => `<button class="choice c${i}" data-i="${i}"><span class="shape">${SHAPES[i]}</span>${esc(c)}</button>`).join('');
    countdown($('pq-timer'), remaining);
    show('v-answer');
  }
  $('pq-choices').addEventListener('click', (e) => {
    const b = e.target.closest('.choice');
    if (!b || answered) return;
    answered = true;
    b.classList.add('picked');
    $('pq-choices').classList.add('locked');
    socket.emit('player:answer', Number(b.dataset.i));
  });

  socket.on('question:start', (q) => {
    if (hosting) return showHostQuestion(q);
    showQuestion(q, q.time * 1000, undefined, false);
  });
  socket.on('answer:result', (r) => {
    clearInterval(tick);
    const v = $('v-result');
    v.classList.remove('v-result-correct', 'v-result-wrong');
    v.classList.add(r.correct ? 'v-result-correct' : 'v-result-wrong');
    $('res-title').textContent = r.correct ? 'Correct!' : r.answered ? 'Incorrect' : "Time's up!";
    $('res-gain').textContent = r.correct ? `+${r.gained}` : '+0';
    $('res-rank').textContent = `Rank ${r.rank} of ${r.players} · ${r.score} pts`;
    $('res-streak').textContent = r.streak > 1 ? `🔥 ${r.streak} in a row` : '';
    show('v-result');
  });
  socket.on('game:end', (r) => {
    clearInterval(tick);
    if (hosting) return showHostEnd(r);
    $('pe-rank').textContent = r.rank <= 3 ? ['🥇 1st', '🥈 2nd', '🥉 3rd'][r.rank - 1] : `#${r.rank}`;
    $('pe-score').textContent = `${r.score} points · ${r.players} players`;
    show('v-playerend');
    clearSession();
  });
  socket.on('player:kicked', () => { clearSession(); show('v-join'); toast('You were removed from the game'); });
  socket.on('game:closed', () => {
    if (hosting) return;
    clearSession(); show('v-join'); toast('The host closed the game');
  });
  $('pe-again').onclick = () => show('v-join');

  // =================== HOST ===================
  let hosting = false;
  let quiz = JSON.parse(JSON.stringify(SAMPLE));

  $('to-host').onclick = () => { renderEditor(); show('v-editor'); };
  $('back-join').onclick = () => show('v-join');

  function renderEditor() {
    $('quiz-title').value = quiz.title;
    $('questions').innerHTML = quiz.questions.map((q, qi) => `
      <div class="qrow" data-q="${qi}">
        <div class="head">
          <input type="text" class="q-text" placeholder="Question ${qi + 1}" value="${esc(q.text)}" maxlength="200">
          <select class="q-time">${[10, 15, 20, 30, 60].map((t) => `<option value="${t}" ${t === q.time ? 'selected' : ''}>${t}s</option>`).join('')}</select>
          <button class="del" title="Remove" type="button">✕</button>
        </div>
        ${[0, 1, 2, 3].map((ci) => `
          <div class="ch">
            <input type="radio" name="correct${qi}" value="${ci}" ${q.correct === ci ? 'checked' : ''} title="Correct answer">
            <span class="shape">${SHAPES[ci]}</span>
            <input type="text" class="q-choice" data-c="${ci}" placeholder="Answer ${ci + 1}${ci > 1 ? ' (optional)' : ''}" value="${esc(q.choices[ci] || '')}" maxlength="100">
          </div>`).join('')}
      </div>`).join('');
  }
  function readEditor() {
    quiz.title = $('quiz-title').value;
    quiz.questions = [...document.querySelectorAll('.qrow')].map((row) => ({
      text: row.querySelector('.q-text').value,
      time: Number(row.querySelector('.q-time').value),
      choices: [...row.querySelectorAll('.q-choice')].map((i) => i.value),
      correct: Number((row.querySelector('input[type=radio]:checked') || {}).value ?? 0),
    }));
  }
  $('questions').addEventListener('click', (e) => {
    if (!e.target.classList.contains('del')) return;
    readEditor();
    quiz.questions.splice(Number(e.target.closest('.qrow').dataset.q), 1);
    renderEditor();
  });
  $('add-q').onclick = () => { readEditor(); quiz.questions.push({ text: '', choices: ['', '', '', ''], correct: 0, time: 20 }); renderEditor(); };
  $('load-sample').onclick = () => { quiz = JSON.parse(JSON.stringify(SAMPLE)); renderEditor(); };

  $('create-game').onclick = () => {
    readEditor();
    // blank choices must not shift the index of the correct answer: compact them and remap
    const cleaned = quiz.questions.map((q) => {
      const kept = []; let correct = -1;
      q.choices.forEach((c, i) => { if (c.trim()) { if (i === q.correct) correct = kept.length; kept.push(c); } });
      return { ...q, choices: kept, correct };
    });
    socket.emit('host:create', { title: quiz.title, questions: cleaned }, (res) => {
      if (res.error) { $('editor-error').textContent = res.error; return; }
      $('editor-error').textContent = '';
      hosting = true;
      clearSession();
      $('game-pin').textContent = res.pin;
      $('join-url').textContent = location.host;
      $('lobby-players').innerHTML = ''; $('player-count').textContent = 0; $('start-game').disabled = true;
      show('v-lobby');
    });
  };

  socket.on('lobby:players', ({ players }) => {
    if (!hosting) return;
    $('player-count').textContent = players.length;
    $('start-game').disabled = players.length === 0;
    $('lobby-players').innerHTML = players.map((p) => `<span class="chip ${p.online ? '' : 'offline'}" data-id="${p.id}" title="Click to remove">${esc(p.name)}</span>`).join('');
  });
  $('lobby-players').addEventListener('click', (e) => {
    const c = e.target.closest('.chip');
    if (c) socket.emit('host:kick', c.dataset.id);
  });
  $('start-game').onclick = () => socket.emit('host:start');
  $('skip-q').onclick = () => socket.emit('host:skip');
  $('next-q').onclick = () => socket.emit('host:next');

  let hostQ = null;
  function showHostQuestion(q) {
    hostQ = q;
    $('hq-count').textContent = `Question ${q.index + 1} / ${q.total}`;
    $('hq-text').textContent = q.text;
    $('hq-answered').textContent = `Answers: 0`;
    $('hq-choices').innerHTML = q.choices.map((c, i) => `<div class="choice c${i}"><span class="shape">${SHAPES[i]}</span>${esc(c)}</div>`).join('');
    countdown($('hq-timer'), q.time * 1000);
    show('v-hostq');
  }
  socket.on('question:progress', ({ answered: a, total }) => { if (hosting) $('hq-answered').textContent = `Answers: ${a} / ${total}`; });
  socket.on('question:end', (r) => {
    if (!hosting) return;
    clearInterval(tick);
    $('hr-text').textContent = hostQ.text;
    const max = Math.max(1, ...r.counts);
    $('hr-bars').innerHTML = r.counts.map((n, i) => `
      <div class="bar-col ${i === r.correct ? '' : 'wrong'}">
        <div class="bar-label">${n}</div>
        <div class="bar-fill c${i}" style="height:${(n / max) * 160}px"></div>
        <div class="bar-label">${SHAPES[i]} ${i === r.correct ? '✓' : ''}</div>
      </div>`).join('');
    renderBoard($('hr-board'), r.leaderboard);
    $('next-q').textContent = r.last ? 'Final results' : 'Next question';
    show('v-hostr');
  });
  function showHostEnd(r) {
    const order = [1, 0, 2]; // 2nd, 1st, 3rd
    $('podium').innerHTML = order.filter((i) => r.leaderboard[i])
      .map((i) => `<div class="step p${i + 1}">${['🥇', '🥈', '🥉'][i]}<br>${esc(r.leaderboard[i].name)}<br>${r.leaderboard[i].score}</div>`).join('');
    renderBoard($('final-board'), r.leaderboard);
    show('v-hostend');
  }
  $('new-game').onclick = () => { socket.emit('host:close'); hosting = false; location.reload(); };

  window.addEventListener('beforeunload', () => {});
  if (me.pin && me.id && socket.connected) tryRejoin();
})();
