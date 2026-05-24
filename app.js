// ===== 状態 =====
const STORAGE_KEY = 'pairTalkThemeMaker.v2';
const TOTAL_SLOTS = 300;          // 250デフォルト + 50ユーザー
const CUSTOM_START = 250;         // インデックス 250..299 がユーザー枠
const PLACEHOLDER = '（クリックして入力）';

let themes = [];
let trialPrevIndex = -1;
let playPrevIndex = -1;
let countdownTimer = null;
let remainingSec = 0;
let setMin = 1;   // デフォルト1分
let setSec = 0;

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

function buildInitialThemes() {
  // 250デフォルト（ON）＋ 50空（OFF）
  const arr = DEFAULT_THEMES.map(t => ({ text: t, on: true, custom: false }));
  while (arr.length < TOTAL_SLOTS) {
    arr.push({ text: '', on: false, custom: true });
  }
  return arr;
}

function loadThemes() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const data = JSON.parse(saved);
      if (Array.isArray(data) && data.length > 0) {
        // 300未満ならパディング
        while (data.length < TOTAL_SLOTS) {
          data.push({ text: '', on: false, custom: true });
        }
        return data.slice(0, TOTAL_SLOTS);
      }
    } catch (e) { /* fall through */ }
  }
  return buildInitialThemes();
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
    if (i >= CUSTOM_START) row.classList.add('custom');
    if (!t.text) row.classList.add('empty');

    const cb = row.querySelector('.theme-enable');
    cb.checked = t.on;
    cb.addEventListener('change', () => {
      // 空のままONにしようとしたら無効
      if (cb.checked && !themes[i].text) {
        cb.checked = false;
        return;
      }
      themes[i].on = cb.checked;
      row.classList.toggle('disabled', !cb.checked);
      saveThemes();
      updateCount();
    });

    row.querySelector('.theme-num').textContent = (i + 1).toString();

    const txt = row.querySelector('.theme-text');
    setRowText(txt, row, t.text);

    txt.addEventListener('focus', () => {
      if (!themes[i].text) {
        txt.textContent = '';
        row.classList.remove('empty');
      }
    });
    txt.addEventListener('blur', () => {
      const newText = txt.innerHTML.trim();
      if (newText) {
        themes[i].text = newText;
        saveThemes();
        row.classList.remove('empty');
      } else {
        themes[i].text = '';
        // OFFに戻す
        themes[i].on = false;
        cb.checked = false;
        row.classList.add('disabled', 'empty');
        row.classList.add('empty');
        setRowText(txt, row, '');
        saveThemes();
        updateCount();
      }
    });

    row.querySelector('.theme-clear').addEventListener('click', () => {
      if (confirm('このテーマをクリアしますか？（スロット枠は残ります）')) {
        themes[i].text = '';
        themes[i].on = false;
        saveThemes();
        renderThemeList();
        updateCount();
      }
    });
    list.appendChild(row);
  });
}

function setRowText(txtEl, row, text) {
  if (text) {
    txtEl.innerHTML = text;
    row.classList.remove('empty');
  } else {
    txtEl.textContent = PLACEHOLDER;
    row.classList.add('empty');
  }
}

function updateCount() {
  const on = themes.filter(t => t.on).length;
  document.getElementById('themeCount').textContent = `${on} / ${TOTAL_SLOTS}`;
}

function bindEditorEvents() {
  document.getElementById('btnAllOn').addEventListener('click', () => {
    themes.forEach(t => { if (t.text) t.on = true; });
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
    if (confirm('全てデフォルトに戻します。オリジナル枠の入力も消えますがよいですか？')) {
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

// ===== スロット（常に重複なし） =====
function activeThemes() {
  return themes.filter(t => t.on && t.text);
}

function spinSlot(windowEl, prevIndex, btn, onLand) {
  const pool = activeThemes();
  if (pool.length === 0) {
    windowEl.innerHTML = 'ONのテーマがありません';
    return prevIndex;
  }
  const eligible = (pool.length > 1 && prevIndex >= 0)
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
  const btn = document.getElementById('trialBtn');
  trialPrevIndex = spinSlot(
    document.getElementById('trialSlot'),
    trialPrevIndex,
    btn
  );
}

// ===== URL発行 =====
function publishUrl() {
  const on = activeThemes();
  if (on.length === 0) {
    alert('ONのテーマが0個です。最低1つはONにしてください。');
    return;
  }
  const defaultOnIdx = [];
  const customList = [];
  themes.forEach((t, i) => {
    if (!t.on || !t.text) return;
    if (i >= CUSTOM_START) {
      customList.push(t.text);
    } else {
      defaultOnIdx.push(i);
    }
  });

  const bytes = new Uint8Array(Math.ceil(DEFAULT_THEMES.length / 8));
  defaultOnIdx.forEach(i => {
    bytes[Math.floor(i / 8)] |= (1 << (i % 8));
  });
  const bitmapB64 = bytesToB64Url(bytes);

  const payload = { b: bitmapB64, c: customList };
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

  themes = list.map(t => ({ text: t, on: true, custom: false }));

  bindPlayEvents();
  renderTimerDisplay();
}

function bindPlayEvents() {
  document.getElementById('playSlotBtn').addEventListener('click', () => {
    const btn = document.getElementById('playSlotBtn');
    playPrevIndex = spinSlot(
      document.getElementById('playSlot'),
      playPrevIndex,
      btn,
      () => {
        startCountdown();
      }
    );
  });

  document.querySelectorAll('.arrow').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (countdownTimer) return;
      const target = btn.dataset.target;
      const delta = parseInt(btn.dataset.delta, 10);
      if (target === 'min') {
        setMin = Math.max(0, Math.min(60, setMin + delta));
      } else {
        setSec = setSec + delta;
        if (setSec < 0) setSec = 50;
        if (setSec >= 60) setSec = 0;
      }
      if (setMin === 0 && setSec === 0) {
        setSec = 10;
      }
      renderTimerDisplay();
    });
  });

  // タッチ／タップ時に矢印を表示（スマホ用）
  const tb = document.getElementById('timerBlock');
  tb.addEventListener('click', (e) => {
    if (!e.target.closest('.arrow') && !e.target.closest('button')) {
      tb.classList.toggle('show-arrows');
    }
  });

  document.getElementById('btnTimerStop').addEventListener('click', stopCountdown);
  document.getElementById('btnTimerReset').addEventListener('click', () => {
    stopCountdown();
    renderTimerDisplay();
  });
  document.getElementById('finishClose').addEventListener('click', () => {
    document.getElementById('finishOverlay').classList.add('hidden');
  });
}

function renderTimerDisplay() {
  const showMin = countdownTimer ? Math.floor(remainingSec / 60) : setMin;
  const showSec = countdownTimer ? (remainingSec % 60)        : setSec;
  document.getElementById('timeMinDisplay').textContent = String(showMin).padStart(2, '0');
  document.getElementById('timeSecDisplay').textContent = String(showSec).padStart(2, '0');

  const row = document.getElementById('timerRow');
  row.classList.remove('warn', 'danger');
  if (countdownTimer) {
    if (remainingSec <= 10) row.classList.add('danger');
    else if (remainingSec <= 30) row.classList.add('warn');
  }
}

function startCountdown() {
  stopCountdown();
  const total = setMin * 60 + setSec;
  if (total === 0) return;
  remainingSec = total;
  document.getElementById('timerBlock').classList.add('running');
  countdownTimer = setInterval(() => {
    remainingSec--;
    renderTimerDisplay();
    if (remainingSec <= 0) {
      stopCountdown();
      finishCountdown();
    }
  }, 1000);
  renderTimerDisplay();
}

function stopCountdown() {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  document.getElementById('timerBlock').classList.remove('running');
  renderTimerDisplay();
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

window.addEventListener('DOMContentLoaded', init);
