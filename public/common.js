// Shared helpers: i18n, theming, small utils. Loaded on every page.
const SHAPES = ['▲', '◆', '●', '■'];
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const safe = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  del: (k) => { try { localStorage.removeItem(k); } catch {} },
};

// ---------------- i18n ----------------
const I18N = {
  th: {
    join: 'เข้าร่วม', pin: 'รหัสห้อง (PIN)', nick: 'ชื่อเล่น', enter: 'เข้าห้อง',
    err_notfound: 'ไม่พบห้อง ตรวจสอบ PIN อีกครั้ง', err_noname: 'กรุณาใส่ชื่อเล่น', err_ended: 'เกมนี้จบแล้ว',
    err_full: 'ห้องเต็มแล้ว', err_taken: 'ชื่อนี้มีคนใช้แล้ว ลองชื่ออื่น',
    in_title: 'เข้าห้องแล้ว!', wait_start: 'รอพิธีกรเริ่มเกม…', wait_next: 'เตรียมพร้อม คำถามต่อไปกำลังมา…',
    look_screen: 'ดูที่หน้าจอใหญ่', answer_sent: 'ส่งคำตอบแล้ว', correct: 'ถูกต้อง!', wrong: 'ยังไม่ถูก', timesup: 'หมดเวลา!',
    thanks: 'ขอบคุณที่ร่วมโหวต!', rank: 'อันดับ {rank} จาก {players} · {score} คะแนน', streak: '🔥 ตอบถูกติดกัน {n} ข้อ',
    game_over: 'จบเกม', pts_players: '{score} คะแนน · {players} คน', play_again: 'เล่นอีกครั้ง',
    kicked: 'คุณถูกนำออกจากห้อง', closed: 'พิธีกรปิดห้องแล้ว', lang: 'EN',
    scan: 'สแกนเพื่อเข้าร่วม', or_go: 'หรือเปิด', with_pin: 'แล้วใส่ PIN', players: 'ผู้เล่น', start: 'เริ่มเกม',
    next: 'ถัดไป', skip: 'ข้าม', final_results: 'ดูผลรวม', next_q: 'ข้อต่อไป', next_slide: 'ต่อไป', answers: 'ตอบแล้ว',
    podium: 'ผู้ชนะ', leaderboard: 'อันดับคะแนน', new_game: 'กลับหน้าแอดมิน', fullscreen: 'เต็มจอ', hint_keys: 'กด Space / → เพื่อไปต่อ',
    q_of: 'ข้อ {i} / {n}', no_players: 'รอแขกสแกน QR…', click_kick: 'คลิกเพื่อนำออก', end_game: 'ปิดเกม',
    // admin
    admin: 'หลังบ้าน', login: 'เข้าสู่ระบบ', password: 'รหัสผ่านแอดมิน', wrong_pw: 'รหัสผ่านไม่ถูกต้อง', default_pw: '⚠ ยังใช้รหัสผ่านเริ่มต้น ตั้งค่า ADMIN_PASSWORD ก่อนใช้งานจริง',
    my_quizzes: 'ชุดคำถามของฉัน', new_quiz: '+ สร้างชุดใหม่', import: 'นำเข้า', export: 'ส่งออก', launch: '▶ เริ่มเกม', edit: 'แก้ไข', dup: 'คัดลอก', del: 'ลบ',
    confirm_del: 'ลบชุดคำถามนี้?', items: 'รายการ', logout: 'ออกจากระบบ', back: '← กลับ', save: 'บันทึก', saved: 'บันทึกแล้ว', save_launch: 'บันทึกและเริ่มเกม',
    tab_q: 'คำถาม', tab_theme: 'ธีม / ตกแต่ง', quiz_title: 'ชื่อชุดคำถาม', add_quiz: '+ คำถามคัดเลือก', add_poll: '+ โพล (ไม่มีคะแนน)', add_slide: '+ สไลด์',
    t_quiz: 'คำถาม', t_poll: 'โพล', t_slide: 'สไลด์', q_text: 'ข้อความ', q_body: 'รายละเอียด (ไม่บังคับ)', ans: 'คำตอบ {n}', ans_opt: 'คำตอบ {n} (ไม่บังคับ)',
    seconds: 'วินาที', upload_img: 'อัปโหลดรูป', remove_img: 'ลบรูป', uploading: 'กำลังอัปโหลด…', up: '↑', down: '↓',
    th_event: 'ชื่องาน / ชื่อคู่บ่าวสาว', th_sub: 'ข้อความรอง', th_welcome: 'ข้อความต้อนรับ (หน้ารอของแขก)', th_logo: 'โลโก้', th_bg: 'รูปพื้นหลัง',
    th_bg1: 'สีพื้นหลัง 1', th_bg2: 'สีพื้นหลัง 2', th_accent: 'สีปุ่มเน้น', th_text: 'สีตัวอักษร', th_font: 'ฟอนต์', th_choices: 'สีปุ่มคำตอบ',
    presets: 'ชุดสีสำเร็จรูป', preview: 'ตัวอย่าง', preview_q: 'ตัวอย่างคำถามที่นี่?', imp_fail: 'ไฟล์ไม่ถูกต้อง', pw_hint: 'รหัสผ่านแอดมิน',
  },
  en: {
    join: 'Join', pin: 'Game PIN', nick: 'Nickname', enter: 'Enter',
    err_notfound: 'Game not found. Check the PIN.', err_noname: 'Please enter a nickname.', err_ended: 'This game has ended.',
    err_full: 'This game is full.', err_taken: 'That nickname is taken.',
    in_title: "You're in!", wait_start: 'Waiting for the host to start…', wait_next: 'Get ready, next up…',
    look_screen: 'Look at the big screen', answer_sent: 'Answer sent', correct: 'Correct!', wrong: 'Incorrect', timesup: "Time's up!",
    thanks: 'Thanks for voting!', rank: 'Rank {rank} of {players} · {score} pts', streak: '🔥 {n} in a row',
    game_over: 'Game over', pts_players: '{score} points · {players} players', play_again: 'Play again',
    kicked: 'You were removed from the game', closed: 'The host closed the game', lang: 'TH',
    scan: 'Scan to join', or_go: 'or go to', with_pin: 'and enter PIN', players: 'players', start: 'Start',
    next: 'Next', skip: 'Skip', final_results: 'Final results', next_q: 'Next', next_slide: 'Continue', answers: 'Answers',
    podium: 'Winners', leaderboard: 'Leaderboard', new_game: 'Back to admin', fullscreen: 'Fullscreen', hint_keys: 'Press Space / → to continue',
    q_of: 'Question {i} / {n}', no_players: 'Waiting for guests to scan…', click_kick: 'Click to remove', end_game: 'Close game',
    admin: 'Admin', login: 'Log in', password: 'Admin password', wrong_pw: 'Wrong password', default_pw: '⚠ Default password in use. Set ADMIN_PASSWORD before going live.',
    my_quizzes: 'My quizzes', new_quiz: '+ New quiz', import: 'Import', export: 'Export', launch: '▶ Launch', edit: 'Edit', dup: 'Duplicate', del: 'Delete',
    confirm_del: 'Delete this quiz?', items: 'items', logout: 'Log out', back: '← Back', save: 'Save', saved: 'Saved', save_launch: 'Save & launch',
    tab_q: 'Questions', tab_theme: 'Theme / Design', quiz_title: 'Quiz title', add_quiz: '+ Question', add_poll: '+ Poll (no score)', add_slide: '+ Slide',
    t_quiz: 'Question', t_poll: 'Poll', t_slide: 'Slide', q_text: 'Text', q_body: 'Details (optional)', ans: 'Answer {n}', ans_opt: 'Answer {n} (optional)',
    seconds: 'sec', upload_img: 'Upload image', remove_img: 'Remove image', uploading: 'Uploading…', up: '↑', down: '↓',
    th_event: 'Event / couple name', th_sub: 'Subtitle', th_welcome: 'Welcome message (guest waiting screen)', th_logo: 'Logo', th_bg: 'Background image',
    th_bg1: 'Background colour 1', th_bg2: 'Background colour 2', th_accent: 'Accent colour', th_text: 'Text colour', th_font: 'Font', th_choices: 'Answer colours',
    presets: 'Colour presets', preview: 'Preview', preview_q: 'Your question appears here?', imp_fail: 'Invalid file', pw_hint: 'Admin password',
  },
};
let LANG = safe.get('lang') || ((navigator.language || '').startsWith('th') ? 'th' : 'th'); // Thai by default
const t = (k, vars = {}) => (I18N[LANG][k] ?? I18N.en[k] ?? k).replace(/\{(\w+)\}/g, (_, v) => vars[v] ?? '');
function applyI18n(root = document) {
  document.documentElement.lang = LANG;
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
}
function setLang(l) { LANG = l; safe.set('lang', l); applyI18n(); document.dispatchEvent(new Event('langchange')); }
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-toggle-lang]')) setLang(LANG === 'th' ? 'en' : 'th');
});
document.addEventListener('DOMContentLoaded', () => applyI18n());

// ---------------- theme ----------------
const DEFAULT_THEME = {
  eventName: '', subtitle: '', welcome: '', bg1: '#46178f', bg2: '#331166', accent: '#ffffff', text: '#ffffff', font: 'Prompt',
  bgImage: '', logo: '', choiceColors: ['#e21b3c', '#1368ce', '#d89e00', '#26890c'],
};
const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
function applyTheme(theme, root = document.documentElement, target = document.body) {
  const th = { ...DEFAULT_THEME, ...theme };
  const s = root.style;
  s.setProperty('--bg1', th.bg1); s.setProperty('--bg2', th.bg2); s.setProperty('--accent', th.accent); s.setProperty('--text', th.text);
  s.setProperty('--accent-ink', lum(th.accent) > 0.6 ? '#1c1c1c' : '#ffffff');
  th.choiceColors.forEach((c, i) => { s.setProperty('--c' + i, c); s.setProperty('--c' + i + '-ink', lum(c) > 0.7 ? '#1c1c1c' : '#ffffff'); });
  const fam = th.font === 'system' ? 'system-ui, "Segoe UI", Roboto, sans-serif' : `"${th.font}", system-ui, sans-serif`;
  s.setProperty('--font', fam);
  target.style.backgroundImage = th.bgImage
    ? `linear-gradient(rgba(0,0,0,.35), rgba(0,0,0,.35)), url("${th.bgImage}")`
    : `radial-gradient(circle at top, ${th.bg1}, ${th.bg2})`;
  if (th.font !== 'system' && !document.getElementById('font-' + th.font)) {
    const l = document.createElement('link');
    l.id = 'font-' + th.font; l.rel = 'stylesheet';
    l.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(th.font).replace(/%20/g, '+')}:wght@400;700;800&display=swap`;
    document.head.appendChild(l);
  }
  document.querySelectorAll('[data-theme-text]').forEach((el) => { el.textContent = th[el.dataset.themeText] || ''; el.hidden = !th[el.dataset.themeText]; });
  document.querySelectorAll('[data-theme-logo]').forEach((el) => { if (th.logo) el.src = th.logo; el.hidden = !th.logo; });
}

function countdown(el, ms, state) {
  clearInterval(state.tick);
  const end = Date.now() + ms;
  const upd = () => { const left = Math.max(0, Math.ceil((end - Date.now()) / 1000)); el.textContent = left; el.classList.toggle('low', left <= 5); };
  upd(); state.tick = setInterval(upd, 200);
}
function showView(id) {
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  $(id).classList.add('active');
}
function toast(msg) {
  const el = $('toast'); if (!el) return;
  el.textContent = msg; el.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (el.hidden = true), 2800);
}
function confetti(canvas) {
  const ctx = canvas.getContext('2d');
  canvas.width = innerWidth; canvas.height = innerHeight;
  const cols = ['#e21b3c', '#1368ce', '#d89e00', '#26890c', '#fff', '#f7a8c4'];
  const bits = Array.from({ length: 160 }, () => ({ x: Math.random() * canvas.width, y: -Math.random() * canvas.height, r: 4 + Math.random() * 6, v: 2 + Math.random() * 4, c: cols[(Math.random() * cols.length) | 0], a: Math.random() * 6 }));
  const end = Date.now() + 9000;
  (function frame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    bits.forEach((b) => { b.y += b.v; b.a += 0.1; b.x += Math.sin(b.a); ctx.fillStyle = b.c; ctx.fillRect(b.x, b.y, b.r, b.r * 1.6); if (b.y > canvas.height) b.y = -10; });
    if (Date.now() < end) requestAnimationFrame(frame); else ctx.clearRect(0, 0, canvas.width, canvas.height);
  })();
}
