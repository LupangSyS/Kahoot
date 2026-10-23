(() => {
  let token = safe.get('adminToken');
  let quiz = null;      // quiz being edited ({id?, title, theme, questions})
  const FONTS = ['system', 'Prompt', 'Kanit', 'Sarabun', 'Mitr', 'Playfair Display', 'Dancing Script'];
  const PRESETS = [
    { name: 'Classic', bg1: '#46178f', bg2: '#331166', accent: '#ffffff', text: '#ffffff', choiceColors: ['#e21b3c', '#1368ce', '#d89e00', '#26890c'] },
    { name: 'Rose Gold', bg1: '#b76e79', bg2: '#6d3b47', accent: '#f6e3c5', text: '#ffffff', choiceColors: ['#c2185b', '#7b5ea7', '#c9962b', '#4a7c59'] },
    { name: 'Sage & Cream', bg1: '#7d8f69', bg2: '#4a5a3c', accent: '#f4ecd8', text: '#ffffff', choiceColors: ['#a4463f', '#3b6a8f', '#b8892b', '#5b7f4a'] },
    { name: 'Navy & Gold', bg1: '#1b2a49', bg2: '#0c1426', accent: '#d4af37', text: '#ffffff', choiceColors: ['#b3314c', '#2d5fa8', '#d4af37', '#2e7d5b'] },
    { name: 'Blush', bg1: '#f4b6c2', bg2: '#d98aa0', accent: '#ffffff', text: '#3a1f28', choiceColors: ['#d6336c', '#5c7cfa', '#f59f00', '#37b24d'] },
  ];

  const api = async (method, url, body, raw) => {
    const res = await fetch(url, {
      method,
      headers: { 'x-admin-token': token || '', ...(raw ? { 'Content-Type': raw } : body ? { 'Content-Type': 'application/json' } : {}) },
      body: raw ? body : body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) { logout(); throw new Error('auth'); }
    if (!res.ok) throw new Error(data.error || 'Error');
    return data;
  };
  function logout() { safe.del('adminToken'); token = null; showView('v-login'); }
  $('logout').onclick = logout;

  // ---------- login ----------
  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const r = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: $('pw').value }) });
      const d = await r.json();
      if (!r.ok) throw new Error();
      token = d.token; safe.set('adminToken', token);
      $('pw-warn').hidden = !d.defaultPassword;
      $('login-error').textContent = '';
      showList();
    } catch { $('login-error').textContent = t('wrong_pw'); }
  });

  // ---------- list ----------
  async function showList() {
    applyTheme(DEFAULT_THEME);
    showView('v-list');
    const list = await api('GET', '/api/admin/quizzes');
    $('qlist').innerHTML = list.map((q) => `
      <div class="qcard" data-id="${q.id}">
        <div style="display:flex;gap:12px;align-items:center">
          <div class="sw" style="background:linear-gradient(${q.theme.bg1},${q.theme.bg2})"></div>
          <div><strong>${esc(q.title)}</strong><div class="muted">${q.count} ${t('items')}</div></div>
        </div>
        <div class="row" style="margin:0">
          <button class="btn primary small" data-act="launch">${t('launch')}</button>
          <button class="btn small" data-act="edit">${t('edit')}</button>
          <button class="btn small" data-act="dup">${t('dup')}</button>
          <button class="btn small" data-act="export">${t('export')}</button>
          <button class="btn small danger" data-act="del">${t('del')}</button>
        </div>
      </div>`).join('');
  }
  $('qlist').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const id = b.closest('.qcard').dataset.id;
    const act = b.dataset.act;
    if (act === 'launch') location.href = '/host?quiz=' + id;
    else if (act === 'edit') edit(await api('GET', '/api/admin/quizzes/' + id));
    else if (act === 'dup') { const q = await api('GET', '/api/admin/quizzes/' + id); await api('POST', '/api/admin/quizzes', { ...q, title: q.title + ' (copy)' }); showList(); }
    else if (act === 'export') {
      const q = await api('GET', '/api/admin/quizzes/' + id);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(q, null, 2)], { type: 'application/json' }));
      a.download = (q.title || 'quiz').replace(/[^\w฀-๿-]+/g, '_') + '.json'; a.click();
    } else if (act === 'del' && confirm(t('confirm_del'))) { await api('DELETE', '/api/admin/quizzes/' + id); showList(); }
  });
  $('new-quiz').onclick = () => edit({ title: '', theme: { ...DEFAULT_THEME, ...PRESETS[0] }, questions: [newItem('quiz')] });
  $('import-btn').onclick = () => $('import-file').click();
  $('import-file').onchange = async (e) => {
    try {
      const q = JSON.parse(await e.target.files[0].text());
      await api('POST', '/api/admin/quizzes', q); showList();
    } catch (err) { if (err.message !== 'auth') toast(t('imp_fail') + (err.message ? ': ' + err.message : '')); }
    e.target.value = '';
  };

  // ---------- editor ----------
  const newItem = (type) => ({ type, text: '', body: '', image: '', choices: type === 'slide' ? [] : ['', '', '', ''], correct: type === 'quiz' ? 0 : null, time: 20 });
  function edit(q) {
    quiz = JSON.parse(JSON.stringify(q));
    quiz.theme = { ...DEFAULT_THEME, ...quiz.theme };
    quiz.questions.forEach((it) => { while (it.type !== 'slide' && it.choices.length < 4) it.choices.push(''); });
    $('quiz-title').value = quiz.title;
    $('edit-error').textContent = '';
    renderItems(); renderTheme(); tab('q');
    showView('v-edit');
  }
  function tab(name) {
    document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
    $('tab-q').hidden = name !== 'q'; $('tab-theme').hidden = name !== 'theme';
  }
  document.querySelectorAll('.tab').forEach((b) => (b.onclick = () => { readItems(); tab(b.dataset.tab); }));
  $('back').onclick = showList;

  function renderItems() {
    $('items').innerHTML = quiz.questions.map((it, i) => `
      <div class="item" data-i="${i}">
        <div class="head">
          <span class="badge">${i + 1} · ${t('t_' + it.type)}</span>
          ${it.type !== 'slide' ? `<select class="time">${[10, 15, 20, 30, 45, 60, 90].map((s) => `<option value="${s}" ${s === it.time ? 'selected' : ''}>${s} ${t('seconds')}</option>`).join('')}</select>` : ''}
          <span style="flex:1"></span>
          <button class="btn small" data-a="up">${t('up')}</button><button class="btn small" data-a="down">${t('down')}</button>
          <button class="btn small danger" data-a="del">✕</button>
        </div>
        <textarea class="f-text" rows="2" maxlength="300" placeholder="${t('q_text')}">${esc(it.text)}</textarea>
        ${it.type === 'slide' ? `<textarea class="f-body" rows="2" maxlength="600" placeholder="${t('q_body')}">${esc(it.body)}</textarea>` : ''}
        <div class="row" style="margin:0">
          ${it.image ? `<img class="thumb" src="${esc(it.image)}" alt="">` : ''}
          <label class="btn small" for="up-${i}">${t('upload_img')}</label><input id="up-${i}" class="f-up" type="file" accept="image/*" hidden>
          ${it.image ? `<button class="btn small" data-a="rmimg">${t('remove_img')}</button>` : ''}
        </div>
        ${it.type !== 'slide' ? [0, 1, 2, 3].map((c) => `
          <div class="ch">
            ${it.type === 'quiz' ? `<input type="radio" name="cor${i}" value="${c}" ${it.correct === c ? 'checked' : ''}>` : ''}
            <span class="dot c${c}">${SHAPES[c]}</span>
            <input class="f-ch" data-c="${c}" maxlength="100" value="${esc(it.choices[c] || '')}" placeholder="${t(c > 1 ? 'ans_opt' : 'ans', { n: c + 1 })}">
          </div>`).join('') : ''}
      </div>`).join('');
  }
  function readItems() {
    quiz.title = $('quiz-title').value;
    document.querySelectorAll('#items .item').forEach((el) => {
      const it = quiz.questions[Number(el.dataset.i)];
      it.text = el.querySelector('.f-text').value;
      if (it.type === 'slide') it.body = el.querySelector('.f-body').value;
      else {
        it.time = Number(el.querySelector('.time').value);
        it.choices = [...el.querySelectorAll('.f-ch')].map((x) => x.value);
        const r = el.querySelector('input[type=radio]:checked');
        if (it.type === 'quiz') it.correct = r ? Number(r.value) : null;
      }
    });
  }
  document.addEventListener('langchange', () => { if ($('v-edit').classList.contains('active')) { readItems(); renderItems(); } });

  $('items').addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    readItems();
    const i = Number(b.closest('.item').dataset.i);
    const a = b.dataset.a;
    if (a === 'del') quiz.questions.splice(i, 1);
    else if (a === 'rmimg') quiz.questions[i].image = '';
    else { const j = a === 'up' ? i - 1 : i + 1; if (j >= 0 && j < quiz.questions.length) [quiz.questions[i], quiz.questions[j]] = [quiz.questions[j], quiz.questions[i]]; }
    renderItems();
  });
  $('items').addEventListener('change', async (e) => {
    if (!e.target.classList.contains('f-up')) return;
    readItems();
    const i = Number(e.target.closest('.item').dataset.i);
    quiz.questions[i].image = (await upload(e.target.files[0])) || quiz.questions[i].image;
    renderItems();
  });
  for (const k of ['quiz', 'poll', 'slide']) $('add-' + k).onclick = () => { readItems(); quiz.questions.push(newItem(k)); renderItems(); $('items').lastElementChild?.scrollIntoView({ behavior: 'smooth' }); };

  async function upload(file) {
    if (!file) return '';
    toast(t('uploading'));
    try { return (await api('POST', '/api/admin/upload', file, file.type)).url; }
    catch (err) { toast(err.message); return ''; }
  }

  // ---------- theme ----------
  const ids = ['eventName', 'subtitle', 'welcome'];
  const colors = ['bg1', 'bg2', 'accent', 'text'];
  function renderTheme() {
    const th = quiz.theme;
    $('presets').innerHTML = PRESETS.map((p, i) => `<div class="swatch" data-p="${i}" title="${p.name}"><i style="background:${p.bg1}"></i><i style="background:${p.bg2}"></i><i style="background:${p.accent}"></i>${p.choiceColors.map((c) => `<i style="background:${c}"></i>`).join('')}</div>`).join('');
    $('th-font').innerHTML = FONTS.map((f) => `<option ${f === th.font ? 'selected' : ''}>${f}</option>`).join('');
    ids.forEach((k) => ($('th-' + k).value = th[k]));
    colors.forEach((k) => ($('th-' + k).value = th[k]));
    document.querySelectorAll('.th-c').forEach((el) => (el.value = th.choiceColors[el.dataset.i]));
    for (const [key, imgId] of [['logo', 'th-logo-img'], ['bgImage', 'th-bg-img']]) { $(imgId).hidden = !th[key]; if (th[key]) $(imgId).src = th[key]; }
    previewTheme();
  }
  function readTheme() {
    const th = quiz.theme;
    ids.forEach((k) => (th[k] = $('th-' + k).value));
    colors.forEach((k) => (th[k] = $('th-' + k).value));
    th.font = $('th-font').value;
    document.querySelectorAll('.th-c').forEach((el) => (th.choiceColors[el.dataset.i] = el.value));
  }
  function previewTheme() {
    const pv = $('preview');
    applyTheme(quiz.theme, pv, pv); // scoped CSS vars + background on the preview box
    applyTheme(quiz.theme, document.documentElement, document.body); // whole admin page adopts the theme too
  }
  $('tab-theme').addEventListener('input', () => { readTheme(); previewTheme(); });
  $('presets').addEventListener('click', (e) => {
    const s = e.target.closest('.swatch'); if (!s) return;
    Object.assign(quiz.theme, JSON.parse(JSON.stringify(PRESETS[Number(s.dataset.p)])));
    delete quiz.theme.name;
    renderTheme();
  });
  async function themeImage(inputId, key) {
    $(inputId).onchange = async (e) => { const u = await upload(e.target.files[0]); if (u) { quiz.theme[key] = u; renderTheme(); } };
  }
  themeImage('up-logo', 'logo'); themeImage('up-bg', 'bgImage');
  $('rm-logo').onclick = () => { quiz.theme.logo = ''; renderTheme(); };
  $('rm-bg').onclick = () => { quiz.theme.bgImage = ''; renderTheme(); };

  // ---------- save ----------
  async function save() {
    readItems(); readTheme();
    $('edit-error').textContent = '';
    try {
      const saved = quiz.id ? await api('PUT', '/api/admin/quizzes/' + quiz.id, quiz) : await api('POST', '/api/admin/quizzes', quiz);
      quiz.id = saved.id;
      toast(t('saved'));
      return saved;
    } catch (err) { if (err.message !== 'auth') $('edit-error').textContent = err.message; return null; }
  }
  $('save').onclick = save;
  $('save-launch').onclick = async () => { const s = await save(); if (s) location.href = '/host?quiz=' + s.id; };

  // ---------- boot ----------
  if (token) api('GET', '/api/admin/quizzes').then(() => showList()).catch(() => {});
})();
