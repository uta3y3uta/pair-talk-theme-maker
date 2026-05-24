// ===== 状態 =====
const STORAGE_KEY = 'pairTalkThemeMaker.v2';
const TOTAL_SLOTS = 300;          // 250デフォルト + 50ユーザー
const CUSTOM_START = 250;         // インデックス 250..299 がユーザー枠
const PLACEHOLDER = '（クリックして入力）';

let themes = [];
// シャッフルバッグ：表示済みテキストを記録（全部出たら自動リセット）
let trialSeen = new Set();
let playSeen = new Set();
let trialLastText = '';
let playLastText = '';
let countdownTimer = null;
let remainingSec = 0;
let pausedSec = 0;          // 一時停止中の残り秒数（0なら一時停止していない）
let setMin = 1;   // デフォルト1分
let setSec = 0;
let countdownEffectActive = false;  // 3,2,1演出中フラグ

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
      trialSeen.clear();
      trialLastText = '';
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

// flex親に直接テキストとrubyを混ぜると別々のflex itemになって崩れるので
// 必ず単一の .slot-inner で包む
function setSlotHTML(windowEl, html) {
  windowEl.innerHTML = '<div class="slot-inner">' + html + '</div>';
}

// シャッフルバッグ式：seenに無いものから選ぶ。全部出たら自動でリセット
// （直前に出たものは除外したまま継続）。返り値は今回ランドしたtext。
function spinSlot(windowEl, seenSet, lastText, btn, onLand, opts) {
  opts = opts || {};
  const pool = activeThemes();
  if (pool.length === 0) {
    setSlotHTML(windowEl, 'ONのテーマがありません');
    return lastText;
  }

  // 候補：まだ見ていないもの
  let eligible = pool.filter(t => !seenSet.has(t.text));
  if (eligible.length === 0) {
    // 全部出尽くしたのでリセット。直前だけは弾く
    seenSet.clear();
    if (lastText) seenSet.add(lastText);
    eligible = pool.filter(t => !seenSet.has(t.text));
    if (eligible.length === 0) eligible = pool;  // poolが1つしか無いケース
  }

  const picked = eligible[Math.floor(Math.random() * eligible.length)];
  seenSet.add(picked.text);

  if (btn) btn.disabled = true;
  windowEl.classList.add('spinning');
  windowEl.classList.remove('landed');

  const spinInterval = setInterval(() => {
    const r = Math.floor(Math.random() * pool.length);
    setSlotHTML(windowEl, pool[r].text);
  }, 60);

  setTimeout(() => {
    clearInterval(spinInterval);
    windowEl.classList.remove('spinning');
    setSlotHTML(windowEl, picked.text);
    windowEl.classList.add('landed');
    if (btn && !opts.keepDisabled) btn.disabled = false;
    if (onLand) onLand(picked);
  }, 1400);

  return picked.text;
}

function renderTrialSlot(msg) {
  setSlotHTML(document.getElementById('trialSlot'), msg);
}

function spinTrial() {
  const btn = document.getElementById('trialBtn');
  trialLastText = spinSlot(
    document.getElementById('trialSlot'),
    trialSeen,
    trialLastText,
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
    setSlotHTML(document.getElementById('playSlot'), 'URLが正しくありません');
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
    setSlotHTML(document.getElementById('playSlot'), 'テーマがありません');
    return;
  }
  // 初期表示も .slot-inner で包む
  setSlotHTML(document.getElementById('playSlot'), 'スタートを<ruby>押<rt>お</rt></ruby>してね');

  themes = list.map(t => ({ text: t, on: true, custom: false }));

  bindPlayEvents();
  renderTimerDisplay();
}

function bindPlayEvents() {
  document.getElementById('playSlotBtn').addEventListener('click', () => {
    // スピン中／演出中の連打を完全ガード
    if (countdownEffectActive) return;
    const btn = document.getElementById('playSlotBtn');
    if (btn.disabled) return;
    const restartBtn = document.getElementById('btnTimerRestart');
    stopCountdown();
    restartBtn.disabled = true;
    playLastText = spinSlot(
      document.getElementById('playSlot'),
      playSeen,
      playLastText,
      btn,
      () => {
        runStartCountdownEffect(() => {
          startCountdown();
          btn.disabled = false;
          restartBtn.disabled = false;
        });
      },
      { keepDisabled: true }   // 演出が終わるまでボタンを離さない
    );
  });

  // リスタート：タイマーだけを開始（スロットは回さない）
  document.getElementById('btnTimerRestart').addEventListener('click', () => {
    if (countdownEffectActive) return;
    const slotBtn = document.getElementById('playSlotBtn');
    const restartBtn = document.getElementById('btnTimerRestart');
    if (restartBtn.disabled) return;
    stopCountdown();
    slotBtn.disabled = true;
    restartBtn.disabled = true;
    runStartCountdownEffect(() => {
      startCountdown();
      slotBtn.disabled = false;
      restartBtn.disabled = false;
    });
  });

  document.querySelectorAll('.arrow').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (countdownTimer) return;     // 動作中は変更不可
      if (pausedSec > 0) return;      // 一時停止中も変更不可（リセット後ならOK）
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

  // ストップ：一時停止 ↔ 再開 のトグル
  document.getElementById('btnTimerStop').addEventListener('click', () => {
    if (countdownTimer) {
      pauseCountdown();
    } else if (pausedSec > 0) {
      resumeCountdown();
    }
  });
  // リセット：設定していたタイマー（setMin:setSec）に戻す
  document.getElementById('btnTimerReset').addEventListener('click', () => {
    resetCountdown();
  });
  document.getElementById('finishClose').addEventListener('click', () => {
    document.getElementById('finishOverlay').classList.add('hidden');
  });
}

function renderTimerDisplay() {
  let sec;
  if (countdownTimer) {
    sec = remainingSec;          // 動作中：残り
  } else if (pausedSec > 0) {
    sec = pausedSec;             // 一時停止中：止めた瞬間の残り
  } else {
    sec = setMin * 60 + setSec;  // それ以外：設定時間
  }
  const showMin = Math.floor(sec / 60);
  const showSec = sec % 60;
  document.getElementById('timeMinDisplay').textContent = String(showMin).padStart(2, '0');
  document.getElementById('timeSecDisplay').textContent = String(showSec).padStart(2, '0');

  const row = document.getElementById('timerRow');
  row.classList.remove('warn', 'danger', 'paused');
  if (countdownTimer) {
    if (remainingSec <= 10) row.classList.add('danger');
    else if (remainingSec <= 30) row.classList.add('warn');
  } else if (pausedSec > 0) {
    row.classList.add('paused');
  }
  updateStopButtonLabel();
}

function updateStopButtonLabel() {
  const btn = document.getElementById('btnTimerStop');
  if (!btn) return;
  if (pausedSec > 0 && !countdownTimer) {
    btn.textContent = 'つづける';
  } else {
    btn.textContent = 'ストップ';
  }
}

// ===== 3,2,1 → スタート！ 演出 =====
function runStartCountdownEffect(onDone) {
  const overlay = document.getElementById('countdownOverlay');
  if (!overlay) { if (onDone) onDone(); return; }
  if (countdownEffectActive) { return; }   // 二重起動禁止
  countdownEffectActive = true;

  const steps = ['3', '2', '1', 'スタート！'];
  const stepMs = 800;
  let i = 0;

  overlay.classList.remove('hidden');

  const stepClasses = { '3': 'ct-3', '2': 'ct-2', '1': 'ct-1' };

  const show = () => {
    const currentEl = document.getElementById('countdownText');
    if (i >= steps.length) {
      overlay.classList.add('hidden');
      if (currentEl) currentEl.className = 'countdown-text';
      countdownEffectActive = false;
      if (onDone) onDone();
      return;
    }
    const s = steps[i];
    // アニメーション再再生のため新ノードに差し替え
    const fresh = document.createElement('div');
    fresh.id = 'countdownText';
    const extra = (s === 'スタート！') ? ' start' : (' ' + (stepClasses[s] || ''));
    fresh.className = 'countdown-text' + extra;
    fresh.textContent = s;
    if (currentEl && currentEl.parentNode) {
      currentEl.parentNode.replaceChild(fresh, currentEl);
    } else {
      overlay.appendChild(fresh);
    }
    try { playBeep(s === 'スタート！' ? 1320 : 660); } catch (e) {}
    i++;
    setTimeout(show, stepMs);
  };
  show();
}

function playBeep(freq) {
  const ctx = window._beepCtx || (window._beepCtx = new (window.AudioContext || window.webkitAudioContext)());
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.value = freq;
  o.connect(g); g.connect(ctx.destination);
  const t = ctx.currentTime;
  g.gain.setValueAtTime(0.001, t);
  g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  o.start(t);
  o.stop(t + 0.2);
}

// 新規スタート：設定時間（setMin:setSec）から開始
function startCountdown() {
  clearCountdownInterval();
  pausedSec = 0;
  const total = setMin * 60 + setSec;
  if (total === 0) return;
  remainingSec = total;
  document.getElementById('timerBlock').classList.add('running');
  countdownTimer = setInterval(tickCountdown, 1000);
  renderTimerDisplay();
}

// 一時停止からの再開：残り秒数からカウント再開
function resumeCountdown() {
  if (pausedSec <= 0) return;
  clearCountdownInterval();
  remainingSec = pausedSec;
  pausedSec = 0;
  document.getElementById('timerBlock').classList.add('running');
  countdownTimer = setInterval(tickCountdown, 1000);
  renderTimerDisplay();
}

function tickCountdown() {
  remainingSec--;
  renderTimerDisplay();
  if (remainingSec <= 0) {
    clearCountdownInterval();
    pausedSec = 0;
    document.getElementById('timerBlock').classList.remove('running');
    renderTimerDisplay();
    finishCountdown();
  }
}

// 一時停止：残り秒数を保持してカウントを止める
function pauseCountdown() {
  if (!countdownTimer) return;
  pausedSec = remainingSec;
  clearCountdownInterval();
  document.getElementById('timerBlock').classList.remove('running');
  renderTimerDisplay();
}

// リセット：設定時間に戻す
function resetCountdown() {
  clearCountdownInterval();
  pausedSec = 0;
  remainingSec = 0;
  document.getElementById('timerBlock').classList.remove('running');
  renderTimerDisplay();
}

// 内部用：intervalを止めるだけ（状態は触らない）
function clearCountdownInterval() {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
}

// 互換のため残す：完全停止＋リセット
function stopCountdown() {
  resetCountdown();
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
