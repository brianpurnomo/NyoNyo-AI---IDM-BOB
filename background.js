// ── NyoNyo AI Extension — Background Service Worker ──────────────────────────
// Satu alarm "nyonyo|check" berdetak tiap menit. Setiap tick memeriksa semua
// pengingat di chrome.storage.local dan membuka jendela popup reminder.html.
// Eskalasi 3 tahap dicatat di chrome.storage.session (per sesi browser).
'use strict';

const STORAGE_KEY   = 'nyonyo_reminders';   // chrome.storage.local (dipakai popup, demo, background)
const STAGE_KEY     = 'nyonyo_stages';      // session: { "id|tanggal": { stage, at } }
const SNOOZE_KEY    = 'nyonyo_snoozes';     // session: { "nyonyo|snooze|id": { reminder, stage } }
const CHECK_ALARM   = 'nyonyo|check';
const REMINDER_PAGE = chrome.runtime.getURL('reminder.html');

const STAGE_GAP_MIN = 5;    // jeda antar tahap eskalasi (menit)
const WINDOW_MIN    = 30;   // jika browser telat dibuka > 30 menit dari jadwal, hari itu dilewati

// ── Helpers ───────────────────────────────────────────────────────────────────
const pad = n => String(n).padStart(2, '0');

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function getReminders() {
  const r = await chrome.storage.local.get(STORAGE_KEY);
  return r[STORAGE_KEY] || [];
}

async function getSession(key) {
  const r = await chrome.storage.session.get(key);
  return r[key] || {};
}

function setSession(key, value) {
  return chrome.storage.session.set({ [key]: value });
}

// ── Alarm ─────────────────────────────────────────────────────────────────────
// Dibuat hanya jika belum ada, supaya ritme tick tidak di-reset tiap storage berubah.
async function ensureAlarm() {
  const reminders = await getReminders();
  const existing  = await chrome.alarms.get(CHECK_ALARM);
  if (reminders.length === 0) {
    if (existing) await chrome.alarms.clear(CHECK_ALARM);
    return;
  }
  if (!existing) {
    chrome.alarms.create(CHECK_ALARM, { delayInMinutes: 0.1, periodInMinutes: 1 });
  }
}

// ── Buka popup reminder ───────────────────────────────────────────────────────
async function openReminderTab(reminder, stage) {
  const params = new URLSearchParams({
    id:    reminder.id,
    name:  reminder.name,
    time:  reminder.time,
    stage: String(stage)
  });
  const url = `${REMINDER_PAGE}?${params.toString()}`;
  console.log('[NyoNyo BG] open stage', stage, '|', reminder.name);

  // Pakai ulang jendela reminder yang masih terbuka
  const tabs     = await chrome.tabs.query({});
  const existing = tabs.find(t => t.url && t.url.startsWith(REMINDER_PAGE));
  if (existing) {
    await chrome.tabs.update(existing.id, { url, active: true });
    await chrome.windows.update(existing.windowId, { focused: true, drawAttention: true });
    return;
  }

  // Jendela popup baru, langsung fokus (tidak tersembunyi di tab belakang)
  await chrome.windows.create({
    url,
    type: 'popup',
    width: 520,
    height: 720,
    focused: true
  });
}

// ── Pemeriksaan jadwal ────────────────────────────────────────────────────────
// Tahap 1: begitu waktu jadwal tercapai (toleransi WINDOW_MIN menit).
// Tahap 2 & 3: tiap STAGE_GAP_MIN menit setelah tahap sebelumnya.
async function checkReminders() {
  const now     = new Date();
  const nowMin  = now.getHours() * 60 + now.getMinutes();
  const today   = todayStr();
  const reminders = await getReminders();
  const stages    = await getSession(STAGE_KEY);

  for (const r of reminders) {
    const [h, m] = String(r.time).split(':').map(Number);
    const late   = nowMin - (h * 60 + m);   // menit sejak jadwal
    if (Number.isNaN(late) || late < 0) continue;

    const key = `${r.id}|${today}`;
    const s   = stages[key] || { stage: 0, at: 0 };

    let next = 0;
    if (s.stage === 0) {
      if (late <= WINDOW_MIN) next = 1;
    } else if (s.stage < 3 && Date.now() - s.at >= STAGE_GAP_MIN * 60000) {
      next = s.stage + 1;
    }
    if (!next) continue;

    stages[key] = { stage: next, at: Date.now() };
    await setSession(STAGE_KEY, stages);
    await openReminderTab(r, next);
    break;   // satu reminder per tick; sisanya di tick berikutnya
  }
}

// ── Alarm handler ─────────────────────────────────────────────────────────────
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === CHECK_ALARM) {
    await checkReminders();
    return;
  }

  if (alarm.name.startsWith('nyonyo|snooze|')) {
    const snoozes = await getSession(SNOOZE_KEY);
    const entry   = snoozes[alarm.name];
    if (!entry) return;
    delete snoozes[alarm.name];
    await setSession(SNOOZE_KEY, snoozes);

    const stage  = Math.min(entry.stage + 1, 3);   // snooze → naik ke tahap berikutnya
    const stages = await getSession(STAGE_KEY);
    stages[`${entry.reminder.id}|${todayStr()}`] = { stage, at: Date.now() };
    await setSession(STAGE_KEY, stages);
    await openReminderTab(entry.reminder, stage);
  }
});

// ── Lifecycle ─────────────────────────────────────────────────────────────────
console.log('[NyoNyo BG] Service worker started.');
ensureAlarm();                                   // tiap service worker bangun
chrome.runtime.onInstalled.addListener(ensureAlarm);
chrome.runtime.onStartup.addListener(ensureAlarm);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[STORAGE_KEY]) ensureAlarm();
});

// ── Pesan dari popup / demo / reminder ────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg.type === 'DEMO') {
      await openReminderTab(
        { id: 'demo', name: msg.name || 'Demo Reminder', time: `${pad(new Date().getHours())}:${pad(new Date().getMinutes())}` },
        msg.stage || 1
      );
    } else if (msg.type === 'REGISTER_ALARMS') {
      await ensureAlarm();
    } else if (msg.type === 'SNOOZE') {
      const delay = msg.delayMinutes || 5;
      const name  = `nyonyo|snooze|${msg.id}`;
      const stage = Math.min(msg.stage || 1, 3);
      chrome.alarms.create(name, { delayInMinutes: delay });

      const snoozes = await getSession(SNOOZE_KEY);
      snoozes[name] = { reminder: { id: msg.id, name: msg.name, time: msg.time }, stage };
      await setSession(SNOOZE_KEY, snoozes);

      // Tahan eskalasi otomatis sampai snooze selesai
      const stages = await getSession(STAGE_KEY);
      stages[`${msg.id}|${todayStr()}`] = { stage, at: Date.now() + delay * 60000 };
      await setSession(STAGE_KEY, stages);
    } else if (msg.type === 'DONE') {
      // User menekan "Mulai Sekarang" → hentikan eskalasi hari ini
      const stages = await getSession(STAGE_KEY);
      stages[`${msg.id}|${todayStr()}`] = { stage: 99, at: Date.now() };
      await setSession(STAGE_KEY, stages);
      chrome.alarms.clear(`nyonyo|snooze|${msg.id}`);
    }
    sendResponse({ ok: true });
  })();
  return true;   // respons asinkron
});
