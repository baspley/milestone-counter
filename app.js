/**
 * MILESTONE COUNTER — app.js
 *
 * New in this version:
 *  - Wallpaper support: each timer can have a full-bleed background image
 *  - Built-in CSS themes (no image files — pure gradients, no copyright issues)
 *  - User photos stored in IndexedDB (can hold binary data, unlike localStorage)
 *  - localStorage still holds all timer metadata; IndexedDB only holds image blobs
 *
 * Why IndexedDB for photos?
 *  localStorage only stores strings, and images as base64 strings balloon in
 *  size — a 1 MB photo becomes ~1.37 MB of string. Worse, localStorage has a
 *  ~5 MB quota in most browsers; one photo would nearly fill it.
 *  IndexedDB stores binary blobs efficiently, has a much larger quota (typically
 *  hundreds of MB), and is the standard PWA solution for offline media storage.
 */

'use strict';


/* ════════════════════════════════════════════════════
   1. BUILT-IN WALLPAPER THEMES
   These are pure CSS background strings — no image
   files required, no copyright concerns, works offline.
   Each theme has a key, a category, a display label,
   and a `css` string that goes into background: ...
════════════════════════════════════════════════════ */

const WALLPAPER_THEMES = [

  // ── Health & Recovery ──
  {
    key:      'health_dawn',
    category: 'Health & Recovery',
    label:    'Dawn',
    css:      'linear-gradient(160deg, #1a0533 0%, #3d1a6e 30%, #c2185b 65%, #ff8a65 100%)',
  },
  {
    key:      'health_calm',
    category: 'Health & Recovery',
    label:    'Calm',
    css:      'linear-gradient(180deg, #0d1b2a 0%, #1b3a4b 40%, #2d6a4f 75%, #52b788 100%)',
  },
  {
    key:      'health_breath',
    category: 'Health & Recovery',
    label:    'Breathe',
    css:      'radial-gradient(ellipse at 50% 40%, #a8d8ea 0%, #4a90a4 45%, #1a3a4a 100%)',
  },
  {
    key:      'health_sunrise',
    category: 'Health & Recovery',
    label:    'Sunrise',
    css:      'linear-gradient(175deg, #0f0c29 0%, #302b63 40%, #24243e 65%, #f7971e 90%, #ffd200 100%)',
  },

  // ── Travel & Holidays ──
  {
    key:      'travel_ocean',
    category: 'Travel & Holidays',
    label:    'Ocean',
    css:      'linear-gradient(180deg, #001e3c 0%, #0a3d62 25%, #1565c0 55%, #29b6f6 80%, #4dd0e1 100%)',
  },
  {
    key:      'travel_sunset',
    category: 'Travel & Holidays',
    label:    'Sunset',
    css:      'linear-gradient(170deg, #1a0533 0%, #7b1fa2 25%, #e91e63 55%, #ff6f00 80%, #ffca28 100%)',
  },
  {
    key:      'travel_jungle',
    category: 'Travel & Holidays',
    label:    'Jungle',
    css:      'linear-gradient(160deg, #0a1a0f 0%, #1b5e20 35%, #2e7d32 60%, #558b2f 80%, #8bc34a 100%)',
  },
  {
    key:      'travel_sand',
    category: 'Travel & Holidays',
    label:    'Desert',
    css:      'linear-gradient(175deg, #1a0a00 0%, #5d3a1a 30%, #c68642 60%, #f0c080 85%, #fde8bb 100%)',
  },

  // ── Fitness & Sport ──
  {
    key:      'fitness_fire',
    category: 'Fitness & Sport',
    label:    'Fire',
    css:      'linear-gradient(170deg, #0d0d0d 0%, #3e0000 30%, #b71c1c 60%, #ff5722 85%, #ffab40 100%)',
  },
  {
    key:      'fitness_ice',
    category: 'Fitness & Sport',
    label:    'Ice',
    css:      'linear-gradient(155deg, #050a1a 0%, #0d2137 30%, #0277bd 60%, #80d8ff 90%, #e1f5fe 100%)',
  },
  {
    key:      'fitness_night',
    category: 'Fitness & Sport',
    label:    'Night Run',
    css:      'radial-gradient(ellipse at 50% 0%, #1a237e 0%, #000051 50%, #000000 100%)',
  },
  {
    key:      'fitness_storm',
    category: 'Fitness & Sport',
    label:    'Storm',
    css:      'linear-gradient(160deg, #1a1a2e 0%, #16213e 35%, #0f3460 65%, #533483 100%)',
  },

  // ── Family & Milestones ──
  {
    key:      'family_gold',
    category: 'Family & Milestones',
    label:    'Gold',
    css:      'linear-gradient(165deg, #1a1200 0%, #3e2800 30%, #b8860b 60%, #ffd700 85%, #fffde7 100%)',
  },
  {
    key:      'family_rose',
    category: 'Family & Milestones',
    label:    'Rose',
    css:      'linear-gradient(170deg, #1a0010 0%, #4a0030 35%, #ad1457 65%, #f06292 85%, #fce4ec 100%)',
  },
  {
    key:      'family_sky',
    category: 'Family & Milestones',
    label:    'Open Sky',
    css:      'linear-gradient(180deg, #0a1628 0%, #1565c0 40%, #42a5f5 70%, #b3e5fc 100%)',
  },
  {
    key:      'family_aurora',
    category: 'Family & Milestones',
    label:    'Aurora',
    css:      'linear-gradient(155deg, #000814 0%, #001d3d 25%, #003566 45%, #006466 65%, #0ead69 85%, #b5ead7 100%)',
  },
];

/**
 * Get a theme object by its key.
 * @param {string} key
 * @returns {object|undefined}
 */
function getThemeByKey(key) {
  return WALLPAPER_THEMES.find(t => t.key === key);
}

/**
 * Get the CSS background string for a timer's current wallpaper setting.
 * Returns null if no wallpaper is set.
 * @param {object} timer
 * @param {string|null} photoDataUrl - base64 data URL if a user photo is loaded
 * @returns {string|null}
 */
function getWallpaperCss(timer, photoDataUrl = null) {
  if (timer.wallpaper === 'photo' && photoDataUrl) {
    return `url('${photoDataUrl}') center / cover no-repeat`;
  }
  if (timer.wallpaper && timer.wallpaper !== 'photo' && timer.wallpaper !== 'none') {
    const theme = getThemeByKey(timer.wallpaper);
    if (theme) return theme.css;
  }
  return null;
}


/* ════════════════════════════════════════════════════
   2. INDEXEDDB — Photo Storage
   We store user photos as Blob objects in IndexedDB.
   The key is the timer's ID, so each timer can have
   its own photo.

   Why not store photos in localStorage?
    - localStorage only holds strings
    - base64-encoding a 1 MB photo creates a ~1.37 MB string
    - total localStorage quota is ~5 MB in Safari — one photo fills it
    - IndexedDB stores raw binary, is much more efficient, and has
      a far larger quota (limited by device storage, typically GBs)
════════════════════════════════════════════════════ */

const IDB_NAME    = 'milestone_photos';
const IDB_VERSION = 1;
const IDB_STORE   = 'photos';

/** @type {IDBDatabase|null} */
let idb = null;

/**
 * Open (or create) the IndexedDB database.
 * Returns a Promise that resolves when the DB is ready.
 * @returns {Promise<IDBDatabase>}
 */
function openDatabase() {
  return new Promise((resolve, reject) => {
    if (idb) { resolve(idb); return; }

    const request = indexedDB.open(IDB_NAME, IDB_VERSION);

    // onupgradeneeded fires on first open or version bump.
    // This is where we create the object store (equivalent to a table).
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE); // key-value store; we use timer ID as key
      }
    };

    request.onsuccess = (event) => {
      idb = event.target.result;
      resolve(idb);
    };

    request.onerror = (event) => {
      console.warn('[Milestone] IndexedDB open failed:', event.target.error);
      reject(event.target.error);
    };
  });
}

/**
 * Save a photo Blob to IndexedDB, keyed by timer ID.
 * @param {string} timerId
 * @param {Blob} blob
 * @returns {Promise<void>}
 */
async function savePhoto(timerId, blob) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx      = db.transaction(IDB_STORE, 'readwrite');
    const store   = tx.objectStore(IDB_STORE);
    const request = store.put(blob, timerId);
    request.onsuccess = () => resolve();
    request.onerror   = (e) => reject(e.target.error);
  });
}

/**
 * Load a photo from IndexedDB as a data URL string (usable in CSS/img src).
 * Returns null if no photo exists for this timer.
 * @param {string} timerId
 * @returns {Promise<string|null>}
 */
async function loadPhoto(timerId) {
  try {
    const db = await openDatabase();
    const blob = await new Promise((resolve, reject) => {
      const tx      = db.transaction(IDB_STORE, 'readonly');
      const store   = tx.objectStore(IDB_STORE);
      const request = store.get(timerId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror   = (e) => reject(e.target.error);
    });

    if (!blob) return null;

    // Convert Blob to a data URL so it can be used in CSS background-image
    return new Promise((resolve, reject) => {
      const reader  = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.warn('[Milestone] Could not load photo:', e);
    return null;
  }
}

/**
 * Delete a photo from IndexedDB.
 * Called when the user removes their photo or deletes a timer.
 * @param {string} timerId
 * @returns {Promise<void>}
 */
async function deletePhoto(timerId) {
  try {
    const db = await openDatabase();
    await new Promise((resolve, reject) => {
      const tx      = db.transaction(IDB_STORE, 'readwrite');
      const store   = tx.objectStore(IDB_STORE);
      const request = store.delete(timerId);
      request.onsuccess = () => resolve();
      request.onerror   = (e) => reject(e.target.error);
    });
  } catch (e) {
    console.warn('[Milestone] Could not delete photo:', e);
  }
}


/* ════════════════════════════════════════════════════
   3. MILESTONE DEFINITIONS
════════════════════════════════════════════════════ */

const MILESTONE_DEFINITIONS = [
  { key: '7d',    label: '1 Week',      days: 7,    badge: '🌱', messages: ["Seven days. One week. The very first proof that you're doing this.", "A week in — small steps compound into extraordinary journeys.", "Seven sunrises since you started. Keep going."] },
  { key: '14d',   label: '2 Weeks',     days: 14,   badge: '✨', messages: ["Two weeks of showing up. That's not nothing — that's everything.", "Fourteen days. You've built something real here.", "Two weeks down. The momentum is yours now."] },
  { key: '21d',   label: '21 Days',     days: 21,   badge: '🔥', messages: ["21 days — the classic milestone. You've built a habit.", "Three weeks. Science says habits form around here. Yours already has.", "21 days of commitment. Not a phase — a foundation."] },
  { key: '30d',   label: '30 Days',     days: 30,   badge: '⚡', messages: ["One month. That's 720 hours of choosing this path.", "30 days. A full month of proving yourself right.", "A month ago you made a decision. Today you're living it."] },
  { key: '50d',   label: '50 Days',     days: 50,   badge: '🌟', messages: ["Half a century of days. You've outlasted the doubts.", "50 days in — you're not just starting any more. You belong here.", "Fifty days. Solid, undeniable progress."] },
  { key: '60d',   label: '60 Days',     days: 60,   badge: '💎', messages: ["Two months. Most people quit before this. You didn't.", "60 days strong. This is who you are now.", "Two months of daily commitment. That's rare and worth celebrating."] },
  { key: '90d',   label: '90 Days',     days: 90,   badge: '🏅', messages: ["90 days. Three months of getting up and doing the work.", "The 90-day mark — a landmark many aim for, fewer reach.", "Three months in. Look back at day one — that person would be proud of you."] },
  { key: '100d',  label: '100 Days',    days: 100,  badge: '💯', messages: ["100 days. A round, beautiful, hard-won number.", "Triple digits. You made it to 100.", "100 days — a milestone worth sitting with. You did this."] },
  { key: '180d',  label: '6 Months',    days: 180,  badge: '🌊', messages: ["Half a year. Six months of choosing the harder right thing.", "180 days. You're well on your way.", "Six months in. This isn't a streak any more — it's a lifestyle."] },
  { key: '200d',  label: '200 Days',    days: 200,  badge: '🚀', messages: ["200 days. Two hundred. What a number.", "Past 200 now — the doubts couldn't keep up.", "200 days of proof that you mean it."] },
  { key: '365d',  label: '1 Year',      days: 365,  badge: '🎉', messages: ["One year. 365 days. This deserves to be celebrated.", "A full year. Every single day counts, and you counted them all.", "365 days. You've lapped the calendar. This is real."] },
  { key: '500d',  label: '500 Days',    days: 500,  badge: '🏆', messages: ["500 days. That's deep, solid commitment.", "Past 500 now. Most milestones are long behind you.", "Five hundred days. Extraordinary."] },
  { key: '730d',  label: '2 Years',     days: 730,  badge: '🌠', messages: ["Two years. This is part of you now.", "730 days — two full laps around the sun.", "Two years in. What started as a decision is now simply who you are."] },
  { key: '1000d', label: '1,000 Days',  days: 1000, badge: '👑', messages: ["1,000 days. A thousand. The number itself is extraordinary.", "You're in four-digit territory now.", "1,000 days. That's dedication most people can't imagine. You lived it."] },
  { key: '1825d', label: '5 Years',     days: 1825, badge: '🌍', messages: ["Five years. Half a decade. Absolutely remarkable.", "1,825 days. You've made this part of the fabric of your life.", "Five years on. This milestone belongs entirely to you."] },
];

function getPresetMilestoneByKey(key) {
  return MILESTONE_DEFINITIONS.find(m => m.key === key);
}

function resolveMilestone(key, timer) {
  const preset = getPresetMilestoneByKey(key);
  if (preset) return preset;
  if (key.startsWith('custom_') && timer.customMilestones) {
    const custom = timer.customMilestones.find(m => m.key === key);
    if (custom) {
      return {
        key:   custom.key,
        label: `Day ${custom.days}`,
        days:  custom.days,
        badge: '🎯',
        messages: [
          `Day ${custom.days}. You set this milestone yourself — and you reached it.`,
          `${custom.days} days. Exactly where you planned to be.`,
          `Day ${custom.days} reached. Mark it, remember it.`,
        ],
      };
    }
  }
  return null;
}

function pickMilestoneMessage(milestone) {
  const msgs = milestone.messages;
  return msgs[Math.floor(Math.random() * msgs.length)];
}


/* ════════════════════════════════════════════════════
   4. STATE & PERSISTENCE
   Timers (metadata) → localStorage
   Photos (binary)   → IndexedDB
════════════════════════════════════════════════════ */

const STORAGE_KEY = 'milestoneCounter_v1';

/**
 * Timer shape:
 * {
 *   id:               string
 *   name:             string
 *   date:             string           "YYYY-MM-DD"
 *   mode:             'countdown'|'countup'
 *   wallpaper:        string|'none'    theme key, 'photo', or 'none'
 *   milestoneKeys:    string[]
 *   customMilestones: Array<{key,days}>
 *   shownMilestones:  string[]
 * }
 */
let appState = {
  timers: [],
  theme: 'dark',
  activeTimerId: null,
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) appState = { ...appState, ...JSON.parse(raw) };
  } catch (e) {
    console.warn('[Milestone] Could not load state:', e);
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
  } catch (e) {
    console.warn('[Milestone] Could not save state:', e);
  }
}

function generateId() {
  if (crypto && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}


/* ════════════════════════════════════════════════════
   5. TIME CALCULATION HELPERS
════════════════════════════════════════════════════ */

function getTimerValues(timer) {
  const now    = new Date();
  const target = new Date(timer.date + 'T00:00:00');

  const fromDate = timer.mode === 'countup' ? target : now;
  const toDate   = timer.mode === 'countup' ? now    : target;

  const isExpired = toDate < fromDate;
  if (isExpired) return { months: 0, weeks: 0, days: 0, hours: 0, totalDays: 0, isExpired: true };

  let months = (toDate.getFullYear() - fromDate.getFullYear()) * 12
             + (toDate.getMonth() - fromDate.getMonth());
  if (toDate.getDate() < fromDate.getDate()) months--;
  if (months < 0) months = 0;

  const afterMonths = new Date(fromDate);
  afterMonths.setMonth(afterMonths.getMonth() + months);

  const remainingMs   = toDate - afterMonths;
  const remainingDays = Math.floor(remainingMs / (1000 * 60 * 60 * 24));

  const weeks = Math.floor(remainingDays / 7);
  const days  = remainingDays % 7;

  const afterDays = new Date(afterMonths);
  afterDays.setDate(afterDays.getDate() + remainingDays);
  const hours = Math.floor((toDate - afterDays) / (1000 * 60 * 60));

  const totalDays = Math.floor((toDate - fromDate) / (1000 * 60 * 60 * 24));

  return { months, weeks, days, hours, totalDays, isExpired };
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function getNextMilestone(timer, totalDays) {
  const allKeys = [
    ...(timer.milestoneKeys    || []),
    ...(timer.customMilestones || []).map(m => m.key),
  ];
  let next = null;
  for (const key of allKeys) {
    const def = resolveMilestone(key, timer);
    if (!def) continue;
    if (timer.mode === 'countup') {
      if (def.days > totalDays && (!next || def.days < next.days)) next = def;
    } else {
      if (def.days < totalDays && (!next || def.days > next.days)) next = def;
    }
  }
  return next;
}


/* ════════════════════════════════════════════════════
   6. SCREEN ROUTER
════════════════════════════════════════════════════ */

let currentScreen = 'list';

function showScreen(name) {
  currentScreen = name;
  document.querySelectorAll('.screen').forEach(el => {
    el.classList.toggle('active', el.id === `screen-${name}`);
  });
  if (name !== 'detail') stopTicker();
}


/* ════════════════════════════════════════════════════
   7. TICKER
════════════════════════════════════════════════════ */

let tickerHandle = null;

function startTicker() {
  stopTicker();
  tickerHandle = setInterval(updateDetailDisplay, 60 * 1000);
}

function stopTicker() {
  if (tickerHandle !== null) {
    clearInterval(tickerHandle);
    tickerHandle = null;
  }
}


/* ════════════════════════════════════════════════════
   8. RENDERING — Timer List Screen
════════════════════════════════════════════════════ */

function renderTimerList() {
  const listEl  = document.getElementById('timer-list');
  const emptyEl = document.getElementById('empty-state');

  emptyEl.classList.toggle('hidden', appState.timers.length > 0);
  listEl.innerHTML = '';

  appState.timers.forEach(timer => {
    const { totalDays, isExpired } = getTimerValues(timer);
    const li = document.createElement('li');
    li.className = 'timer-card';
    li.setAttribute('role', 'listitem');

    const modeVerb = timer.mode === 'countdown' ? 'Until' : 'Since';

    // Left-edge colour strip: use the theme accent colour, or amber for photos, or dim for none
    let thumbStyle = 'background: var(--border);';
    if (timer.wallpaper && timer.wallpaper !== 'none') {
      if (timer.wallpaper === 'photo') {
        thumbStyle = 'background: linear-gradient(180deg, #f5a623, #e05c5c);';
      } else {
        const theme = getThemeByKey(timer.wallpaper);
        if (theme) thumbStyle = `background: ${theme.css};`;
      }
    }

    li.innerHTML = `
      <div class="timer-card-thumb" style="${thumbStyle}" aria-hidden="true"></div>
      <div class="timer-card-info">
        <div class="timer-card-name">${escapeHtml(timer.name)}</div>
        <div class="timer-card-sub">${modeVerb} ${formatDate(timer.date)}</div>
      </div>
      <div>
        <div class="timer-card-days">${isExpired ? '—' : totalDays}</div>
        <div class="timer-card-days-label">${isExpired ? 'arrived' : (timer.mode === 'countdown' ? 'days left' : 'days')}</div>
      </div>
    `;

    li.addEventListener('click', () => openDetailScreen(timer.id));
    listEl.appendChild(li);
  });
}


/* ════════════════════════════════════════════════════
   9. RENDERING — Detail Screen
════════════════════════════════════════════════════ */

/**
 * Apply the wallpaper to the detail screen background layer.
 * Loads the photo from IndexedDB if needed.
 * @param {object} timer
 */
/**
 * Render a photo with a position/zoom transform onto a canvas and return
 * a data URL. Used to apply the user's crop to the detail screen wallpaper.
 *
 * We render at the device's screen size (window.innerWidth x window.innerHeight)
 * so the result looks sharp on any iPhone.
 *
 * @param {string} dataUrl - original photo
 * @param {{ x: number, y: number, scale: number }} transform
 * @returns {Promise<string>} - data URL of the cropped image
 */
async function applyTransformToCanvas(dataUrl, transform) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      const canvas = document.createElement('canvas');
      canvas.width  = vw;
      canvas.height = vh;
      const ctx = canvas.getContext('2d');

      const scaledW = img.naturalWidth  * transform.scale;
      const scaledH = img.naturalHeight * transform.scale;

      // Image centre in screen space (viewport centre + user offset)
      const imgCentreX = vw / 2 + transform.x;
      const imgCentreY = vh / 2 + transform.y;

      // Top-left of scaled image
      const imgLeft = imgCentreX - scaledW / 2;
      const imgTop  = imgCentreY - scaledH / 2;

      ctx.drawImage(img, imgLeft, imgTop, scaledW, scaledH);

      resolve(canvas.toDataURL('image/jpeg', 0.92));
    };
    img.onerror = () => resolve(dataUrl); // fallback to original if anything fails
    img.src = dataUrl;
  });
}

async function applyDetailWallpaper(timer) {
  const wallpaperEl = document.getElementById('detail-wallpaper');
  const screenEl    = document.getElementById('screen-detail');

  // No wallpaper set — apply immediately without touching IndexedDB.
  // Timers created before the wallpaper feature was added have
  // wallpaper === undefined, which also falls through here.
  if (!timer.wallpaper || timer.wallpaper === 'none') {
    wallpaperEl.style.background = '';
    screenEl.classList.add('no-wallpaper');
    return;
  }

  let css = null;

  if (timer.wallpaper === 'photo') {
    // Only open IndexedDB when we actually need a photo
    const dataUrl = await loadPhoto(timer.id);
    if (dataUrl) {
      // If we have a position/zoom transform, render it to a canvas first
      // so the wallpaper respects the user's crop.
      if (timer.photoTransform) {
        const croppedUrl = await applyTransformToCanvas(dataUrl, timer.photoTransform);
        css = `url('${croppedUrl}') center / cover no-repeat`;
      } else {
        css = `url('${dataUrl}') center / cover no-repeat`;
      }
    }
  } else {
    // Built-in CSS theme — no async work needed
    const theme = getThemeByKey(timer.wallpaper);
    if (theme) css = theme.css;
  }

  if (css) {
    wallpaperEl.style.background = css;
    screenEl.classList.remove('no-wallpaper');
  } else {
    wallpaperEl.style.background = '';
    screenEl.classList.add('no-wallpaper');
  }
}

async function openDetailScreen(timerId) {
  appState.activeTimerId = timerId;
  saveState();
  showScreen('detail');

  const timer = appState.timers.find(t => t.id === timerId);
  if (!timer) return;

  document.getElementById('detail-timer-name').textContent = timer.name;
  document.getElementById('detail-mode-label').textContent =
    timer.mode === 'countdown' ? 'Counting down to' : 'Counting up from';
  document.getElementById('detail-target-date').textContent = formatDate(timer.date);

  // Update the digits immediately — do NOT await wallpaper first.
  // The wallpaper is cosmetic; the digits are the point. Loading a photo
  // from IndexedDB can take a moment, and we never want that to block
  // the display from rendering.
  updateDetailDisplay();
  startTicker();

  // Apply wallpaper in the background — it will appear once ready.
  applyDetailWallpaper(timer).catch(err => {
    console.warn('[Milestone] Wallpaper apply failed:', err);
  });
}

function updateDetailDisplay() {
  const timer = appState.timers.find(t => t.id === appState.activeTimerId);
  if (!timer) return;

  const { months, weeks, days, hours, totalDays, isExpired } = getTimerValues(timer);

  document.getElementById('disp-months').textContent = isExpired ? '—'  : String(months);
  document.getElementById('disp-weeks').textContent  = isExpired ? '--' : String(weeks);
  document.getElementById('disp-days').textContent   = isExpired ? '--' : String(days);
  document.getElementById('disp-hours').textContent  = isExpired ? '--' : String(hours);

  const nextMs = getNextMilestone(timer, totalDays);
  const hintEl = document.getElementById('next-milestone-hint');

  if (nextMs && !isExpired) {
    const daysAway = timer.mode === 'countup'
      ? nextMs.days - totalDays
      : totalDays - nextMs.days;
    hintEl.textContent = `Next: ${nextMs.label} — ${daysAway} day${daysAway === 1 ? '' : 's'} away`;
  } else if (isExpired) {
    hintEl.textContent = timer.mode === 'countdown' ? 'Date reached.' : '';
  } else {
    hintEl.textContent = 'All milestones reached!';
  }

  checkMilestones(timer, totalDays);

  // Show active message on detail screen
  updateDetailMessage(timer, totalDays);
}

function checkMilestones(timer, totalDays) {
  if (!document.getElementById('milestone-overlay').classList.contains('hidden')) return;
  if (totalDays === 0) return;

  const allKeys   = [
    ...(timer.milestoneKeys    || []),
    ...(timer.customMilestones || []).map(m => m.key),
  ];
  const shownKeys = timer.shownMilestones || [];

  for (const key of allKeys) {
    if (shownKeys.includes(key)) continue;
    const def = resolveMilestone(key, timer);
    if (!def) continue;

    const shouldFire = timer.mode === 'countup'
      ? totalDays >= def.days
      : totalDays <= def.days;

    if (shouldFire) {
      timer.shownMilestones = [...shownKeys, key];
      saveState();
      showMilestoneOverlay(def);
      return;
    }
  }
}

function showMilestoneOverlay(milestoneDef) {
  const overlay = document.getElementById('milestone-overlay');

  document.getElementById('milestone-badge').textContent   = milestoneDef.badge;
  document.getElementById('milestone-title').textContent   = milestoneDef.label;
  document.getElementById('milestone-message').textContent = pickMilestoneMessage(milestoneDef);

  const heroEl = document.getElementById('countdown-hero');
  heroEl.classList.remove('milestone-pulse');
  void heroEl.offsetWidth;
  heroEl.classList.add('milestone-pulse');

  const card    = overlay.querySelector('.milestone-card');
  const newCard = card.cloneNode(true);
  card.replaceWith(newCard);
  newCard.querySelector('#btn-close-milestone').addEventListener('click', closeMilestoneOverlay);

  overlay.classList.remove('hidden');
}

function closeMilestoneOverlay() {
  document.getElementById('milestone-overlay').classList.add('hidden');
}


/* ════════════════════════════════════════════════════
   10. RENDERING — Form Screen
════════════════════════════════════════════════════ */

let editingTimerId = null;

/**
 * The wallpaper selection the user is currently working with in the form.
 * 'none' | a theme key | 'photo'
 * @type {string}
 */
let formWallpaperSelection = 'none';

/**
 * A pending photo Blob chosen in the file picker but not yet saved.
 * Held here so we can save it to IndexedDB at form submit time.
 * @type {Blob|null}
 */
let formPendingPhotoBlob = null;

/**
 * The position/zoom transform the user set in the photo editor.
 * Saved alongside the timer metadata in localStorage.
 * @type {{ x: number, y: number, scale: number }|null}
 */
let formPendingPhotoTransform = null;

function openFormScreen(timerId = null) {
  editingTimerId    = timerId;
  formEditingTimer  = null; // will be set below
  const isEditing   = timerId !== null;
  const timer       = isEditing ? appState.timers.find(t => t.id === timerId) : null;
  formEditingTimer  = timer;

  document.getElementById('form-screen-title').textContent = isEditing ? 'Edit Timer' : 'New Timer';
  document.getElementById('input-name').value = timer ? timer.name : '';
  document.getElementById('input-date').value = timer ? timer.date : '';

  const currentMode = timer ? timer.mode : 'countdown';
  document.querySelectorAll('.mode-toggle-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === currentMode);
  });

  buildMilestoneCheckboxes(timer ? (timer.milestoneKeys || []) : []);
  setFormCustomMilestones(timer ? (timer.customMilestones || []) : []);
  setFormMessages(timer ? (timer.messages || []) : [], timer);
  // Re-populate the milestone dropdown for the message builder
  const milestoneDropdown = document.getElementById('input-message-milestone');
  if (milestoneDropdown) milestoneDropdown.innerHTML = buildMilestoneOptions(timer);
  document.getElementById('btn-form-delete').classList.toggle('hidden', !isEditing);

  // Wallpaper state
  formWallpaperSelection    = timer ? (timer.wallpaper || 'none') : 'none';
  formPendingPhotoBlob      = null;
  formPendingPhotoTransform = timer ? (timer.photoTransform || null) : null;

  buildWallpaperPicker(timer);
  showScreen('form');
}

/**
 * Build the wallpaper picker UI: theme grid + photo tab.
 * @param {object|null} timer - the timer being edited, or null for new
 */
async function buildWallpaperPicker(timer) {
  buildThemeGrid();

  // Restore photo preview if this timer already has a photo
  if (timer && timer.wallpaper === 'photo') {
    const dataUrl = await loadPhoto(timer.id);
    if (dataUrl) {
      // Store in editorState so the "Adjust position" button can open
      // the editor immediately without needing to reload from IndexedDB
      editorState.dataUrl = dataUrl;
      showPhotoPreview(dataUrl, timer.photoTransform || null);
    } else {
      hidePhotoPreview();
    }
  } else {
    editorState.dataUrl = null;
    hidePhotoPreview();
  }

  // Mark the current selection in the grid
  updateThemeGridSelection();
}

/**
 * Populate the theme grid with one swatch per built-in theme, grouped by category.
 */
function buildThemeGrid() {
  const gridEl = document.getElementById('wp-theme-grid');
  gridEl.innerHTML = '';

  // Group themes by category
  const categories = [...new Set(WALLPAPER_THEMES.map(t => t.category))];

  categories.forEach(cat => {
    // Category label
    const catLabel = document.createElement('p');
    catLabel.className = 'wp-category-label';
    catLabel.textContent = cat;
    // Span all columns
    catLabel.style.gridColumn = '1 / -1';
    gridEl.appendChild(catLabel);

    // Theme swatches for this category
    WALLPAPER_THEMES.filter(t => t.category === cat).forEach(theme => {
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = 'wp-theme-item';
      swatch.dataset.themeKey = theme.key;
      swatch.setAttribute('aria-label', theme.label);
      swatch.style.background = theme.css;
      swatch.innerHTML = `<span class="wp-selected-tick" aria-hidden="true">✓</span>`;

      swatch.addEventListener('click', () => {
        formWallpaperSelection = theme.key;
        formPendingPhotoBlob   = null; // photo is deselected when a theme is picked
        hidePhotoPreview();
        updateThemeGridSelection();
        // Switch to the built-in tab if we're not already there
        switchWallpaperTab('builtin');
      });

      gridEl.appendChild(swatch);
    });
  });
}

/** Refresh the selected/unselected state of all theme swatches */
function updateThemeGridSelection() {
  document.querySelectorAll('.wp-theme-item').forEach(el => {
    el.classList.toggle('selected', el.dataset.themeKey === formWallpaperSelection);
  });
}

/** Switch between the Built-in / Your Photo tabs in the picker */
function switchWallpaperTab(tabName) {
  document.querySelectorAll('.wp-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
    btn.setAttribute('aria-selected', btn.dataset.tab === tabName ? 'true' : 'false');
  });
  document.getElementById('wp-panel-builtin').classList.toggle('hidden', tabName !== 'builtin');
  document.getElementById('wp-panel-photo').classList.toggle('hidden', tabName !== 'photo');
}

/**
 * Show the photo preview in the form (once a photo is chosen or already set).
 * @param {string} dataUrl
 */
function showPhotoPreview(dataUrl, transform = null) {
  const previewEl = document.getElementById('wp-photo-preview');
  const uploadEl  = document.getElementById('wp-upload-label');

  previewEl.classList.remove('hidden');
  uploadEl.classList.add('hidden');

  if (transform) {
    // Show a cropped thumbnail reflecting the saved transform
    updatePhotoPreviewThumbnail(dataUrl, transform);
  } else {
    const imgEl = document.getElementById('wp-preview-img');
    imgEl.src = dataUrl;
  }
}

function hidePhotoPreview() {
  document.getElementById('wp-photo-preview').classList.add('hidden');
  document.getElementById('wp-upload-label').classList.remove('hidden');
  document.getElementById('wp-preview-img').src = '';
}

// ── Milestone checkbox builder ──

/**
 * Build the preset milestone checkboxes.
 * @param {string[]} selectedKeys
 */
function buildMilestoneCheckboxes(selectedKeys = []) {
  const container = document.getElementById('milestone-checkboxes');
  container.innerHTML = '';
  MILESTONE_DEFINITIONS.forEach(def => {
    const label = document.createElement('label');
    label.className = 'milestone-check-label';
    label.innerHTML = `
      <input type="checkbox" value="${def.key}" ${selectedKeys.includes(def.key) ? 'checked' : ''} />
      ${def.badge} ${def.label}
    `;
    container.appendChild(label);
  });
}


// ── Custom milestone list ──

function renderCustomMilestoneRows(milestones) {
  const listEl = document.getElementById('custom-milestone-list');
  listEl.innerHTML = '';

  if (milestones.length === 0) {
    listEl.innerHTML = '<p class="custom-milestone-empty">None added yet</p>';
    return;
  }

  [...milestones].sort((a, b) => a.days - b.days).forEach(cm => {
    const row = document.createElement('div');
    row.className = 'custom-milestone-row';
    row.innerHTML = `
      <span class="custom-milestone-label">🎯 Day ${cm.days}</span>
      <button type="button" class="custom-milestone-remove" aria-label="Remove Day ${cm.days}">✕</button>
    `;
    row.querySelector('.custom-milestone-remove').addEventListener('click', () => {
      setFormCustomMilestones(getFormCustomMilestones().filter(m => m.key !== cm.key));
    });
    listEl.appendChild(row);
  });
}

function getFormCustomMilestones() {
  const raw = document.getElementById('custom-milestone-list').dataset.milestones;
  return raw ? JSON.parse(raw) : [];
}

function setFormCustomMilestones(milestones) {
  document.getElementById('custom-milestone-list').dataset.milestones = JSON.stringify(milestones);
  renderCustomMilestoneRows(milestones);
}

function addCustomMilestoneToForm() {
  const input = document.getElementById('input-custom-days');
  const days  = parseInt(input.value, 10);

  if (!days || days < 1 || days > 9999) { alert('Please enter a number between 1 and 9,999.'); return; }

  const existing   = getFormCustomMilestones();
  const presetDays = MILESTONE_DEFINITIONS.map(d => d.days);
  if (existing.some(m => m.days === days) || presetDays.includes(days)) {
    alert(`Day ${days} is already covered.`); return;
  }

  setFormCustomMilestones([...existing, { key: `custom_${days}`, days }]);
  input.value = '';
  input.focus();
}


/* ════════════════════════════════════════════════════
   MESSAGE SYSTEM FORM HELPERS

   Each timer can have multiple messages. Each message:
     text:       string  — the message to display
     daysBefore: number  — start showing this many days
                           before the milestone date
     milestoneKey: string — which milestone it's tied to
                            (used to compute the target date)

   Messages are stored on the timer as:
     messages: [{ text, daysBefore, milestoneKey }]

   On the detail screen, we compute which messages are
   currently active and display the most relevant one
   (closest upcoming milestone) below the time display.
════════════════════════════════════════════════════ */

/**
 * Build the dropdown options for the milestone picker in the message form.
 * Includes both preset and custom milestones for the current timer.
 * @param {object|null} timer
 * @returns {string} HTML option elements
 */
function buildMilestoneOptions(timer) {
  let options = '<option value="">— choose a milestone —</option>';

  MILESTONE_DEFINITIONS.forEach(def => {
    options += `<option value="${def.key}">${def.badge} ${def.label}</option>`;
  });

  if (timer && timer.customMilestones) {
    timer.customMilestones.forEach(cm => {
      options += `<option value="${cm.key}">🎯 Day ${cm.days}</option>`;
    });
  }

  return options;
}

/**
 * Render the message rows in the form.
 * @param {Array} messages
 * @param {object|null} timer
 */
function renderMessageRows(messages, timer = null) {
  const container = document.getElementById('message-list');
  container.innerHTML = '';

  if (messages.length === 0) {
    container.innerHTML = '<p class="custom-milestone-empty">No messages added yet</p>';
    return;
  }

  messages.forEach((msg, index) => {
    const row = document.createElement('div');
    row.className = 'message-row';
    const def = msg.milestoneKey ? resolveMilestone(msg.milestoneKey, timer || {}) : null;
    const milestoneName = def ? `${def.badge} ${def.label}` : 'Unknown milestone';

    row.innerHTML = `
      <div class="message-row-header">
        <span class="message-row-milestone">${milestoneName}</span>
        <button type="button" class="custom-milestone-remove message-remove-btn" data-index="${index}" aria-label="Remove message">✕</button>
      </div>
      <p class="message-row-text">${escapeHtml(msg.text)}</p>
      <p class="message-row-meta">Show from ${msg.daysBefore} day${msg.daysBefore === 1 ? '' : 's'} before</p>
    `;

    row.querySelector('.message-remove-btn').addEventListener('click', () => {
      const current = getFormMessages();
      current.splice(index, 1);
      setFormMessages(current, timer);
    });

    container.appendChild(row);
  });
}

/** Get current message list from the form data attribute. */
function getFormMessages() {
  const raw = document.getElementById('message-list').dataset.messages;
  return raw ? JSON.parse(raw) : [];
}

/** Set message list and re-render. */
function setFormMessages(messages, timer = null) {
  document.getElementById('message-list').dataset.messages = JSON.stringify(messages);
  renderMessageRows(messages, timer);
}

/** Add a new message from the form inputs. */
function addMessageToForm() {
  const textEl       = document.getElementById('input-message-text');
  const daysEl       = document.getElementById('input-message-days');
  const milestoneEl  = document.getElementById('input-message-milestone');

  const text         = textEl.value.trim();
  const daysBefore   = parseInt(daysEl.value, 10);
  const milestoneKey = milestoneEl.value;

  if (!text)         { alert('Please enter a message.'); return; }
  if (!milestoneKey) { alert('Please choose a milestone.'); return; }
  if (!daysBefore || daysBefore < 1) { alert('Please enter how many days before to start showing this message.'); return; }

  const current = getFormMessages();
  current.push({ text, daysBefore, milestoneKey });
  setFormMessages(current, formEditingTimer);

  // Clear inputs
  textEl.value      = '';
  daysEl.value      = '';
  milestoneEl.value = '';
  textEl.focus();
}

/** Reference to the timer being edited — needed for milestone dropdown in messages. */
let formEditingTimer = null;

// ── Form read / submit / delete ──

function readFormValues() {
  const name = document.getElementById('input-name').value.trim();
  const date = document.getElementById('input-date').value;
  const mode = document.querySelector('.mode-toggle-btn.active')?.dataset.mode || 'countdown';

  if (!name) { alert('Please give your timer a name.'); return null; }
  if (!date) { alert('Please choose a date.'); return null; }

  const milestoneKeys    = Array.from(document.querySelectorAll('#milestone-checkboxes input[type="checkbox"]:checked')).map(cb => cb.value);
  const customMilestones = getFormCustomMilestones();
  const messages         = getFormMessages();

  return { name, date, mode, milestoneKeys, customMilestones, messages, wallpaper: formWallpaperSelection };
}

async function handleFormSubmit(event) {
  event.preventDefault();
  const values = readFormValues();
  if (!values) return;

  let savedId;

  if (editingTimerId) {
    const index = appState.timers.findIndex(t => t.id === editingTimerId);
    if (index !== -1) {
      const existing    = appState.timers[index];
      const dateChanged = existing.date !== values.date;
      appState.timers[index] = {
        ...existing,
        ...values,
        photoTransform:  values.wallpaper === 'photo' ? (formPendingPhotoTransform || existing.photoTransform || null) : null,
        messages:        values.messages,
        shownMilestones: dateChanged ? [] : existing.shownMilestones,
      };
    }
    savedId = editingTimerId;
  } else {
    const newTimer = {
      id:               generateId(),
      name:             values.name,
      date:             values.date,
      mode:             values.mode,
      wallpaper:        values.wallpaper,
      photoTransform:   values.wallpaper === 'photo' ? formPendingPhotoTransform : null,
      milestoneKeys:    values.milestoneKeys,
      customMilestones: values.customMilestones,
      messages:         values.messages,
      shownMilestones:  [],
    };
    appState.timers.push(newTimer);
    savedId = newTimer.id;
  }

  // Save the pending photo to IndexedDB if one was chosen
  if (formPendingPhotoBlob && values.wallpaper === 'photo') {
    await savePhoto(savedId, formPendingPhotoBlob);
  }

  // If the user switched away from photo, clean up any old stored photo
  if (values.wallpaper !== 'photo') {
    await deletePhoto(savedId);
  }

  saveState();
  renderTimerList();
  openDetailScreen(savedId);
}

async function deleteTimer() {
  if (!editingTimerId) return;
  if (!confirm('Delete this timer? This cannot be undone.')) return;

  await deletePhoto(editingTimerId); // clean up any stored photo
  appState.timers = appState.timers.filter(t => t.id !== editingTimerId);
  if (appState.activeTimerId === editingTimerId) appState.activeTimerId = null;

  saveState();
  renderTimerList();
  showScreen('list');
}



/* ════════════════════════════════════════════════════
   11. PHOTO POSITION & ZOOM EDITOR

   When the user taps the photo preview, a full-screen
   editor opens. They can drag to reposition and pinch
   to zoom. The result is stored as a transform object:
     { x: number, y: number, scale: number }
   where x/y are pixel offsets from the image centre
   and scale is a multiplier (1.0 = fit-to-viewport).

   We store this transform in the timer's metadata in
   localStorage so it persists across sessions.

   Architecture:
    - editorState holds all mutable editor variables
    - openPhotoEditor() sets up the image and restores
      any previously saved transform
    - Pointer events handle both mouse (desktop) and
      touch (iPhone) via the unified PointerEvent API
    - Pinch zoom uses the distance between two active
      pointer points
    - constrainTransform() keeps the image covering the
      viewport at all times (no empty edges showing)
    - donePhotoEditor() saves the transform and renders
      a preview thumbnail using an off-screen canvas
════════════════════════════════════════════════════ */

/**
 * All mutable state for the photo editor.
 * Kept in one object so it's easy to reset on open/close.
 */
let editorState = {
  // The full-resolution image data URL (from IndexedDB or new file)
  dataUrl:      null,
  // Current transform values
  x:            0,      // horizontal offset in px (from centre)
  y:            0,      // vertical offset in px (from centre)
  scale:        1.0,    // zoom multiplier
  // Minimum scale: computed on open so image always covers viewport
  minScale:     1.0,
  // Pointer tracking for drag and pinch
  isDragging:   false,
  lastX:        0,
  lastY:        0,
  // Pinch tracking: store both pointer positions by ID
  pointers:     {},     // { pointerId: { x, y } }
  lastPinchDist: null,  // distance between two fingers at last event
};

/**
 * Open the photo editor overlay for the current photo.
 * Loads the image, restores any saved transform, then shows the overlay.
 * @param {string} dataUrl - full-res photo data URL
 * @param {{ x:number, y:number, scale:number }|null} savedTransform
 */
function openPhotoEditor(dataUrl, savedTransform) {
  const overlay  = document.getElementById('photo-editor-overlay');
  const imgEl    = document.getElementById('photo-editor-img');

  // Reset editor state
  editorState.dataUrl       = dataUrl;
  editorState.x             = savedTransform ? savedTransform.x     : 0;
  editorState.y             = savedTransform ? savedTransform.y     : 0;
  editorState.scale         = savedTransform ? savedTransform.scale : 1.0;
  editorState.isDragging    = false;
  editorState.pointers      = {};
  editorState.lastPinchDist = null;

  // Set the image source; once loaded we can compute the min scale
  imgEl.src = dataUrl;
  imgEl.onload = () => {
    computeMinScale();
    // If no saved transform, fit the image to cover the viewport by default
    if (!savedTransform) {
      editorState.scale = editorState.minScale;
      editorState.x = 0;
      editorState.y = 0;
    } else {
      // Clamp saved scale in case the viewport size changed (e.g. rotated phone)
      editorState.scale = Math.max(editorState.scale, editorState.minScale);
    }
    applyEditorTransform();
  };

  overlay.classList.remove('hidden');
}

/**
 * Compute the minimum scale so the image always covers the entire viewport.
 * We want cover behaviour (like background-size: cover), so we take the
 * larger of the two ratios (width and height).
 */
function computeMinScale() {
  const viewport = document.getElementById('photo-editor-viewport');
  const imgEl    = document.getElementById('photo-editor-img');

  const vw = viewport.clientWidth;
  const vh = viewport.clientHeight;
  const iw = imgEl.naturalWidth;
  const ih = imgEl.naturalHeight;

  if (!iw || !ih) return;

  // Scale needed to cover the viewport in each dimension
  const scaleW = vw / iw;
  const scaleH = vh / ih;

  // Cover = fill viewport completely, so take the larger scale
  editorState.minScale = Math.max(scaleW, scaleH);
}

/**
 * Apply the current editorState transform to the image element.
 * Uses CSS transform for smooth, GPU-accelerated movement.
 */
function applyEditorTransform() {
  const imgEl   = document.getElementById('photo-editor-img');
  const { x, y, scale } = editorState;

  // The image is positioned at top:50% left:50% (its centre is at the viewport centre)
  // We then apply a translate to move it, and a scale to zoom.
  // translate(-50%,-50%) centres the image, then our x/y offsets move it.
  imgEl.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(${scale})`;
}

/**
 * Constrain the transform so the image always covers the viewport.
 * Called after every drag or zoom gesture.
 */
function constrainTransform() {
  const viewport = document.getElementById('photo-editor-viewport');
  const imgEl    = document.getElementById('photo-editor-img');

  const vw = viewport.clientWidth;
  const vh = viewport.clientHeight;
  const iw = imgEl.naturalWidth  * editorState.scale;
  const ih = imgEl.naturalHeight * editorState.scale;

  // Maximum allowed offset: half the difference between image size and viewport size
  // When image is smaller than viewport in a dimension, clamp to 0
  const maxX = Math.max(0, (iw - vw) / 2);
  const maxY = Math.max(0, (ih - vh) / 2);

  editorState.x = Math.max(-maxX, Math.min(maxX, editorState.x));
  editorState.y = Math.max(-maxY, Math.min(maxY, editorState.y));
}

/** Save the current editor transform and close the overlay. */
function donePhotoEditor() {
  const transform = {
    x:     editorState.x,
    y:     editorState.y,
    scale: editorState.scale,
  };

  // Store the transform for use at form submit time
  formPendingPhotoTransform = transform;

  // Update the form preview thumbnail to reflect the new crop
  updatePhotoPreviewThumbnail(editorState.dataUrl, transform);

  document.getElementById('photo-editor-overlay').classList.add('hidden');
}

/** Close the editor without saving changes. */
function cancelPhotoEditor() {
  document.getElementById('photo-editor-overlay').classList.add('hidden');
}

/**
 * Render a small preview thumbnail in the form that reflects the
 * current position/zoom, so the user can see their crop before saving.
 *
 * We draw onto an off-screen canvas at a small size, then use that
 * as the src of the preview image. This is purely cosmetic.
 *
 * @param {string} dataUrl
 * @param {{ x: number, y: number, scale: number }} transform
 */
function updatePhotoPreviewThumbnail(dataUrl, transform) {
  const previewImg = document.getElementById('wp-preview-img');
  const viewport   = document.getElementById('photo-editor-viewport');

  // Draw a small (360×180) canvas representing the crop
  const canvas  = document.createElement('canvas');
  const vw      = viewport.clientWidth  || 360;
  const vh      = viewport.clientHeight || 640;
  // Aspect ratio of the viewport
  const aspect  = vw / vh;
  canvas.width  = 360;
  canvas.height = Math.round(360 / aspect);
  const ctx     = canvas.getContext('2d');

  const img = new Image();
  img.onload = () => {
    const scale   = transform.scale;
    const scaledW = img.naturalWidth  * scale;
    const scaledH = img.naturalHeight * scale;

    // Destination canvas dimensions
    const dw = canvas.width;
    const dh = canvas.height;

    // The image centre in viewport space, accounting for our x/y offset
    const imgCentreX = vw / 2 + transform.x;
    const imgCentreY = vh / 2 + transform.y;

    // Top-left of the image in viewport space
    const imgLeft = imgCentreX - scaledW / 2;
    const imgTop  = imgCentreY - scaledH / 2;

    // Scale factor from viewport to canvas
    const canvasScaleX = dw / vw;
    const canvasScaleY = dh / vh;

    ctx.drawImage(
      img,
      imgLeft  * canvasScaleX,
      imgTop   * canvasScaleY,
      scaledW  * canvasScaleX,
      scaledH  * canvasScaleY,
    );

    previewImg.src = canvas.toDataURL('image/jpeg', 0.85);
  };
  img.src = dataUrl;
}

/* ── Pointer event handlers (unified mouse + touch) ── */

/**
 * Get the distance between two pointer positions (for pinch zoom).
 * @param {{ x:number, y:number }} p1
 * @param {{ x:number, y:number }} p2
 * @returns {number}
 */
function pointerDistance(p1, p2) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function onEditorPointerDown(e) {
  e.preventDefault();
  const viewport = document.getElementById('photo-editor-viewport');
  viewport.setPointerCapture(e.pointerId);

  editorState.pointers[e.pointerId] = { x: e.clientX, y: e.clientY };

  const pointerCount = Object.keys(editorState.pointers).length;

  if (pointerCount === 1) {
    // Single finger — start drag
    editorState.isDragging = true;
    editorState.lastX = e.clientX;
    editorState.lastY = e.clientY;
    editorState.lastPinchDist = null;
  } else if (pointerCount === 2) {
    // Two fingers — start pinch; cancel drag mode
    editorState.isDragging = false;
    const pts = Object.values(editorState.pointers);
    editorState.lastPinchDist = pointerDistance(pts[0], pts[1]);
  }
}

function onEditorPointerMove(e) {
  e.preventDefault();
  editorState.pointers[e.pointerId] = { x: e.clientX, y: e.clientY };

  const pointerCount = Object.keys(editorState.pointers).length;

  if (pointerCount === 1 && editorState.isDragging) {
    // ── Drag ──
    const dx = e.clientX - editorState.lastX;
    const dy = e.clientY - editorState.lastY;

    editorState.x += dx;
    editorState.y += dy;

    editorState.lastX = e.clientX;
    editorState.lastY = e.clientY;

    constrainTransform();
    applyEditorTransform();

  } else if (pointerCount === 2) {
    // ── Pinch zoom ──
    const pts = Object.values(editorState.pointers);
    const dist = pointerDistance(pts[0], pts[1]);

    if (editorState.lastPinchDist !== null) {
      const ratio = dist / editorState.lastPinchDist;
      editorState.scale = Math.max(
        editorState.minScale,
        Math.min(editorState.scale * ratio, editorState.minScale * 8) // max 8× zoom
      );
      constrainTransform();
      applyEditorTransform();
    }

    editorState.lastPinchDist = dist;
  }
}

function onEditorPointerUp(e) {
  delete editorState.pointers[e.pointerId];

  if (Object.keys(editorState.pointers).length === 0) {
    editorState.isDragging    = false;
    editorState.lastPinchDist = null;
  } else if (Object.keys(editorState.pointers).length === 1) {
    // One finger lifted during pinch — switch back to drag with remaining finger
    const remaining = Object.values(editorState.pointers)[0];
    editorState.isDragging = true;
    editorState.lastX = remaining.x;
    editorState.lastY = remaining.y;
    editorState.lastPinchDist = null;
  }
}


/* ════════════════════════════════════════════════════
   11b. DETAIL SCREEN MESSAGE DISPLAY

   Each timer can have messages tied to milestones.
   When the app is open and we're within the "daysBefore"
   window before a milestone, the message is shown on
   the detail screen below the time display.

   Only one message is shown at a time — the one tied
   to the nearest upcoming milestone.
════════════════════════════════════════════════════ */

/**
 * Compute which message (if any) should be displayed right now.
 * Returns the most relevant message — the one tied to the
 * nearest milestone that hasn't passed yet and is within
 * its daysBefore window.
 *
 * @param {object} timer
 * @param {number} totalDays - elapsed (countup) or remaining (countdown)
 * @returns {{ text: string, daysUntil: number, milestoneName: string }|null}
 */
function getActiveMessage(timer, totalDays) {
  const messages = timer.messages || [];
  if (messages.length === 0) return null;

  let best = null;
  let bestDaysUntil = Infinity;

  for (const msg of messages) {
    if (!msg.text || !msg.milestoneKey) continue;

    const def = resolveMilestone(msg.milestoneKey, timer);
    if (!def) continue;

    let daysUntil;

    if (timer.mode === 'countup') {
      // For count-up: milestone fires when elapsed days reach def.days
      // daysUntil = how many more days until that threshold
      daysUntil = def.days - totalDays;
    } else {
      // For countdown: totalDays = remaining days
      // daysUntil = remaining days (same as totalDays for this milestone)
      daysUntil = totalDays - def.days;
      if (daysUntil < 0) daysUntil = 0;
    }

    // Show the message if we're within the daysBefore window
    // daysUntil can be 0 (today) to msg.daysBefore (start of window)
    const inWindow = daysUntil >= 0 && daysUntil <= msg.daysBefore;

    if (inWindow && daysUntil < bestDaysUntil) {
      bestDaysUntil = daysUntil;
      best = {
        text:          msg.text,
        daysUntil,
        milestoneName: `${def.badge} ${def.label}`,
      };
    }
  }

  return best;
}

/**
 * Update the message display on the detail screen.
 * Shows the active message below the time display, or hides it.
 * @param {object} timer
 * @param {number} totalDays
 */
function updateDetailMessage(timer, totalDays) {
  const el = document.getElementById('detail-message');
  if (!el) return;

  const active = getActiveMessage(timer, totalDays);

  if (active) {
    const dayStr = active.daysUntil === 0
      ? 'Today'
      : active.daysUntil === 1
        ? 'Tomorrow'
        : `${active.daysUntil} days to go`;

    el.innerHTML = `<span class="detail-message-text">${escapeHtml(active.text)}</span><span class="detail-message-when">${dayStr} — ${active.milestoneName}</span>`;
    el.classList.remove('hidden');
  } else {
    el.classList.add('hidden');
  }
}

/* ════════════════════════════════════════════════════
   12. THEME (light/dark)
════════════════════════════════════════════════════ */

function applyTheme() {
  document.body.setAttribute('data-theme', appState.theme);
  document.querySelector('meta[name="theme-color"]').content =
    appState.theme === 'dark' ? '#0a0a0f' : '#f4f3ee';
}

function toggleTheme() {
  appState.theme = appState.theme === 'dark' ? 'light' : 'dark';
  applyTheme();
  saveState();
}


/* ════════════════════════════════════════════════════
   13. UTILITY
════════════════════════════════════════════════════ */

/**
 * Convert a Blob to a base64 data URL.
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader  = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}


/* ════════════════════════════════════════════════════
   14. EVENT WIRING
════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {

  loadState();
  applyTheme();
  renderTimerList();

  // ── List ──
  document.getElementById('btn-new-timer').addEventListener('click', () => openFormScreen(null));
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

  // ── Detail ──
  document.getElementById('btn-back').addEventListener('click', () => {
    stopTicker();
    renderTimerList();
    showScreen('list');
  });
  document.getElementById('btn-edit-timer').addEventListener('click', () => {
    if (appState.activeTimerId) openFormScreen(appState.activeTimerId);
  });

  // ── Form ──
  document.getElementById('btn-form-cancel').addEventListener('click', () => {
    if (appState.activeTimerId && editingTimerId) openDetailScreen(appState.activeTimerId);
    else showScreen('list');
  });
  document.getElementById('timer-form').addEventListener('submit', handleFormSubmit);
  document.getElementById('btn-form-delete').addEventListener('click', deleteTimer);

  document.querySelectorAll('.mode-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // ── Wallpaper picker tabs ──
  document.querySelectorAll('.wp-tab').forEach(btn => {
    btn.addEventListener('click', () => switchWallpaperTab(btn.dataset.tab));
  });

  // "No background" button
  document.getElementById('btn-wp-none').addEventListener('click', () => {
    formWallpaperSelection = 'none';
    formPendingPhotoBlob   = null;
    hidePhotoPreview();
    updateThemeGridSelection();
  });

  // ── Photo file input ──
  document.getElementById('input-wp-photo').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please choose an image file (JPEG, PNG, HEIC, etc.)');
      return;
    }

    formPendingPhotoBlob      = file;
    formPendingPhotoTransform = null; // reset transform for new photo
    formWallpaperSelection    = 'photo';
    updateThemeGridSelection();

    const reader = new FileReader();
    reader.onload = (ev) => {
      editorState.dataUrl = ev.target.result; // keep data URL ready for editor
      showPhotoPreview(ev.target.result, null);
    };
    reader.readAsDataURL(file);
  });

  // Remove photo button
  document.getElementById('btn-wp-remove-photo').addEventListener('click', () => {
    formPendingPhotoBlob      = null;
    formPendingPhotoTransform = null;
    formWallpaperSelection    = 'none';
    editorState.dataUrl       = null;
    hidePhotoPreview();
    document.getElementById('input-wp-photo').value = '';
    updateThemeGridSelection();
  });

  // ── Photo editor ──

  // "Adjust position" button opens the full-screen editor
  document.getElementById('btn-wp-adjust-photo').addEventListener('click', async () => {
    // Get the data URL from whichever source has it:
    // 1. Already loaded this session (editorState.dataUrl)
    // 2. Stored in IndexedDB from a previous session (existing timer)
    // 3. A newly chosen file not yet saved (pending blob)
    let dataUrl = editorState.dataUrl;

    if (!dataUrl && editingTimerId) {
      dataUrl = await loadPhoto(editingTimerId);
    }
    if (!dataUrl && formPendingPhotoBlob) {
      dataUrl = await blobToDataUrl(formPendingPhotoBlob);
    }

    if (!dataUrl) {
      alert('No photo found. Please choose a photo first.');
      return;
    }

    editorState.dataUrl = dataUrl;
    openPhotoEditor(dataUrl, formPendingPhotoTransform);
  });

  // Done / Cancel buttons in the editor header
  document.getElementById('btn-photo-editor-done').addEventListener('click', donePhotoEditor);
  document.getElementById('btn-photo-editor-cancel').addEventListener('click', cancelPhotoEditor);

  // Pointer events on the editor viewport (handles mouse + touch)
  const editorViewport = document.getElementById('photo-editor-viewport');
  editorViewport.addEventListener('pointerdown', onEditorPointerDown);
  editorViewport.addEventListener('pointermove', onEditorPointerMove);
  editorViewport.addEventListener('pointerup',   onEditorPointerUp);
  editorViewport.addEventListener('pointercancel', onEditorPointerUp);

  // ── Messages ──
  document.getElementById('btn-add-message').addEventListener('click', addMessageToForm);

  // ── Custom milestones ──
  document.getElementById('btn-add-custom-milestone').addEventListener('click', addCustomMilestoneToForm);
  document.getElementById('input-custom-days').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addCustomMilestoneToForm(); }
  });

  // ── Milestone overlay ──
  document.getElementById('milestone-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'btn-close-milestone' || e.target.closest('#btn-close-milestone')) {
      closeMilestoneOverlay();
    }
    if (e.target === document.getElementById('milestone-overlay')) closeMilestoneOverlay();
  });

  // ── Service worker ──
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(reg  => console.log('[Milestone] SW registered:', reg.scope))
      .catch(err => console.warn('[Milestone] SW failed:', err));
  }
});
