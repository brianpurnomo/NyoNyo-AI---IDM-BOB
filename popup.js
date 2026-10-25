// popup.js — NyoNyo AI Extension Popup
'use strict';

const STORAGE_KEY = 'nyonyo_reminders';

let reminders = [];

// ── Load ──────────────────────────────────────────────────────────────────────
chrome.storage.sync.get([STORAGE_KEY], result => {
  reminders = result[STORAGE_KEY] || [];
  render();
});

// ── Save ──────────────────────────────────────────────────────────────────────
document.getElementById('btn-save').addEventListener('click', () => {
  const nameEl  = document.getElementById('p-name');
  const timeEl  = document.getElementById('p-time');
  const name    = nameEl.value.trim();
  const time    = timeEl.value;

  if (!name) { setStatus('Masukkan nama aktivitas dulu! 🌸'); nameEl.focus(); return; }
  if (!time) { setStatus('Pilih waktu dulu ya! ⏰'); timeEl.focus(); return; }

  const id = Date.now().toString(36);
  reminders.push({ id, name, time });
  persist(() => {
    nameEl.value = '';
    timeEl.value = '';
    render();
    setStatus('Tersimpan! NyoNyo siap ngingetin kamu ✨');
  });
});

// ── Demo ──────────────────────────────────────────────────────────────────────
document.getElementById('btn-demo').addEventListener('click', () => {
  setStatus('Membuka tab reminder demo…');
  chrome.runtime.sendMessage({ type: 'DEMO', name: 'Demo Reminder', stage: 1 }, () => {
    setStatus('Tab demo dibuka! 🎀');
  });
});

// ── Delete ────────────────────────────────────────────────────────────────────
function deleteReminder(id) {
  reminders = reminders.filter(r => r.id !== id);
  persist(() => render());
}

// ── Persist → chrome.storage.sync ────────────────────────────────────────────
function persist(cb) {
  chrome.storage.sync.set({ [STORAGE_KEY]: reminders }, () => {
    // Tell background to re-register alarms
    chrome.runtime.sendMessage({ type: 'REGISTER_ALARMS' });
    if (cb) cb();
  });
}

// ── Render ────────────────────────────────────────────────────────────────────
function render() {
  const ul = document.getElementById('r-list');
  if (reminders.length === 0) {
    ul.innerHTML = '<li class="empty">Belum ada pengingat 🌸</li>';
    return;
  }
  ul.innerHTML = reminders.map(r => `
    <li class="reminder-item">
      <span class="r-name">${esc(r.name)}</span>
      <span class="r-time">⏰ ${r.time}</span>
      <button class="btn-del" data-id="${r.id}">Hapus</button>
    </li>
  `).join('');
  ul.querySelectorAll('.btn-del').forEach(btn => {
    btn.addEventListener('click', () => deleteReminder(btn.dataset.id));
  });
}

function esc(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function setStatus(msg) {
  const el = document.getElementById('status');
  el.textContent = msg;
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.textContent = ''; }, 3000);
}
