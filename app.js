// ===== 状態 =====
// themes: [{ text: string, on: boolean, custom: boolean }]
const STORAGE_KEY = 'pairTalkThemeMaker.v1';
const MAX_CUSTOM = 50;

let themes = [];
let trialPrevIndex = -1;
let playPrevIndex = -1;
let trialSpinTimer = null;
let playSpinTimer = null;
let countdownTimer = null;
let remainingSec = 0;
let totalSec = 0;

// ===== 初期化 =====
function init() {
  const hash = window.location.hash;
  if (hash.startsWith('#play=')) {
    enterPlayMode(hash.slice(6));
  } else {
    enterEditorMode();
  }
}

// ===== 設定モード =====
function enterEditorMode() {
  document.getElementById('editorView').classList.remove('hidden');
  document.getElementById('playView').classList.add('hidden');

  themes = loadThemes();
  renderThemeList();
  updateCount();
  bindEditorEvents();
  renderTrialSlot('スタートを押してね');
}

function loadThemes() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const data = JSON.parse(saved);
      if (Array.isArray(data) && data.length > 0) return data;
    } catch (e) { /* fall through */ }
  }
  return DEFAULT_THEMES.map(t => ({ text: t, on: true, custom: false }));
}

function saveThemes() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(themes));
}

function renderThemeList() {
  const list = document.getElementById('themeList');
  const tpl = document.getElementById('themeRowTpl');
  list.innerHTML = '';
  themes.forEach((t, i) => {
    const row = tpl.content.firstElementChild.cloneNode(true);
    if (!t.on) row.classList.add('disabled');
    if (t.custom) row.classList.add('custom');

    const cb = row.querySelector('.theme-enable');
    cb.checked = t.on;
    cb.addEventListener('change', () => {
      themes[i].on = cb.checked;
      row.classList.toggle('disabled', !cb.checked);
      saveThemes();
      updateCount();
    });

    row.querySelector('.theme-num').textContent = (i + 1).toString();

    const txt = row.querySelector('.theme-text');
    txt.innerHTML = t.text;
    txt.addEventListener('blur', () => {
      const newText = txt.innerHTML.trim();
      if (newText) {
        themes[i].text = newText;
        themes[i].custom = true;
        row.classList.add('custom');
        saveThemes();
      } else {
        txt.innerHTML = t.text;
      }
    });

    row.querySelector('.theme-del').addEventListener('click', () => {
      if (confirm('このテーマを削除しますか？')) {
        themes.splice(i, 1);
        saveThemes();
        renderThemeList();
        updateCount();
      }
    });
    list.appendChild(row);
  });
}

function updateCount() {
  const on = themes.filter(t => t.on).length;
  document.getElementById('themeCount').textContent = `${on} / ${themes.length}`;
}

function customCount() {
  return themes.filter(t => t.custom).length;
}

function bindEditorEvents() {
  document.getElementById('btnAddTheme').addEventListener('click', () => {
    if (customCount() >= MAX_CUSTOM) {
      alert(`オリジナルテーマは${MAX_CUSTOM}個までです。`);
      return;
    }
    themes.push({ text: '新しいテーマ', on: true, custom: true });
    saveThemes();
    renderThemeList();
    updateCount();
    const list = document.getElementById('themeList');
    list.scrollTop = list.scrollHeight;
    const rows = list.querySelectorAll('.theme-text');
    const last = rows[rows.length - 1];
    if (last) {
      last.focus();
      document.execCommand('selectAll', false, null);
    }
  });

  document.getElementById('btnAllOn').addEventListener('click', () => {
    themes.forEach(t => t.on = true);
    saveThemes();
    renderThemeList();
    updateCount();
  });
  document.getElementById('btnAllOff').addEventListener('click', () => {
    themes.forEach(t => t.on = false);
    saveThemes();
    renderThemeList();
    updateCount();
  });
  document.getElementById('btnReset').addEventListener('click', () => {
    if (confirm('全てデフォルトに戻します。オリジナルテーマも消えますがよいですか？')) {
      localStorage.removeItem(STORAGE_KEY);
      themes = loadThemes();
      renderThemeList();
      updateCount();
    }
  });

  document.getElementById('trialBtn').addEventListener('click', () => {
    spinTrial();
  });

  document.getElementById('btnPublish').addEventListener('click', publishUrl);
  document.getElementById('btnCopy').addEventListener('click', () => {
    const input = document.getElementById('publishedUrl');
    input.select();
    navigator.clipboard.writeText(input.value).then(() => {
      const btn = document.getElementById('btnCopy');
      const orig = btn.textContent;
      btn.textContent = 'コピー済';
      setTimeout(() => btn.textContent = orig, 1500);
    });
  });
  document.getElementById('btnOpen').addEventListener('click', () => {
    const url = document.getElementById('publishedUrl').value;
    window.open(url, '_blank');
  });
}

// ===== スロット =====
function activeThemes() {
  return themes.filter(t => t.on);
}

function spinSlot(windowEl, prevIndex, allowDup, btn, onLand) {
  const pool = activeThemes();
  if (pool.length === 0) {
    windowEl.innerHTML = 'ONのテーマがありません';
    return prevIndex;
  }
  const eligible = (!allowDup && pool.length > 1 && prevIndex >= 0)
    ? pool.map((_, i) => i).filter(i => i !== prevIndex)
    : pool.map((_, i) => i);

  const finalIdx = eligible[Math.floor(Math.random() * eligible.length)];

  if (btn) btn.disabled = true;
  windowEl.classList.add('spinning');
  windowEl.classList.remove('landed');

  const spinInterval = setInterval(() => {
    const r = Math.floor(Math.random() * pool.length);
    windowEl.innerHTML = pool[r].text;
  }, 60);

  setTimeout(() => {
    clearInterval(spinInterval);
    windowEl.classList.remove('spinning');
    windowEl.innerHTML = pool[finalIdx].text;
    windowEl.classList.add('landed');
    if (btn) btn.disabled = false;
    if (onLand) onLand(finalIdx);
  }, 1400);

  return finalIdx;
}

function renderTrialSlot(msg) {
  document.getElementById('trialSlot').innerHTML = msg;
}

function spinTrial() {
  const allowDup = document.getElementById('trialAllowDup').checked;
  const btn = document.getElementById('trialBtn');
  trialPrevIndex = spinSlot(
    document.getElementById('trialSlot'),
    trialPrevIndex,
    allowDup,
    btn
  );
}

// ===== URL発行 =====
// データ構造：オンになっているデフォルトインデックスのbitmap + カスタムテーマ配列
function publishUrl() {
  const on = activeThemes();
  if (on.length === 0) {
    alert('ONのテーマが0個です。最低1つはONにしてください。');
    return;
  }
  // bitmap: デフォルトテーマのうちONのもののインデックス（元のDEFAULT_THEMESに対応）
  const defaultOnIdx = [];
  const customList = [];
  themes.forEach(t => {
    if (!t.on) return;
    if (t.custom) {
      customList.push(t.text);
    } else {
      const idx = DEFAULT_THEMES.indexOf(t.text);
      if (idx >= 0) defaultOnIdx.push(idx);
    }
  });

  // 250個のONビットマップを圧縮：Uint8Array → base64
  const bytes = new Uint8Array(Math.ceil(DEFAULT_THEMES.length / 8));
  defaultOnIdx.forEach(i => {
    bytes[Math.floor(i / 8)] |= (1 << (i % 8));
  });
  const bitmapB64 = bytesToB64Url(bytes);

  const payload = {
    b: bitmapB64,
    c: customList
  };
  const json = JSON.stringify(payload);
  const encoded = encodeURIComponent(json);

  const baseUrl = window.location.href.split('#')[0];
  const url = `${baseUrl}#play=${encoded}`;

  document.getElementById('publishResult').classList.remove('hidden');
  document.getElementById('publishedUrl').value = url;
}

function bytesToB64Url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64UrlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ===== プレイモード =====
function enterPlayMode(encoded) {
  document.getElementById('editorView').classList.add('hidden');
  document.getElementById('playView').classList.remove('hidden');

  let payload;
  try {
    payload = JSON.parse(decodeURIComponent(encoded));
  } catch (e) {
    document.getElementById('playSlot').innerHTML = 'URLが正しくありません';
    return;
  }

  const bytes = b64UrlToBytes(payload.b || '');
  const list = [];
  for (let i = 0; i < DEFAULT_THEMES.length; i++) {
    if (bytes[Math.floor(i / 8)] & (1 << (i % 8))) {
      list.push(DEFAULT_THEMES[i]);
    }
  }
  (payload.c || []).forEach(t => list.push(t));

  if (list.length === 0) {
    document.getElementById('playSlot').innerHTML = 'テーマがありません';
    return;
  }

  // プレイモード用にthemes配列にセット（spinSlotが参照する）
  themes = list.map(t => ({ text: t, on: true, custom: false }));

  document.getElementById('playSlot').innerHTML = 'スタートを押してね';

  bindPlayEvents();
  updateTimerDisplayFromInputs();
}

function bindPlayEvents() {
  document.getElementById('playSlotBtn').addEventListener('click', () => {
    const allowDup = document.getElementById('playAllowDup').checked;
    const btn = document.getElementById('playSlotBtn');
    playPrevIndex = spinSlot(
      document.getElementById('playSlot'),
      playPrevIndex,
      allowDup,
      btn,
      () => {
        // 着地後にタイマー自動スタート
        startCountdown();
      }
    );
  });

  document.getElementById('timeMin').addEventListener('input', updateTimerDisplayFromInputs);
  document.getElementById('timeSec').addEventListener('input', updateTimerDisplayFromInputs);

  document.querySelectorAll('.quick-time').forEach(b => {
    b.addEventListener('click', () => {
      const s = parseInt(b.dataset.sec, 10);
      document.getElementById('timeMin').value = Math.floor(s / 60);
      document.getElementById('timeSec').value = s % 60;
      updateTimerDisplayFromInputs();
    });
  });

  document.getElementById('btnTimerStop').addEventListener('click', stopCountdown);
  document.getElementById('btnTimerReset').addEventListener('click', () => {
    stopCountdown();
    updateTimerDisplayFromInputs();
  });
  document.getElementById('finishClose').addEventListener('click', () => {
    document.getElementById('finishOverlay').classList.add('hidden');
  });
}

function readTimerInputs() {
  const m = Math.max(0, parseInt(document.getElementById('timeMin').value, 10) || 0);
  const s = Math.max(0, Math.min(59, parseInt(document.getElementById('timeSec').value, 10) || 0));
  return m * 60 + s;
}

function updateTimerDisplayFromInputs() {
  totalSec = readTimerInputs();
  remainingSec = totalSec;
  renderTimerText();
}

function renderTimerText() {
  const m = Math.floor(remainingSec / 60);
  const s = remainingSec % 60;
  const el = document.getElementById('timerText');
  el.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

  el.classList.remove('warn', 'danger');
  if (totalSec > 0) {
    if (remainingSec <= 10) el.classList.add('danger');
    else if (remainingSec <= 30) el.classList.add('warn');
  }
}

function startCountdown() {
  stopCountdown();
  totalSec = readTimerInputs();
  if (totalSec === 0) return;
  remainingSec = totalSec;
  renderTimerText();
  countdownTimer = setInterval(() => {
    remainingSec--;
    renderTimerText();
    if (remainingSec <= 0) {
      stopCountdown();
      finishCountdown();
    }
  }, 1000);
}

function stopCountdown() {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
}

function finishCountdown() {
  document.getElementById('finishOverlay').classList.remove('hidden');
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [880, 1180, 880].forEach((freq, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = freq;
      o.connect(g);
      g.connect(ctx.destination);
      g.gain.setValueAtTime(0.001, ctx.currentTime + i * 0.25);
      g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + i * 0.25 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.25 + 0.2);
      o.start(ctx.currentTime + i * 0.25);
      o.stop(ctx.currentTime + i * 0.25 + 0.22);
    });
  } catch (e) { /* 音声不可なら無視 */ }
}

// 起動
window.addEventListener('DOMContentLoaded', init);
