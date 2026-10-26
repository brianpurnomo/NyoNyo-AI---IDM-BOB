// reminder.js — logika halaman reminder.html
// Dipisah dari HTML karena CSP Manifest V3 memblokir <script> inline & onclick="…".
'use strict';

const MSGS = [
  'No no scroll terus yaa, yuk belajar mulai sekarang! 💗',
  'No no scroll terus yaa, heii! 😤 Dari tadi belum mulai juga? Yuk, belajar sekarang dongg!',
  'No no scroll terus yaa, WOIII!! 😾 Masih scroll aja?! Ayo belajar SEKARANGG! NyoNyo udah ngingetin berkali-kali, nihh!'
];
const ANIMS = ['float', 'bounce', 'rage'];

// Parse URL params
const params = new URLSearchParams(location.search);
const id     = params.get('id')   || 'demo';
const name   = params.get('name') || 'Aktivitas';
const time   = params.get('time') || '--:--';
const stage  = Math.min(Math.max(parseInt(params.get('stage') || '1', 10), 1), 3);

const msgEl = document.getElementById('speech-bubble');
const bot   = document.getElementById('nyonyo-bot');

function playAnim(cls) {
  // SVGElement.className read-only → pakai classList
  bot.classList.remove('float', 'bounce', 'rage');
  void bot.offsetWidth;   // restart animasi
  bot.classList.add(cls);
}

// Tampilan sesuai tahap
document.body.classList.add(`stage-${stage}`);
document.getElementById('stage-badge').textContent    = `Pengingat ke-${stage}`;
document.getElementById('activity-badge').textContent = `📌 ${name}`;
msgEl.textContent = MSGS[stage - 1];
playAnim(ANIMS[stage - 1]);

const now = new Date();
document.getElementById('timestamp').textContent =
  `Dipicu pukul ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} · dijadwalkan ${time}`;

// ── Aksi ─────────────────────────────────────────────────────────────────────
function send(msg, done) {
  if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) { done(); return; }
  chrome.runtime.sendMessage(msg, () => {
    void chrome.runtime.lastError;   // abaikan error "port closed"
    done();
  });
}

function markStarted() {
  msgEl.textContent = `Yeayy! Semangat belajar ${name}! 💪✨ NyoNyo bangga!`;
  playAnim('bounce');
  send({ type: 'DONE', id }, () => setTimeout(() => window.close(), 2200));
}

function snooze() {
  send({ type: 'SNOOZE', id, name, time, stage, delayMinutes: 5 }, () => window.close());
}

document.getElementById('btn-start').addEventListener('click', markStarted);
document.getElementById('btn-snooze').addEventListener('click', snooze);
document.getElementById('btn-close').addEventListener('click', () => window.close());
