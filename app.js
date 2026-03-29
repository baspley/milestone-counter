/**
 * MILESTONE COUNTER — app.js
 *
 * Changes in this version:
 *  - Large centred timer name displayed below the countdown digits
 *  - Export now uses the iOS native share sheet (navigator.share with a File
 *    object) so it works correctly in Safari on iPhone. The <a download> trick
 *    does not work in Safari/iOS PWAs. Falls back to clipboard on desktop.
 *  - Share timer function unchanged
 */

'use strict';


/* ════════════════════════════════════════════════════
   1. BUILT-IN WALLPAPER THEMES
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

function getThemeByKey(key) {
  return WALLPAPER_THEMES.find(t => t.key === key);
}

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
════════════════════════════════════════════════════ */

const IDB_NAME    = 'milestone_photos';
const IDB_VERSION = 1;
const IDB_STORE   = 'photos';

let idb = null;

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (idb) { resolve(idb); return; }

    const request = indexedDB.open(IDB_NAME, IDB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };

    request.onsuccess = (event) => { idb = event.target.result; resolve(idb); };
    request.onerror   = (event) => { console.warn('[Milestone] IndexedDB open failed:', event.target.error); reject(event.target.error); };
  });
}

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

async function loadPhoto(timerId) {
  try {
    const db   = await openDatabase();
    const blob = await new Promise((resolve, reject) => {
      const tx      = db.transaction(IDB_STORE, 'readonly');
      const store   = tx.objectStore(IDB_STORE);
      const request = store.get(timerId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror   = (e) => reject(e.target.error);
    });

    if (!blob) return null;

    return new Promise((resolve, reject) => {
      const reader   = new FileReader();
      reader.onload  = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.warn('[Milestone] Could not load photo:', e);
    return null;
  }
}

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
════════════════════════════════════════════════════ */

const STORAGE_KEY = 'milestoneCounter_v1';

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
  const now = new Date();
  // Normalise to midnight so time-of-day never affects date arithmetic.
  // Without this, on an exact anniversary the comparison overshoots,
  // causing years to roll back to 0 and months/days to go negative.
  now.setHours(0, 0, 0, 0);

  const target   = new Date(timer.date + 'T00:00:00');
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
  const remainingDays = Math.floor((toDate - afterMonths) / (1000 * 60 * 60 * 24));
  const weeks         = Math.floor(remainingDays / 7);
  const days          = remainingDays % 7;
  const totalDays     = Math.floor((toDate - fromDate) / (1000 * 60 * 60 * 24));

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
  if (tickerHandle !== null) { clearInterval(tickerHandle); tickerHandle = null; }
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

async function applyTransformToCanvas(dataUrl, transform) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      const canvas  = document.createElement('canvas');
      canvas.width  = vw;
      canvas.height = vh;
      const ctx     = canvas.getContext('2d');

      const scaledW    = img.naturalWidth  * transform.scale;
      const scaledH    = img.naturalHeight * transform.scale;
      const imgCentreX = vw / 2 + transform.x;
      const imgCentreY = vh / 2 + transform.y;

      ctx.drawImage(img, imgCentreX - scaledW / 2, imgCentreY - scaledH / 2, scaledW, scaledH);
      resolve(canvas.toDataURL('image/jpeg', 0.92));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

async function applyDetailWallpaper(timer) {
  const wallpaperEl = document.getElementById('detail-wallpaper');
  const screenEl    = document.getElementById('screen-detail');

  if (!timer.wallpaper || timer.wallpaper === 'none') {
    wallpaperEl.style.background = '';
    screenEl.classList.add('no-wallpaper');
    return;
  }

  let css = null;

  if (timer.wallpaper === 'photo') {
    const dataUrl = await loadPhoto(timer.id);
    if (dataUrl) {
      if (timer.photoTransform) {
        const croppedUrl = await applyTransformToCanvas(dataUrl, timer.photoTransform);
        css = `url('${croppedUrl}') center / cover no-repeat`;
      } else {
        css = `url('${dataUrl}') center / cover no-repeat`;
      }
    }
  } else {
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

  // Populate both the small header name and the large name below the countdown
  document.getElementById('detail-timer-name').textContent       = timer.name;
  document.getElementById('detail-timer-name-large').textContent = timer.name;

  document.getElementById('detail-mode-label').textContent =
    timer.mode === 'countdown' ? 'Counting down to' : 'Counting up from';
  document.getElementById('detail-target-date').textContent = formatDate(timer.date);

  sliderPosition = 0;
  const sliderEl = document.getElementById('unit-slider');
  if (sliderEl) sliderEl.value = 0;

  updateDetailDisplay();
  startTicker();

  applyDetailWallpaper(timer).catch(err => {
    console.warn('[Milestone] Wallpaper apply failed:', err);
  });
}

/**
 * Slider position: 0=Years, 1=Months, 2=Weeks, 3=Days.
 * Units to the left of the chosen position display as 0.
 */
let sliderPosition = 0;

function applySlider(vals) {
  const { years, months, weeks, days, totalDays, isExpired } = vals;
  if (isExpired) return { dispYears: 0, dispMonths: 0, dispWeeks: 0, dispDays: 0 };

  if (sliderPosition === 0) {
    return { dispYears: years, dispMonths: months, dispWeeks: weeks, dispDays: days };

  } else if (sliderPosition === 1) {
    // Months is largest — roll all years into months
    const timer    = appState.timers.find(t => t.id === appState.activeTimerId);
    const now      = new Date();
    now.setHours(0, 0, 0, 0);
    const target   = new Date(timer.date + 'T00:00:00');
    const fromDate = timer.mode === 'countup' ? target : now;
    const toDate   = timer.mode === 'countup' ? now    : target;

    let totalMonths = (toDate.getFullYear() - fromDate.getFullYear()) * 12
                    + (toDate.getMonth() - fromDate.getMonth());
    if (toDate.getDate() < fromDate.getDate()) totalMonths--;
    if (totalMonths < 0) totalMonths = 0;

    const afterMonths = new Date(fromDate);
    afterMonths.setMonth(afterMonths.getMonth() + totalMonths);
    const remDays = Math.floor((toDate - afterMonths) / (1000 * 60 * 60 * 24));

    return { dispYears: 0, dispMonths: totalMonths, dispWeeks: Math.floor(remDays / 7), dispDays: remDays % 7 };

  } else if (sliderPosition === 2) {
    return { dispYears: 0, dispMonths: 0, dispWeeks: Math.floor(totalDays / 7), dispDays: totalDays % 7 };

  } else {
    return { dispYears: 0, dispMonths: 0, dispWeeks: 0, dispDays: totalDays };
  }
}

function updateDetailDisplay() {
  const timer = appState.timers.find(t => t.id === appState.activeTimerId);
  if (!timer) return;

  const vals = getTimerValues(timer);
  const { totalDays, isExpired } = vals;
  const { dispYears, dispMonths, dispWeeks, dispDays } = applySlider(vals);

  document.getElementById('disp-years').textContent  = isExpired ? '\u2014' : String(dispYears);
  document.getElementById('disp-months').textContent = isExpired ? '--'     : String(dispMonths);
  document.getElementById('disp-weeks').textContent  = isExpired ? '--'     : String(dispWeeks);
  document.getElementById('disp-days').textContent   = isExpired ? '--'     : String(dispDays);

  updateDetailMessage(timer, totalDays);
}


/* ════════════════════════════════════════════════════
   9b. SHARE TIMER

   Uses the Web Share API (navigator.share).
   On iOS this opens the native share sheet — Messages,
   Mail, AirDrop, WhatsApp, etc.
   Falls back to clipboard copy on desktop browsers.
════════════════════════════════════════════════════ */

/**
 * Build a readable time string, e.g. "1 year, 2 months and 3 days".
 * Omits any unit that is zero.
 * @param {{ years, months, weeks, days }} vals
 * @returns {string}
 */
function buildTimeString(vals) {
  const { years, months, weeks, days } = vals;
  const parts = [];
  if (years  > 0) parts.push(`${years} year${years   !== 1 ? 's' : ''}`);
  if (months > 0) parts.push(`${months} month${months !== 1 ? 's' : ''}`);
  if (weeks  > 0) parts.push(`${weeks} week${weeks   !== 1 ? 's' : ''}`);
  if (days   > 0) parts.push(`${days} day${days     !== 1 ? 's' : ''}`);

  if (parts.length === 0) return 'today';
  if (parts.length === 1) return parts[0];
  return parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
}

/**
 * Share the currently viewed timer via the native share sheet.
 * Falls back to clipboard copy if the Web Share API is unavailable.
 */
function shareTimer() {
  const timer = appState.timers.find(t => t.id === appState.activeTimerId);
  if (!timer) return;

  const vals      = getTimerValues(timer);
  const dateStr   = formatDate(timer.date);
  const modeLabel = timer.mode === 'countdown' ? 'Counting down to' : 'Counting up from';
  const suffix    = timer.mode === 'countdown' ? ' to go' : ' so far';

  let bodyText;
  if (vals.isExpired) {
    bodyText = `${timer.name}\n${modeLabel} ${dateStr}\nThis date has now passed.`;
  } else {
    bodyText = `${timer.name}\n${modeLabel} ${dateStr}\n${buildTimeString(vals)}${suffix}`;
  }

  if (navigator.share) {
    navigator.share({ title: timer.name, text: bodyText }).catch(err => {
      if (err.name !== 'AbortError') console.warn('[Milestone] Share failed:', err);
    });
  } else {
    navigator.clipboard.writeText(bodyText).then(() => {
      alert('Timer details copied to clipboard.');
    }).catch(() => {
      alert(bodyText);
    });
  }
}


/* ════════════════════════════════════════════════════
   10. RENDERING — Form Screen
════════════════════════════════════════════════════ */

let editingTimerId        = null;
let formWallpaperSelection = 'none';
let formPendingPhotoBlob   = null;
let formPendingPhotoTransform = null;

function openFormScreen(timerId = null) {
  editingTimerId   = timerId;
  formEditingTimer = null;
  const isEditing  = timerId !== null;
  const timer      = isEditing ? appState.timers.find(t => t.id === timerId) : null;
  formEditingTimer = timer;

  document.getElementById('form-screen-title').textContent = isEditing ? 'Edit Timer' : 'New Timer';
  document.getElementById('input-name').value = timer ? timer.name : '';
  document.getElementById('input-date').value = timer ? timer.date : '';

  const currentMode = timer ? timer.mode : 'countdown';
  document.querySelectorAll('.mode-toggle-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === currentMode);
  });

  setFormMessages(timer ? (timer.messages || []) : [], timer);
  document.getElementById('btn-form-delete').classList.toggle('hidden', !isEditing);

  formWallpaperSelection    = timer ? (timer.wallpaper || 'none') : 'none';
  formPendingPhotoBlob      = null;
  formPendingPhotoTransform = timer ? (timer.photoTransform || null) : null;

  buildWallpaperPicker(timer);
  showScreen('form');
}

async function buildWallpaperPicker(timer) {
  buildThemeGrid();

  if (timer && timer.wallpaper === 'photo') {
    const dataUrl = await loadPhoto(timer.id);
    if (dataUrl) {
      editorState.dataUrl = dataUrl;
      showPhotoPreview(dataUrl, timer.photoTransform || null);
    } else {
      hidePhotoPreview();
    }
  } else {
    editorState.dataUrl = null;
    hidePhotoPreview();
  }

  updateThemeGridSelection();
}

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

function updateThemeGridSelection() {
  document.querySelectorAll('.wp-theme-item').forEach(el => {
    el.classList.toggle('selected', el.dataset.themeKey === formWallpaperSelection);
  });
}

function switchWallpaperTab(tabName) {
  document.querySelectorAll('.wp-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
    btn.setAttribute('aria-selected', btn.dataset.tab === tabName ? 'true' : 'false');
  });
  document.getElementById('wp-panel-builtin').classList.toggle('hidden', tabName !== 'builtin');
  document.getElementById('wp-panel-photo').classList.toggle('hidden', tabName !== 'photo');
}

function showPhotoPreview(dataUrl, transform = null) {
  document.getElementById('wp-photo-preview').classList.remove('hidden');
  document.getElementById('wp-upload-label').classList.add('hidden');

  if (transform) {
    updatePhotoPreviewThumbnail(dataUrl, transform);
  } else {
    document.getElementById('wp-preview-img').src = dataUrl;
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
════════════════════════════════════════════════════ */

function renderMessageRows(messages, timer = null) {
  const container = document.getElementById('message-list');
  container.innerHTML = '';

  const countEl = document.getElementById('message-count');
  if (countEl) countEl.textContent = `${messages.length} of 5`;

  if (messages.length === 0) {
    container.innerHTML = '<p class="custom-milestone-empty">No messages added yet</p>';
    return;
  }

  messages.forEach((msg, index) => {
    const row = document.createElement('div');
    row.className = 'message-row';

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

function getFormMessages() {
  const raw = document.getElementById('message-list').dataset.messages;
  return raw ? JSON.parse(raw) : [];
}

function setFormMessages(messages, timer = null) {
  document.getElementById('message-list').dataset.messages = JSON.stringify(messages);
  renderMessageRows(messages, timer);
}

function addMessageToForm() {
  const textEl        = document.getElementById('input-message-text');
  const triggerDateEl = document.getElementById('input-message-date');
  const text          = textEl.value.trim();
  const triggerDate   = triggerDateEl ? triggerDateEl.value : '';

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

let formEditingTimer = null;

function readFormValues() {
  const name = document.getElementById('input-name').value.trim();
  const date = document.getElementById('input-date').value;
  const mode = document.querySelector('.mode-toggle-btn.active')?.dataset.mode || 'countdown';

  if (!name) { alert('Please give your timer a name.'); return null; }
  if (!date) { alert('Please choose a date.'); return null; }

  return { name, date, mode, messages: getFormMessages(), wallpaper: formWallpaperSelection };
}

async function handleFormSubmit(event) {
  event.preventDefault();
  const values = readFormValues();
  if (!values) return;

  let savedId;

  if (editingTimerId) {
    const index = appState.timers.findIndex(t => t.id === editingTimerId);
    if (index !== -1) {
      const existing = appState.timers[index];
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

  if (formPendingPhotoBlob && values.wallpaper === 'photo') await savePhoto(savedId, formPendingPhotoBlob);
  if (values.wallpaper !== 'photo') await deletePhoto(savedId);

  saveState();
  renderTimerList();
  openDetailScreen(savedId);
}

async function deleteTimer() {
  if (!editingTimerId) return;
  if (!confirm('Delete this timer? This cannot be undone.')) return;

  await deletePhoto(editingTimerId);
  appState.timers = appState.timers.filter(t => t.id !== editingTimerId);
  if (appState.activeTimerId === editingTimerId) appState.activeTimerId = null;

  saveState();
  renderTimerList();
  showScreen('list');
}


/* ════════════════════════════════════════════════════
   10b. EXPORT & IMPORT

   WHY THE OLD EXPORT BROKE ON iOS:
   The previous version used <a href="..." download> to
   trigger a file download. This works on desktop browsers
   but Safari on iOS simply ignores the download attribute
   — it either opens the file in the browser or does nothing.

   FIX: Use navigator.share() with a File object instead.
   iOS 15+ supports sharing files this way, which opens the
   native share sheet. The user can then tap "Save to Files"
   to store the backup in iCloud Drive or on-device.

   For desktop browsers that do not support navigator.share,
   we fall back to the old <a download> method, which works
   fine on Mac/Windows/Linux browsers.
════════════════════════════════════════════════════ */

/**
 * Export all timer metadata to a JSON backup file.
 *
 * On iOS: opens the native share sheet via navigator.share(),
 * where the user can tap "Save to Files" to keep the backup.
 *
 * On desktop: triggers a direct file download via <a download>.
 *
 * Photos are excluded — they live in IndexedDB and would make
 * the file very large. A timer that had a photo wallpaper will
 * have its wallpaper reset to 'none' in the export.
 */
async function exportTimers() {
  if (appState.timers.length === 0) {
    alert('No timers to export.');
    return;
  }

  // Build the export payload — metadata only, no photo blobs
  const payload = {
    exportedAt: new Date().toISOString(),
    version:    1,
    timers:     appState.timers.map(t => ({
      id:        t.id,
      name:      t.name,
      date:      t.date,
      mode:      t.mode,
      // Reset photo wallpapers to 'none' since the photo is not included
      wallpaper: t.wallpaper === 'photo' ? 'none' : (t.wallpaper || 'none'),
      messages:  t.messages || [],
    })),
  };

  const json     = JSON.stringify(payload, null, 2);
  const today    = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
  const filename = `milestone-backup-${today}.json`;

  // Try the Web Share API first (works on iOS Safari and modern Android)
  if (navigator.canShare) {
    const file = new File([json], filename, { type: 'application/json' });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Milestone Backup' });
        return; // Done — share sheet handled it
      } catch (err) {
        if (err.name === 'AbortError') return; // User cancelled — do nothing
        console.warn('[Milestone] Share-based export failed, trying download:', err);
        // Fall through to the download fallback below
      }
    }
  }

  // Desktop fallback: trigger a file download via a temporary link
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Open the hidden file picker so the user can choose a backup JSON file.
 */
function importTimers() {
  document.getElementById('input-import-file').click();
}

/**
 * Handle the backup file chosen for import.
 * Validates the JSON then asks: replace all timers or merge?
 * Merge skips any timer whose ID already exists — safe to re-import.
 * @param {Event} event
 */
function handleImportFile(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  event.target.value = ''; // reset so the same file can be re-chosen

  const reader = new FileReader();
  reader.onload = (e) => {
    let payload;

    try {
      payload = JSON.parse(e.target.result);
    } catch {
      alert('Could not read the file. Please make sure it is a valid Milestone Counter backup.');
      return;
    }

    if (!payload.timers || !Array.isArray(payload.timers)) {
      alert('This file does not look like a Milestone Counter backup.');
      return;
    }

    const count = payload.timers.length;
    if (count === 0) { alert('The backup file contains no timers.'); return; }

    // OK = replace all, Cancel = merge
    const replace = confirm(
      `Found ${count} timer${count !== 1 ? 's' : ''} in the backup.\n\n` +
      `OK     = Replace all current timers with the backup.\n` +
      `Cancel = Merge — add only timers not already in your app.`
    );

    if (replace) {
      appState.timers = payload.timers;
    } else {
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
════════════════════════════════════════════════════ */

let editorState = {
  dataUrl:       null,
  x:             0,
  y:             0,
  scale:         1.0,
  minScale:      1.0,
  isDragging:    false,
  lastX:         0,
  lastY:         0,
  pointers:      {},
  lastPinchDist: null,
};

function openPhotoEditor(dataUrl, savedTransform) {
  const overlay = document.getElementById('photo-editor-overlay');
  const imgEl   = document.getElementById('photo-editor-img');

  editorState.dataUrl       = dataUrl;
  editorState.x             = savedTransform ? savedTransform.x     : 0;
  editorState.y             = savedTransform ? savedTransform.y     : 0;
  editorState.scale         = savedTransform ? savedTransform.scale : 1.0;
  editorState.isDragging    = false;
  editorState.pointers      = {};
  editorState.lastPinchDist = null;

  imgEl.src = dataUrl;
  imgEl.onload = () => {
    computeMinScale();
    if (!savedTransform) {
      editorState.scale = editorState.minScale;
      editorState.x = 0;
      editorState.y = 0;
    } else {
      editorState.scale = Math.max(editorState.scale, editorState.minScale);
    }
    applyEditorTransform();
  };

  overlay.classList.remove('hidden');
}

function computeMinScale() {
  const viewport = document.getElementById('photo-editor-viewport');
  const imgEl    = document.getElementById('photo-editor-img');
  const vw = viewport.clientWidth;
  const vh = viewport.clientHeight;
  const iw = imgEl.naturalWidth;
  const ih = imgEl.naturalHeight;
  if (!iw || !ih) return;
  editorState.minScale = Math.max(vw / iw, vh / ih);
}

function applyEditorTransform() {
  const imgEl = document.getElementById('photo-editor-img');
  const { x, y, scale } = editorState;
  imgEl.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(${scale})`;
}

function constrainTransform() {
  const viewport = document.getElementById('photo-editor-viewport');
  const imgEl    = document.getElementById('photo-editor-img');
  const vw = viewport.clientWidth;
  const vh = viewport.clientHeight;
  const iw = imgEl.naturalWidth  * editorState.scale;
  const ih = imgEl.naturalHeight * editorState.scale;
  const maxX = Math.max(0, (iw - vw) / 2);
  const maxY = Math.max(0, (ih - vh) / 2);
  editorState.x = Math.max(-maxX, Math.min(maxX, editorState.x));
  editorState.y = Math.max(-maxY, Math.min(maxY, editorState.y));
}

function donePhotoEditor() {
  const transform = { x: editorState.x, y: editorState.y, scale: editorState.scale };
  formPendingPhotoTransform = transform;
  updatePhotoPreviewThumbnail(editorState.dataUrl, transform);
  document.getElementById('photo-editor-overlay').classList.add('hidden');
}

function cancelPhotoEditor() {
  document.getElementById('photo-editor-overlay').classList.add('hidden');
}

function updatePhotoPreviewThumbnail(dataUrl, transform) {
  const previewImg = document.getElementById('wp-preview-img');
  const viewport   = document.getElementById('photo-editor-viewport');

  const canvas  = document.createElement('canvas');
  const vw      = viewport.clientWidth  || 360;
  const vh      = viewport.clientHeight || 640;
  canvas.width  = 360;
  canvas.height = Math.round(360 / (vw / vh));
  const ctx     = canvas.getContext('2d');

  const img = new Image();
  img.onload = () => {
    const scaledW    = img.naturalWidth  * transform.scale;
    const scaledH    = img.naturalHeight * transform.scale;
    const imgCentreX = vw / 2 + transform.x;
    const imgCentreY = vh / 2 + transform.y;
    const imgLeft    = imgCentreX - scaledW / 2;
    const imgTop     = imgCentreY - scaledH / 2;
    ctx.drawImage(img, imgLeft * (canvas.width / vw), imgTop * (canvas.height / vh), scaledW * (canvas.width / vw), scaledH * (canvas.height / vh));
    previewImg.src = canvas.toDataURL('image/jpeg', 0.85);
  };
  img.src = dataUrl;
}

function pointerDistance(p1, p2) {
  return Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
}

function onEditorPointerDown(e) {
  e.preventDefault();
  document.getElementById('photo-editor-viewport').setPointerCapture(e.pointerId);
  editorState.pointers[e.pointerId] = { x: e.clientX, y: e.clientY };

  const count = Object.keys(editorState.pointers).length;
  if (count === 1) {
    editorState.isDragging    = true;
    editorState.lastX         = e.clientX;
    editorState.lastY         = e.clientY;
    editorState.lastPinchDist = null;
  } else if (count === 2) {
    editorState.isDragging    = false;
    editorState.lastPinchDist = pointerDistance(...Object.values(editorState.pointers));
  }
}

function onEditorPointerMove(e) {
  e.preventDefault();
  editorState.pointers[e.pointerId] = { x: e.clientX, y: e.clientY };

  const count = Object.keys(editorState.pointers).length;

  if (count === 1 && editorState.isDragging) {
    editorState.x    += e.clientX - editorState.lastX;
    editorState.y    += e.clientY - editorState.lastY;
    editorState.lastX = e.clientX;
    editorState.lastY = e.clientY;
    constrainTransform();
    applyEditorTransform();

  } else if (count === 2) {
    const dist = pointerDistance(...Object.values(editorState.pointers));
    if (editorState.lastPinchDist !== null) {
      editorState.scale = Math.max(
        editorState.minScale,
        Math.min(editorState.scale * (dist / editorState.lastPinchDist), editorState.minScale * 8)
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
    const remaining       = Object.values(editorState.pointers)[0];
    editorState.isDragging    = true;
    editorState.lastX         = remaining.x;
    editorState.lastY         = remaining.y;
    editorState.lastPinchDist = null;
  }
}


/* ════════════════════════════════════════════════════
   11b. DETAIL SCREEN MESSAGE DISPLAY
════════════════════════════════════════════════════ */

function getActiveMessage(timer, totalDays) {
  const messages = timer.messages || [];
  if (messages.length === 0) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let best          = null;
  let bestDaysUntil = Infinity;

  for (const msg of messages) {
    if (!msg.text || msg.triggerType !== 'date' || !msg.triggerDate) continue;

    const triggerDay   = new Date(msg.triggerDate + 'T00:00:00');
    const daysUntil    = Math.round((triggerDay - today) / (1000 * 60 * 60 * 24));
    const triggerLabel = `\uD83D\uDCC5 ${formatDate(msg.triggerDate)}`;

    if (daysUntil <= 0 && daysUntil < bestDaysUntil) {
      bestDaysUntil = daysUntil;
      best = { text: msg.text, daysUntil, triggerLabel };
    }
  }

  return best;
}

function updateDetailMessage(timer, totalDays) {
  const el = document.getElementById('detail-message');
  if (!el) return;

  const active = getActiveMessage(timer, totalDays);

  if (active) {
    const dayStr = active.daysUntil === 0 ? 'Today' : `Since ${active.triggerLabel}`;
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

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader   = new FileReader();
    reader.onload  = () => resolve(reader.result);
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

  // -- Share --
  document.getElementById('btn-share-timer').addEventListener('click', shareTimer);

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
    formPendingPhotoTransform = null;
    formWallpaperSelection    = 'photo';
    updateThemeGridSelection();

    const reader = new FileReader();
    reader.onload = (ev) => {
      editorState.dataUrl = ev.target.result;
      showPhotoPreview(ev.target.result, null);
    };
    reader.readAsDataURL(file);
  });

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
  document.getElementById('btn-wp-adjust-photo').addEventListener('click', async () => {
    let dataUrl = editorState.dataUrl;
    if (!dataUrl && editingTimerId)    dataUrl = await loadPhoto(editingTimerId);
    if (!dataUrl && formPendingPhotoBlob) dataUrl = await blobToDataUrl(formPendingPhotoBlob);

    if (!dataUrl) { alert('No photo found. Please choose a photo first.'); return; }

    editorState.dataUrl = dataUrl;
    openPhotoEditor(dataUrl, formPendingPhotoTransform);
  });

  document.getElementById('btn-photo-editor-done').addEventListener('click', donePhotoEditor);
  document.getElementById('btn-photo-editor-cancel').addEventListener('click', cancelPhotoEditor);

  const editorViewport = document.getElementById('photo-editor-viewport');
  editorViewport.addEventListener('pointerdown',   onEditorPointerDown);
  editorViewport.addEventListener('pointermove',   onEditorPointerMove);
  editorViewport.addEventListener('pointerup',     onEditorPointerUp);
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
    if (e.target.id === 'btn-close-milestone' || e.target.closest('#btn-close-milestone')) closeMilestoneOverlay();
    if (e.target === document.getElementById('milestone-overlay')) closeMilestoneOverlay();
  });

  // -- Service worker --
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(reg  => console.log('[Milestone] SW registered:', reg.scope))
      .catch(err => console.warn('[Milestone] SW failed:', err));
  }
});
