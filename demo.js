// demo.js — NyoNyo AI main page logic
// No inline event handlers; all listeners registered here.
'use strict';

// ── Constants ──────────────────────────────────────────────────────────────────
const STORAGE_KEY   = 'nyonyo_reminders';
const TRIGGERED_KEY = 'nyonyo_triggered';
const FIRST_MSG     = 'No no scroll terus yaa, yuk belajar mulai sekarang! 💗';

// ── Extension bridge ───────────────────────────────────────────────────────────
// EXT_ACTIVE is true only when served from chrome-extension:// origin.
// On file:// URLs Edge injects a partial chrome object but chrome.storage.sync
// is inaccessible and would throw, killing setInterval (stopping the clock).
const EXT_ACTIVE = (
  location.protocol === 'chrome-extension:' &&
  typeof chrome !== 'undefined' &&
  typeof chrome.runtime !== 'undefined' &&
  typeof chrome.runtime.id === 'string'
);

function sendExt(msg) {
  if (!EXT_ACTIVE) {
    console.warn('[NyoNyo] Extension not active, message dropped:', msg);
    return;
  }
  console.log('[NyoNyo] Sending to background:', msg);
  chrome.runtime.sendMessage(msg, resp => {
    if (chrome.runtime.lastError) {
      console.error('[NyoNyo] sendMessage error:', chrome.runtime.lastError.message);
    } else {
      console.log('[NyoNyo] Background replied:', resp);
    }
  });
}

// ── State ──────────────────────────────────────────────────────────────────────
let reminders   = [];
let triggered   = loadTriggered();
let bubbleTimer = null;

// ── Clock ──────────────────────────────────────────────────────────────────────
const daysID   = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
const monthsID = ['Januari','Februari','Maret','April','Mei','Juni','Juli',
                  'Agustus','September','Oktober','November','Desember'];

function updateClock() {
  const now = new Date();
  const hh  = String(now.getHours()).padStart(2, '0');
  const mm  = String(now.getMinutes()).padStart(2, '0');
  const ss  = String(now.getSeconds()).padStart(2, '0');
  document.getElementById('clock-display').textContent = `${hh}:${mm}:${ss}`;
  document.getElementById('clock-date').textContent =
    `${daysID[now.getDay()]}, ${now.getDate()} ${monthsID[now.getMonth()]} ${now.getFullYear()}`;
}

// ── localStorage helpers ───────────────────────────────────────────────────────
async function loadReminders() {
  if (EXT_ACTIVE) {
    const r = await chrome.storage.local.get(STORAGE_KEY);
    return r[STORAGE_KEY] || [];
  }
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}

async function persistReminders() {
  if (EXT_ACTIVE) {
    await chrome.storage.local.set({ [STORAGE_KEY]: reminders });
    sendExt({ type: 'REGISTER_ALARMS' });
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reminders));
  }
}

function loadTriggered() {
  try {
    const raw   = JSON.parse(localStorage.getItem(TRIGGERED_KEY)) || {};
    const today = todayStr();
    return new Set(raw[today] || []);
  } catch { return new Set(); }
}

function persistTriggered() {
  const today = todayStr();
  const raw   = {};
  raw[today]  = [...triggered];
  localStorage.setItem(TRIGGERED_KEY, JSON.stringify(raw));
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

// ── Reminder CRUD ──────────────────────────────────────────────────────────────
function saveReminder() {
  const nameEl = document.getElementById('activity-name');
  const timeEl = document.getElementById('reminder-time');
  const name   = nameEl.value.trim();
  const time   = timeEl.value;

  if (!name) { alert('Masukkan nama aktivitas dulu ya! 🌸'); nameEl.focus(); return; }
  if (!time) { alert('Pilih waktu pengingat dulu ya! ⏰'); timeEl.focus(); return; }

  if (!EXT_ACTIVE) {
    alert('Halaman ini dibuka di luar extension, jadi jadwal TIDAK akan sampai ke extension.\n' +
          'Buka lewat chrome-extension://<ID-extension>/demo.html');
  }
  const id = Date.now().toString(36);
  reminders.push({ id, name, time });
  persistReminders();
  nameEl.value = '';
  timeEl.value = '';
  renderList();
}

function deleteReminder(id) {
  reminders = reminders.filter(r => r.id !== id);
  persistReminders();
  renderList();
}

// ── Render list ────────────────────────────────────────────────────────────────
// Uses data-id on delete buttons; click is handled by event delegation below.
function renderList() {
  const ul = document.getElementById('reminder-list');
  if (reminders.length === 0) {
    ul.innerHTML = '<li class="empty-state">Belum ada pengingat. Tambahkan satu! 🌸</li>';
    return;
  }
  ul.innerHTML = reminders.map(r => `
    <li class="reminder-item">
      <div class="reminder-info">
        <div class="reminder-name">${escHtml(r.name)}</div>
        <div class="reminder-time">⏰ ${r.time}</div>
      </div>
      <button class="btn-delete" data-id="${escHtml(r.id)}">Hapus</button>
    </li>
  `).join('');
}

function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Check reminders ────────────────────────────────────────────────────────────
function checkReminders() {
  const now         = new Date();
  const currentTime = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

  for (const r of reminders) {
    const key = `${r.id}|${r.time}|${todayStr()}`;
    if (r.time === currentTime && !triggered.has(key)) {
      triggered.add(key);
      persistTriggered();
      triggerReminder(r.name);
      break;
    }
  }
}

// ── Trigger reminder UI ────────────────────────────────────────────────────────
function triggerReminder(activityName) {
  showBubble(`${FIRST_MSG}\n\n📌 Saatnya: ${activityName}`);
  animateBot();
}

function triggerDemo() {
  console.log('[NyoNyo] triggerDemo() called. EXT_ACTIVE =', EXT_ACTIVE);
  showBubble(`${FIRST_MSG}\n\n📌 Ini adalah demo pengingat!`);
  animateBot();
  if (EXT_ACTIVE) {
    sendExt({ type: 'DEMO', name: 'Demo Reminder', stage: 1 });
  } else {
    console.warn('[NyoNyo] triggerDemo: extension not detected. ' +
      'Open this page from the extension (chrome-extension://…/demo.html) for tab-opening to work.');
  }
}

function showBubble(msg) {
  const bubble = document.getElementById('speech-bubble');
  bubble.textContent = msg;
  bubble.classList.add('visible');
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => bubble.classList.remove('visible'), 7000);
}

function animateBot() {
  const bot = document.getElementById('nyonyo-bot');
  bot.classList.remove('excited');
  void bot.offsetWidth; // force reflow so animation restarts
  bot.classList.add('excited');
}

// ── Init (runs after DOM is ready via defer) ───────────────────────────────────
updateClock();
loadReminders().then(list => { reminders = list; renderList(); });

// Jika popup mengubah jadwal, halaman ini ikut diperbarui
if (EXT_ACTIVE) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[STORAGE_KEY]) {
      reminders = changes[STORAGE_KEY].newValue || [];
      renderList();
    }
  });
}

// Register static button listeners
document.getElementById('btn-save').addEventListener('click', saveReminder);
document.getElementById('btn-demo').addEventListener('click', triggerDemo);

// Event delegation for dynamically generated delete buttons
document.getElementById('reminder-list').addEventListener('click', e => {
  const btn = e.target.closest('.btn-delete');
  if (btn) deleteReminder(btn.dataset.id);
});

setInterval(updateClock, 1000);
setInterval(checkReminders, 5000);
