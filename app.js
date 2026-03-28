/**
 * MILESTONE COUNTER — app.js
 *
 * New in this version:
 *  - Wallpaper support: each timer can have a full-bleed background image
 *  - Built-in CSS themes (no image files — pure gradients, no copyright issues)
 *  - User photos stored in IndexedDB (can hold binary data, unlike localStorage)
 *  - localStorage still holds all timer metadata; IndexedDB only holds image blobs
 *  - Export / Import: back up and restore timer metadata as a JSON file
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
  {
    key:   'dawn',
    label: 'Dawn',
    css:   'linear-gradient(160deg, #1a0533 0%, #3d1a6e 30%, #c2185b 65%, #ff8a65 100%)',
  },
  {
    key:   'ocean',
    label: 'Ocean',
    css:   'linear-gradient(180deg, #001e3c 0%, #0a3d62 25%, #1565c0 55%, #29b6f6 80%, #4dd0e1 100%)',
  },
  {
    key:   'sunset',
    label: 'Sunset',
    css:   'linear-gradient(170deg, #1a0533 0%, #7b1fa2 25%, #e91e63 55%, #ff6f00 80%, #ffca28 100%)',
  },
  {
    key:   'forest',
    label: 'Forest',
    css:   'linear-gradient(160deg, #0a1a0f 0%, #1b5e20 35%, #2e7d32 60%, #558b2f 80%, #8bc34a 100%)',
  },
  {
    key:   'gold',
    label: 'Gold',
    css:   'linear-gradient(165deg, #1a1200 0%, #3e2800 30%, #b8860b 60%, #ffd700 85%, #fffde7 100%)',
  },
  {
    key:   'aurora',
    label: 'Aurora',
    css:   'linear-gradient(155deg, #000814 0%, #001d3d 25%, #003566 45%, #006466 65%, #0ead69 85%, #b5ead7 100%)',
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



/* ════════════════════════════════════════════════════
   4. STATE & PERSISTENCE
   Timers (metadata) -> localStorage
   Photos (binary)   -> IndexedDB
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
  // FIX: normalise 'now' to midnight so that time-of-day does not affect
  // date arithmetic. Without this, on an exact anniversary the year
  // comparison overshoots (e.g. 2027-03-26T17:04 > 2027-03-26T00:00)
  // causing years to decrement to 0 and months/days to go negative.
  now.setHours(0, 0, 0, 0);

  const target = new Date(timer.date + 'T00:00:00');

  const fromDate = timer.mode === 'countup' ? target : now;
  const toDate   = timer.mode === 'countup' ? now    : target;

  const isExpired = toDate < fromDate;
  if (isExpired) return { years: 0, months: 0, weeks: 0, days: 0, totalDays: 0, isExpired: true };

  // -- Years --
  let years = toDate.getFullYear() - fromDate.getFullYear();
  const afterYears = new Date(fromDate);
  afterYears.setFullYear(afterYears.getFullYear() + years);
  if (afterYears > toDate) { years--; afterYears.setFullYear(afterYears.getFullYear() - 1); }

  // -- Months after years --
  let months = (toDate.getFullYear() - afterYears.getFullYear()) * 12
             + (toDate.getMonth()    - afterYears.getMonth());
  if (toDate.getDate() < afterYears.getDate()) months--;
  if (months < 0) months = 0;

  const afterMonths = new Date(afterYears);
  afterMonths.setMonth(afterMonths.getMonth() + months);

  // -- Weeks and days after months --
  const remainingMs   = toDate - afterMonths;
  const remainingDays = Math.floor(remainingMs / (1000 * 60 * 60 * 24));
  const weeks = Math.floor(remainingDays / 7);
  const days  = remainingDays % 7;

  const totalDays = Math.floor((toDate - fromDate) / (1000 * 60 * 60 * 24));

  return { years, months, weeks, days, totalDays, isExpired };
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
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
        <div class="timer-card-days">${isExpired ? '\u2014' : totalDays}</div>
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
  // Reset slider to Years (position 0) each time a timer is opened
  sliderPosition = 0;
  const sliderEl = document.getElementById('unit-slider');
  if (sliderEl) sliderEl.value = 0;

  updateDetailDisplay();
  startTicker();

  // Apply wallpaper in the background — it will appear once ready.
  applyDetailWallpaper(timer).catch(err => {
    console.warn('[Milestone] Wallpaper apply failed:', err);
  });
}

/**
 * The slider position controls which unit is the largest displayed.
 * 0 = Years, 1 = Months, 2 = Weeks, 3 = Days
 * At position N, units 0..N-1 are shown as 0, unit N onwards are computed normally.
 */
let sliderPosition = 0; // default: show years as largest unit

/**
 * Compute display values based on slider position.
 * At position 0 (Years): show years, months, weeks, days normally.
 * At position 1 (Months): collapse years to 0, recalculate months from full span.
 * At position 2 (Weeks): collapse years+months to 0, recalculate weeks from full span.
 * At position 3 (Days): collapse all to 0 except days (totalDays).
 *
 * @param {{ years, months, weeks, days, totalDays, isExpired }} vals
 * @returns {{ dispYears, dispMonths, dispWeeks, dispDays }}
 */
function applySlider(vals) {
  const { years, months, weeks, days, totalDays, isExpired } = vals;
  if (isExpired) return { dispYears: 0, dispMonths: 0, dispWeeks: 0, dispDays: 0 };

  if (sliderPosition === 0) {
    // Normal: years is the largest unit
    return { dispYears: years, dispMonths: months, dispWeeks: weeks, dispDays: days };

  } else if (sliderPosition === 1) {
    // Months is largest — convert all years into months
    // Total months elapsed, then weeks and days from remainder
    const timer = appState.timers.find(t => t.id === appState.activeTimerId);
    const now    = new Date();
    now.setHours(0, 0, 0, 0); // normalise to midnight, consistent with getTimerValues
    const target = new Date(timer.date + 'T00:00:00');
    const fromDate = timer.mode === 'countup' ? target : now;
    const toDate   = timer.mode === 'countup' ? now    : target;

    let totalMonths = (toDate.getFullYear() - fromDate.getFullYear()) * 12
                    + (toDate.getMonth() - fromDate.getMonth());
    if (toDate.getDate() < fromDate.getDate()) totalMonths--;
    if (totalMonths < 0) totalMonths = 0;

    const afterMonths = new Date(fromDate);
    afterMonths.setMonth(afterMonths.getMonth() + totalMonths);
    const remDays = Math.floor((toDate - afterMonths) / (1000 * 60 * 60 * 24));

    return {
      dispYears:  0,
      dispMonths: totalMonths,
      dispWeeks:  Math.floor(remDays / 7),
      dispDays:   remDays % 7,
    };

  } else if (sliderPosition === 2) {
    // Weeks is largest — express everything in weeks + remaining days
    const totalWeeks = Math.floor(totalDays / 7);
    const remDays    = totalDays % 7;
    return { dispYears: 0, dispMonths: 0, dispWeeks: totalWeeks, dispDays: remDays };

  } else {
    // Days is largest — just show total days
    return { dispYears: 0, dispMonths: 0, dispWeeks: 0, dispDays: totalDays };
  }
}

function updateDetailDisplay() {
  const timer = appState.timers.find(t => t.id === appState.activeTimerId);
  if (!timer) return;

  const vals = getTimerValues(timer);
  const { totalDays, isExpired } = vals;
  const { dispYears, dispMonths, dispWeeks, dispDays } = applySlider(vals);

  document.getElementById('disp-years').textContent  = isExpired ? '\u2014'  : String(dispYears);
  document.getElementById('disp-months').textContent = isExpired ? '--' : String(dispMonths);
  document.getElementById('disp-weeks').textContent  = isExpired ? '--' : String(dispWeeks);
  document.getElementById('disp-days').textContent   = isExpired ? '--' : String(dispDays);

  // Show active message on detail screen
  updateDetailMessage(timer, totalDays);
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

  setFormMessages(timer ? (timer.messages || []) : [], timer);
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
 * Populate the theme grid with one swatch per built-in theme (no categories).
 */
function buildThemeGrid() {
  const gridEl = document.getElementById('wp-theme-grid');
  gridEl.innerHTML = '';

  WALLPAPER_THEMES.forEach(theme => {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'wp-theme-item';
    swatch.dataset.themeKey = theme.key;
    swatch.setAttribute('aria-label', theme.label);
    swatch.style.background = theme.css;
    swatch.innerHTML = `<span class="wp-selected-tick" aria-hidden="true">\u2713</span><span class="wp-theme-label">${theme.label}</span>`;

    swatch.addEventListener('click', () => {
      formWallpaperSelection = theme.key;
      formPendingPhotoBlob   = null;
      hidePhotoPreview();
      updateThemeGridSelection();
      switchWallpaperTab('builtin');
    });

    gridEl.appendChild(swatch);
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

// -- Milestone checkbox builder --


// -- Custom milestone list --


/* ════════════════════════════════════════════════════
   MESSAGE SYSTEM FORM HELPERS

   Each timer can have multiple messages. Each message:
     text:       string  -- the message to display
     daysBefore: number  -- start showing this many days
                           before the milestone date
     milestoneKey: string -- which milestone it's tied to
                            (used to compute the target date)

   Messages are stored on the timer as:
     messages: [{ text, daysBefore, milestoneKey }]

   On the detail screen, we compute which messages are
   currently active and display the most relevant one
   (closest upcoming milestone) below the time display.
════════════════════════════════════════════════════ */

/**
 * Render the message rows in the form.
 * @param {Array} messages
 * @param {object|null} timer
 */
function renderMessageRows(messages, timer = null) {
  const container = document.getElementById('message-list');
  container.innerHTML = '';

  // Show count above the list
  const countEl = document.getElementById('message-count');
  if (countEl) countEl.textContent = `${messages.length} of 5`;

  if (messages.length === 0) {
    container.innerHTML = '<p class="custom-milestone-empty">No messages added yet</p>';
    return;
  }

  messages.forEach((msg, index) => {
    const row = document.createElement('div');
    row.className = 'message-row';

    // Build trigger label from the date
    const triggerLabel = msg.triggerDate ? `\uD83D\uDCC5 ${formatDate(msg.triggerDate)}` : 'No date set';

    row.innerHTML = `
      <div class="message-row-header">
        <span class="message-row-milestone">${triggerLabel}</span>
        <button type="button" class="custom-milestone-remove message-remove-btn" data-index="${index}" aria-label="Remove message">\u2715</button>
      </div>
      <p class="message-row-text">${escapeHtml(msg.text)}</p>
      <p class="message-row-meta">Showing from ${formatDate(msg.triggerDate)}</p>
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

/**
 * Add a new message from the form inputs.
 * Supports two trigger types:
 *   - 'milestone': tied to a preset or custom milestone threshold
 *   - 'date': tied to a specific calendar date
 */
function addMessageToForm() {
  const textEl        = document.getElementById('input-message-text');
  const triggerDateEl = document.getElementById('input-message-date');

  const text        = textEl.value.trim();
  const triggerDate = triggerDateEl ? triggerDateEl.value : '';

  if (!text)        { alert('Please enter a message.'); return; }
  if (!triggerDate) { alert('Please choose a date for this message.'); return; }

  const current = getFormMessages();
  if (current.length >= 5) { alert('Maximum of 5 messages per timer reached. Remove one to add another.'); return; }
  current.push({ text, triggerType: 'date', triggerDate });
  setFormMessages(current, formEditingTimer);

  textEl.value = '';
  if (triggerDateEl) triggerDateEl.value = '';
  textEl.focus();
}

/** Reference to the timer being edited — needed for milestone dropdown in messages. */
let formEditingTimer = null;

// -- Form read / submit / delete --

function readFormValues() {
  const name = document.getElementById('input-name').value.trim();
  const date = document.getElementById('input-date').value;
  const mode = document.querySelector('.mode-toggle-btn.active')?.dataset.mode || 'countdown';

  if (!name) { alert('Please give your timer a name.'); return null; }
  if (!date) { alert('Please choose a date.'); return null; }

  const messages = getFormMessages();
  return { name, date, mode, messages, wallpaper: formWallpaperSelection };
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
        photoTransform: values.wallpaper === 'photo' ? (formPendingPhotoTransform || existing.photoTransform || null) : null,
        messages:       values.messages,
      };
    }
    savedId = editingTimerId;
  } else {
    const newTimer = {
      id:             generateId(),
      name:           values.name,
      date:           values.date,
      mode:           values.mode,
      wallpaper:      values.wallpaper,
      photoTransform: values.wallpaper === 'photo' ? formPendingPhotoTransform : null,
      messages:       values.messages,
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
   10b. EXPORT & IMPORT

   Export: serialise the timers array to a JSON file
   and trigger a download via a temporary <a> element.
   Photos are NOT included — they live in IndexedDB
   and are intentionally excluded to keep the file small.

   Import: read a JSON file chosen by the user, validate
   it, then ask whether to replace all timers or merge.
   Merging skips any timer whose ID already exists, so
   re-importing the same backup is safe.

   The HTML you need to add (see instructions below):
     <button id="btn-export">Export</button>
     <button id="btn-import">Import</button>
     <input type="file" id="input-import-file" accept=".json" style="display:none">
════════════════════════════════════════════════════ */

/**
 * Export all timer metadata to a downloadable JSON file.
 * The file is named milestone-backup-YYYY-MM-DD.json.
 * Photos are excluded (stored separately in IndexedDB).
 */
function exportTimers() {
  if (appState.timers.length === 0) {
    alert('No timers to export.');
    return;
  }

  // Build the export payload — timer metadata only, no photo blobs.
  // If a timer used a photo wallpaper, we reset it to 'none' in the
  // export since the photo itself is not included.
  const payload = {
    exportedAt: new Date().toISOString(),
    version:    1,
    timers:     appState.timers.map(t => ({
      id:        t.id,
      name:      t.name,
      date:      t.date,
      mode:      t.mode,
      wallpaper: t.wallpaper === 'photo' ? 'none' : (t.wallpaper || 'none'),
      messages:  t.messages || [],
      // photoTransform intentionally excluded — meaningless without the photo
    })),
  };

  // Serialise to pretty-printed JSON
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);

  // Build a filename with today's date for easy identification
  const today    = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
  const filename = `milestone-backup-${today}.json`;

  // Trigger the browser download via a temporary invisible link
  const a = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  // Release the object URL to free memory
  URL.revokeObjectURL(url);
}

/**
 * Open the hidden file picker so the user can choose a backup file.
 * The actual import logic runs in handleImportFile() once a file is chosen.
 */
function importTimers() {
  document.getElementById('input-import-file').click();
}

/**
 * Handle the file chosen by the user for import.
 * Validates the JSON, then asks: replace all or merge?
 * Merge skips timers whose ID already exists — safe to re-import.
 * @param {Event} event - the change event from the file input
 */
function handleImportFile(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  // Reset the input so the same file can be chosen again if needed
  event.target.value = '';

  const reader = new FileReader();
  reader.onload = (e) => {
    let payload;

    // Attempt to parse the JSON — show a friendly error if it fails
    try {
      payload = JSON.parse(e.target.result);
    } catch {
      alert('Could not read the file. Please make sure it is a valid Milestone Counter backup.');
      return;
    }

    // Basic structure check
    if (!payload.timers || !Array.isArray(payload.timers)) {
      alert('This file does not look like a Milestone Counter backup.');
      return;
    }

    const count = payload.timers.length;
    if (count === 0) {
      alert('The backup file contains no timers.');
      return;
    }

    // Ask the user how to handle the import.
    // OK  = replace everything with the backup
    // Cancel = merge (add only timers not already present)
    const replace = confirm(
      `Found ${count} timer${count !== 1 ? 's' : ''} in the backup.\n\n` +
      `OK     = Replace all current timers with the backup.\n` +
      `Cancel = Merge — add only timers not already in your app.`
    );

    if (replace) {
      // Replace: overwrite the entire timers list
      appState.timers = payload.timers;
    } else {
      // Merge: only add timers whose ID is not already present
      const existingIds = new Set(appState.timers.map(t => t.id));
      const newTimers   = payload.timers.filter(t => !existingIds.has(t.id));

      if (newTimers.length === 0) {
        alert('All timers in the backup already exist in your app. Nothing was added.');
        return;
      }

      appState.timers = [...appState.timers, ...newTimers];
      alert(`Added ${newTimers.length} new timer${newTimers.length !== 1 ? 's' : ''}.`);
    }

    saveState();
    renderTimerList();
  };

  reader.readAsText(file);
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

  // The image is positioned at top:50% left:50% (its centre is at the viewport centre).
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

  // Maximum allowed offset: half the difference between image size and viewport size.
  // When the image is smaller than the viewport in a dimension, clamp to 0.
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

  // Draw a small (360 x aspect-correct height) canvas representing the crop
  const canvas  = document.createElement('canvas');
  const vw      = viewport.clientWidth  || 360;
  const vh      = viewport.clientHeight || 640;
  const aspect  = vw / vh;
  canvas.width  = 360;
  canvas.height = Math.round(360 / aspect);
  const ctx     = canvas.getContext('2d');

  const img = new Image();
  img.onload = () => {
    const scale   = transform.scale;
    const scaledW = img.naturalWidth  * scale;
    const scaledH = img.naturalHeight * scale;

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

/* -- Pointer event handlers (unified mouse + touch) -- */

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
    // -- Drag --
    const dx = e.clientX - editorState.lastX;
    const dy = e.clientY - editorState.lastY;

    editorState.x += dx;
    editorState.y += dy;

    editorState.lastX = e.clientX;
    editorState.lastY = e.clientY;

    constrainTransform();
    applyEditorTransform();

  } else if (pointerCount === 2) {
    // -- Pinch zoom --
    const pts = Object.values(editorState.pointers);
    const dist = pointerDistance(pts[0], pts[1]);

    if (editorState.lastPinchDist !== null) {
      const ratio = dist / editorState.lastPinchDist;
      editorState.scale = Math.max(
        editorState.minScale,
        Math.min(editorState.scale * ratio, editorState.minScale * 8) // max 8x zoom
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
 * Compute which message (if any) should be active right now.
 * Returns the message tied to the most recently passed trigger date.
 *
 * @param {object} timer
 * @param {number} totalDays - elapsed (countup) or remaining (countdown)
 * @returns {{ text, daysUntil, triggerLabel }|null}
 */
function getActiveMessage(timer, totalDays) {
  const messages = timer.messages || [];
  if (messages.length === 0) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let best          = null;
  let bestDaysUntil = Infinity;

  for (const msg of messages) {
    if (!msg.text) continue;

    let daysUntil;
    let triggerLabel;

    if (msg.triggerType === 'date' && msg.triggerDate) {
      // daysUntil = days from today until the trigger date
      // Negative means the date has already passed
      const triggerDay = new Date(msg.triggerDate + 'T00:00:00');
      daysUntil    = Math.round((triggerDay - today) / (1000 * 60 * 60 * 24));
      triggerLabel = `\uD83D\uDCC5 ${formatDate(msg.triggerDate)}`;
    } else {
      continue; // date trigger required
    }

    // Show the message on or after the trigger date (daysUntil <= 0)
    const inWindow = daysUntil <= 0;

    if (inWindow && daysUntil < bestDaysUntil) {
      bestDaysUntil = daysUntil;
      best = { text: msg.text, daysUntil, triggerLabel };
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
      : `Since ${active.triggerLabel}`;

    el.innerHTML = `<span class="detail-message-text">${escapeHtml(active.text)}</span><span class="detail-message-when">${dayStr} \u2013 ${active.triggerLabel}</span>`;
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

  // -- List --
  document.getElementById('btn-new-timer').addEventListener('click', () => openFormScreen(null));
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

  // -- Export / Import --
  // These three elements must exist in your HTML (see note at bottom of this file).
  document.getElementById('btn-export').addEventListener('click', exportTimers);
  document.getElementById('btn-import').addEventListener('click', importTimers);
  document.getElementById('input-import-file').addEventListener('change', handleImportFile);

  // -- Detail --
  document.getElementById('btn-back').addEventListener('click', () => {
    stopTicker();
    renderTimerList();
    showScreen('list');
  });
  document.getElementById('btn-edit-timer').addEventListener('click', () => {
    if (appState.activeTimerId) openFormScreen(appState.activeTimerId);
  });

  // -- Form --
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

  // -- Wallpaper picker tabs --
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

  // -- Photo file input --
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

  // -- Photo editor --

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

  // -- Unit slider --
  document.getElementById('unit-slider').addEventListener('input', (e) => {
    sliderPosition = parseInt(e.target.value, 10);
    updateDetailDisplay();
  });

  // -- Messages --
  document.getElementById('btn-add-message').addEventListener('click', addMessageToForm);

  // -- Custom milestones --
  document.getElementById('btn-add-custom-milestone').addEventListener('click', addCustomMilestoneToForm);
  document.getElementById('input-custom-days').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addCustomMilestoneToForm(); }
  });

  // -- Milestone overlay --
  document.getElementById('milestone-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'btn-close-milestone' || e.target.closest('#btn-close-milestone')) {
      closeMilestoneOverlay();
    }
    if (e.target === document.getElementById('milestone-overlay')) closeMilestoneOverlay();
  });

  // -- Service worker --
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(reg  => console.log('[Milestone] SW registered:', reg.scope))
      .catch(err => console.warn('[Milestone] SW failed:', err));
  }
});

/*
  ════════════════════════════════════════════════════
  HTML CHANGES REQUIRED

  Add these three elements somewhere on your list
  screen (screen-list), e.g. near the "New Timer"
  button in the header or footer area:

    <button id="btn-export">Export</button>
    <button id="btn-import">Import</button>
    <input type="file" id="input-import-file" accept=".json" style="display:none">

  The file input is invisible — it is triggered
  programmatically when the Import button is tapped.
  ════════════════════════════════════════════════════
*/
