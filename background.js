// ── NyoNyo AI Extension — Background Service Worker ──────────────────────────
// Manages chrome.alarms for each saved reminder.
// When an alarm fires it opens (or reuses) reminder.html as a new tab.
// Three-stage escalation is tracked in chrome.storage.session (per browser session).

const STORAGE_KEY   = 'nyonyo_reminders';   // same key used by demo.html / popup
const STAGE_KEY     = 'nyonyo_stages';       // session storage: { "id|date": stageNumber }
const REMINDER_PAGE = chrome.runtime.getURL('reminder.html');

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function hhmm(date) {
  return `${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
}

// Read reminders from chrome.storage.sync
async function getReminders() {
  return new Promise(resolve => {
    chrome.storage.sync.get([STORAGE_KEY], result => {
      resolve(result[STORAGE_KEY] || []);
    });
  });
}

// Read per-session stage counters
async function getStages() {
  return new Promise(resolve => {
    chrome.storage.session.get([STAGE_KEY], result => {
      resolve(result[STAGE_KEY] || {});
    });
  });
}

async function setStages(stages) {
  return new Promise(resolve => {
    chrome.storage.session.set({ [STAGE_KEY]: stages }, resolve);
  });
}

// ── Alarm registration ────────────────────────────────────────────────────────

// Register one alarm per reminder. Alarm name = reminder id.
// chrome.alarms uses absolute epoch milliseconds for the first fire,
// then repeats every 24 h if desired.  We set a 1-minute period so
// the alarm ticks every minute and we decide whether it matches.
async function registerAlarms() {
  // Clear only the check alarm (preserve active snooze alarms)
  await chrome.alarms.clear('nyonyo|check');

  const reminders = await getReminders();
  if (reminders.length === 0) return;

  // One shared alarm ticks every minute; the handler checks all reminders.
  // Using a single alarm avoids N alarms for N reminders.
  chrome.alarms.create('nyonyo|check', {
    delayInMinutes: 0.1,   // first tick in ~6 seconds
    periodInMinutes: 1
  });
}

// ── Open / reuse reminder tab ─────────────────────────────────────────────────

async function openReminderTab(reminder, stage) {
  const params = new URLSearchParams({
    id:    reminder.id,
    name:  reminder.name,
    time:  reminder.time,
    stage: String(stage)
  });
  const url = `${REMINDER_PAGE}?${params.toString()}`;
  console.log('[NyoNyo BG] openReminderTab → stage', stage, '|', reminder.name, '|', url);

  // Reuse an existing reminder tab if one is open
  const tabs = await chrome.tabs.query({});
  const existing = tabs.find(t => t.url && t.url.startsWith(REMINDER_PAGE));
  if (existing) {
    console.log('[NyoNyo BG] Reusing existing reminder tab id', existing.id);
    await chrome.tabs.update(existing.id, { url, active: true });
  } else {
    console.log('[NyoNyo BG] Creating new reminder tab');
    await chrome.tabs.create({ url, active: false }); // don't forcibly steal focus
  }
}

// ── Alarm handler ─────────────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith('nyonyo|')) return;

  // ── Snooze alarms ──────────────────────────────────────────────
  if (alarm.name.startsWith('nyonyo|snooze|')) {
    const snoozes = await new Promise(r =>
      chrome.storage.session.get(['nyonyo_snoozes'], res => r(res['nyonyo_snoozes'] || {}))
    );
    const entry = snoozes[alarm.name];
    if (entry) {
      delete snoozes[alarm.name];
      await new Promise(r => chrome.storage.session.set({ nyonyo_snoozes: snoozes }, r));
      await openReminderTab(entry.reminder, entry.stage);
    }
    return;
  }

  const now       = new Date();
  const current   = hhmm(now);
  const today     = todayStr();
  const reminders = await getReminders();
  const stages    = await getStages();

  for (const r of reminders) {
    if (r.time !== current) continue;

    const key        = `${r.id}|${today}`;
    const stage      = (stages[key] || 0) + 1;
    if (stage > 3) continue;  // already fired 3 times today

    stages[key] = stage;
    await setStages(stages);
    await openReminderTab(r, stage);
    break; // one reminder per alarm tick; others will fire on their own alarm
  }
});

// ── Lifecycle ─────────────────────────────────────────────────────────────────

console.log('[NyoNyo BG] Service worker started. REMINDER_PAGE =', REMINDER_PAGE);

// On install or update: register alarms from stored reminders
chrome.runtime.onInstalled.addListener(() => {
  console.log('[NyoNyo BG] onInstalled fired — registering alarms');
  registerAlarms();
});

// On browser startup: re-register alarms (service workers are restarted)
chrome.runtime.onStartup.addListener(registerAlarms);

// Re-register whenever the popup (or demo.html) updates storage
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes[STORAGE_KEY]) {
    registerAlarms();
  }
});

// ── Message handler (from popup or demo.html) ─────────────────────────────────
// Supports: { type: 'DEMO' } → open reminder.html in demo/stage-1 mode immediately

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  console.log('[NyoNyo BG] Message received:', msg);
  if (msg.type === 'DEMO') {
    const fakeReminder = { id: 'demo', name: msg.name || 'Demo Reminder', time: hhmm(new Date()) };
    console.log('[NyoNyo BG] DEMO → opening tab for', fakeReminder.name);
    openReminderTab(fakeReminder, msg.stage || 1).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === 'REGISTER_ALARMS') {
    registerAlarms().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === 'SNOOZE') {
    const snoozeReminder = { id: msg.id, name: msg.name, time: msg.time };
    const snoozeStage    = Math.min((msg.stage || 1), 3);
    chrome.alarms.create(`nyonyo|snooze|${msg.id}`, { delayInMinutes: msg.delayMinutes || 5 });
    // Store snooze info so the alarm handler knows what to open
    chrome.storage.session.get(['nyonyo_snoozes'], result => {
      const snoozes = result['nyonyo_snoozes'] || {};
      snoozes[`nyonyo|snooze|${msg.id}`] = { reminder: snoozeReminder, stage: snoozeStage };
      chrome.storage.session.set({ nyonyo_snoozes: snoozes });
    });
    sendResponse({ ok: true });
    return true;
  }
});
