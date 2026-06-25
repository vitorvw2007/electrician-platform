/**
 * MAIN APPLICATION
 * Handles UI, data management, CSV import/export, and page navigation
 */


// ============ STATE MANAGEMENT ============
let appState = {
  requests: [],
  settings: {
    businessName: 'Your Electric Company',
    baseAddress: '',
    baseCoordinates: null,
    businessHours: '8:00 AM - 5:00 PM',
    businessStartHour: 8,
    businessEndHour: 17,
    dailyCapHours: 8.5,
    lunchEnabled: false,
    lunchStart: '12:00',
    lunchEnd: '13:00',
    groqApiKey: '',
    sortBy: 'date-asc'
  },
  calendar: [],
  currentScreen: 'overview'
};


// Spacing and travel constants (buffer and lunch are excluded from the daily cap)
const BUFFER_MINUTES = 15;
const SCHEDULE_HORIZON_DAYS = 14;
const SLOT_GRANULARITY_MINUTES = 15;
const PLACEHOLDER_WINDOW_HOURS = 1;


// Monotonic counter so request ids stay unique even across appends in the same
// millisecond. Combined with the timestamp, ids never collide within or across imports.
let _idCounter = 0;
function makeRequestId() {
  return `req_${Date.now()}_${_idCounter++}`;
}


// ============ INITIALIZATION ============
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  loadData();
  initializeEventListeners();
  updateUI();
});


// Tracks the open detail page so Back and settings re-render can return correctly.
let currentDetailId = null;
let detailOriginScreen = 'overview';
// The job currently being scheduled in the schedule modal.
let schedulingJobId = null;


function initializeEventListeners() {
  document.getElementById('baseChip').addEventListener('click', () => openModal('settingsModal'));
  document.getElementById('baseChip').addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openModal('settingsModal');
    }
  });
  document.getElementById('exportBtn').addEventListener('click', exportData);
  document.getElementById('navRequests').addEventListener('click', () => goToScreen('overview'));
  document.getElementById('navScheduled').addEventListener('click', () => goToScreen('scheduled'));
  document.getElementById('navSettings').addEventListener('click', () => openModal('settingsModal'));
  document.getElementById('schedSuggestBtn').addEventListener('click', applySuggestedWindow);

  // Sort control on the Requests board
  const sortSelect = document.getElementById('sortSelect');
  sortSelect.value = appState.settings.sortBy;
  sortSelect.addEventListener('change', () => {
    appState.settings.sortBy = sortSelect.value;
    localStorage.setItem('electrician_settings', JSON.stringify(appState.settings));
    renderRows(currentList());
  });

  // "Add Requests" dropdown menu
  document.getElementById('addRequestsBtn').addEventListener('click', toggleAddRequestsMenu);
  document.getElementById('menuImportCsv').addEventListener('click', () => {
    closeAddRequestsMenu();
    openModal('importModal');
  });
  document.getElementById('menuClearRequests').addEventListener('click', () => {
    closeAddRequestsMenu();
    clearRequests();
  });
  document.getElementById('menuConnectForm').addEventListener('click', () => {
    closeAddRequestsMenu();
    connectToForm();
  });
  // Same menu inside the empty state (no Clear option, since there is nothing to clear).
  document.getElementById('addRequestsBtnEmpty').addEventListener('click', toggleAddRequestsMenuEmpty);
  document.getElementById('menuImportCsvEmpty').addEventListener('click', () => {
    closeAddRequestsMenu();
    openModal('importModal');
  });
  document.getElementById('menuConnectFormEmpty').addEventListener('click', () => {
    closeAddRequestsMenu();
    connectToForm();
  });
  // Close any open menu on outside click or Escape.
  document.addEventListener('click', e => {
    const inside = ADD_MENUS.some(m => {
      const wrap = document.getElementById(m.wrap);
      return wrap && wrap.contains(e.target);
    });
    if (!inside) closeAddRequestsMenu();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeAddRequestsMenu();
  });
}


// ============ ADD REQUESTS MENU ============
// Two instances: the top-bar menu and the one inside the empty state.
const ADD_MENUS = [
  { wrap: 'addRequestsWrap', btn: 'addRequestsBtn', menu: 'addRequestsMenu' },
  { wrap: 'addRequestsWrapEmpty', btn: 'addRequestsBtnEmpty', menu: 'addRequestsMenuEmpty' }
];


function toggleAddRequestsMenu(e) { toggleMenu('addRequestsMenu', 'addRequestsBtn', e); }
function toggleAddRequestsMenuEmpty(e) { toggleMenu('addRequestsMenuEmpty', 'addRequestsBtnEmpty', e); }


function toggleMenu(menuId, btnId, e) {
  if (e) e.stopPropagation();
  const willOpen = document.getElementById(menuId).hidden;
  closeAddRequestsMenu();
  if (willOpen) {
    document.getElementById(menuId).hidden = false;
    document.getElementById(btnId).setAttribute('aria-expanded', 'true');
  }
}


// Close every Add Requests menu (top bar and empty state).
function closeAddRequestsMenu() {
  ADD_MENUS.forEach(m => {
    const menu = document.getElementById(m.menu);
    if (menu && !menu.hidden) menu.hidden = true;
    const btn = document.getElementById(m.btn);
    if (btn) btn.setAttribute('aria-expanded', 'false');
  });
}


// Clear unscheduled requests only; scheduled/booked jobs are kept. Asks first.
function clearRequests() {
  const unscheduled = appState.requests.filter(r => r.scheduled !== true);
  if (unscheduled.length === 0) {
    alert('There are no unscheduled requests to clear.');
    return;
  }
  const keptScheduled = appState.requests.length - unscheduled.length;
  const msg = keptScheduled > 0
    ? `Clear ${unscheduled.length} unscheduled request${unscheduled.length > 1 ? 's' : ''}? ${keptScheduled} scheduled job${keptScheduled > 1 ? 's' : ''} will be kept. This cannot be undone.`
    : `Clear ${unscheduled.length} unscheduled request${unscheduled.length > 1 ? 's' : ''}? This cannot be undone.`;
  if (!confirm(msg)) return;

  appState.requests = appState.requests.filter(r => r.scheduled === true);
  saveData();
  if (currentDetailId !== null) {
    currentDetailId = null;
    document.getElementById('detail').classList.add('hidden');
    document.getElementById('overview').classList.remove('hidden');
  }
  updateUI();
}


// Placeholder until a form-connection approach is wired up in a later step.
function connectToForm() {
  alert('Connect to form response is coming soon. For now, export your form responses to CSV and use Import CSV.');
}


// ============ SETTINGS MANAGEMENT ============
function loadSettings() {
  const saved = localStorage.getItem('electrician_settings');
  if (saved) {
    appState.settings = { ...appState.settings, ...JSON.parse(saved) };
  }
  // Coerce numeric settings so older saves (or hand-edited values) behave.
  appState.settings.businessStartHour = numOr(appState.settings.businessStartHour, 8);
  appState.settings.businessEndHour = numOr(appState.settings.businessEndHour, 17);
  appState.settings.dailyCapHours = numOr(appState.settings.dailyCapHours, 8.5);
  appState.settings.lunchEnabled = !!appState.settings.lunchEnabled;
  if (!SORT_OPTIONS.includes(appState.settings.sortBy)) appState.settings.sortBy = 'date-asc';
  updateBaseLabel();
}


// Parse a value to a finite number, falling back to a default.
function numOr(v, fallback) {
  const n = parseFloat(v);
  return isFinite(n) ? n : fallback;
}


function saveSettings() {
  const businessName = document.getElementById('businessName').value;
  const baseAddress = document.getElementById('baseAddress').value;

  // Read and validate the scheduling inputs before committing anything.
  const startHour = timeStrToHour(document.getElementById('businessStart').value);
  const endHour = timeStrToHour(document.getElementById('businessEnd').value);
  const cap = numOr(document.getElementById('dailyCap').value, NaN);
  const lunchEnabled = document.getElementById('lunchEnabled').checked;
  const lunchStart = document.getElementById('lunchStart').value;
  const lunchEnd = document.getElementById('lunchEnd').value;

  if (startHour === null || endHour === null || endHour <= startHour) {
    alert('Business hours are invalid: the end time must be after the start time.');
    return;
  }
  if (!isFinite(cap) || cap <= 0) {
    alert('Daily work cap must be a number greater than 0.');
    return;
  }
  let lunchHours = 0;
  if (lunchEnabled) {
    const ls = timeStrToHour(lunchStart);
    const le = timeStrToHour(lunchEnd);
    if (ls === null || le === null || le <= ls) {
      alert('Lunch break is invalid: the end time must be after the start time.');
      return;
    }
    lunchHours = le - ls;
  }
  // The cap plus a blocked lunch can never exceed the business hours window,
  // since lunch and the cap's work activity both have to fit inside it.
  const operatingHours = endHour - startHour;
  if (cap + lunchHours > operatingHours) {
    if (lunchEnabled) {
      alert(`Daily work cap (${cap}h) plus the lunch break (${lunchHours}h) cannot exceed business hours (${operatingHours}h). Reduce the cap or shorten lunch.`);
    } else {
      alert(`Daily work cap (${cap}h) cannot exceed business hours (${operatingHours}h).`);
    }
    return;
  }

  appState.settings.businessName = businessName || appState.settings.businessName;
  appState.settings.baseAddress = baseAddress || appState.settings.baseAddress;
  appState.settings.businessStartHour = startHour;
  appState.settings.businessEndHour = endHour;
  appState.settings.dailyCapHours = cap;
  appState.settings.lunchEnabled = lunchEnabled;
  appState.settings.lunchStart = lunchStart;
  appState.settings.lunchEnd = lunchEnd;
  appState.settings.groqApiKey = document.getElementById('groqApiKey').value.trim();

  // Geocode address (simplified - in production use a real geocoding API)
  if (baseAddress) {
    appState.settings.baseCoordinates = estimateCoordinates(baseAddress);
  }

  localStorage.setItem('electrician_settings', JSON.stringify(appState.settings));
  updateBaseLabel();
  closeModal('settingsModal');

  // Re-render the current screen, and refresh the detail page if one is open so
  // the legacy "next available" insights reflect the new hours.
  updateUI();
  if (currentDetailId !== null && !document.getElementById('detail').classList.contains('hidden')) {
    openDetail(currentDetailId);
  }
}


function updateBaseLabel() {
  const label = appState.settings.baseAddress || 'Not set';
  document.getElementById('baseLabel').textContent = label;

  // Pre-fill settings modal
  document.getElementById('businessName').value = appState.settings.businessName;
  document.getElementById('baseAddress').value = appState.settings.baseAddress;
  document.getElementById('businessStart').value = hourToTimeStr(appState.settings.businessStartHour);
  document.getElementById('businessEnd').value = hourToTimeStr(appState.settings.businessEndHour);
  document.getElementById('dailyCap').value = appState.settings.dailyCapHours;
  document.getElementById('lunchEnabled').checked = !!appState.settings.lunchEnabled;
  document.getElementById('lunchStart').value = appState.settings.lunchStart;
  document.getElementById('lunchEnd').value = appState.settings.lunchEnd;
  document.getElementById('groqApiKey').value = appState.settings.groqApiKey || '';
}


// Convert an hour number (8, 17, 8.5) into an "HH:MM" string for time inputs.
function hourToTimeStr(hour) {
  const h = Math.floor(hour);
  const min = Math.round((hour - h) * 60);
  return String(h).padStart(2, '0') + ':' + String(min).padStart(2, '0');
}


// Convert an "HH:MM" string into a fractional hour number (8.5 for "08:30").
function timeStrToHour(str) {
  const parts = String(str || '').split(':');
  const h = parseInt(parts[0], 10);
  const min = parseInt(parts[1], 10);
  if (!isFinite(h)) return null;
  return h + (isFinite(min) ? min : 0) / 60;
}


// ============ DATA MANAGEMENT ============
function loadData() {
  const saved = localStorage.getItem('electrician_requests');
  if (saved) {
    appState.requests = JSON.parse(saved);
    // Normalize older saved jobs that predate the scheduling fields.
    appState.requests.forEach(req => {
      if (typeof req.scheduled !== 'boolean') req.scheduled = false;
      if (req.scheduledStart === undefined) req.scheduledStart = null;
      if (req.scheduledEnd === undefined) req.scheduledEnd = null;
      if (req.requestedDate === undefined) req.requestedDate = null;
    });
  }
}


function saveData() {
  localStorage.setItem('electrician_requests', JSON.stringify(appState.requests));
}


// ============ CSV IMPORT ============
let pendingCSVData = null;


function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const csv = e.target.result;
      pendingCSVData = parseCSV(csv);

      // Show preview
      document.getElementById('importPreview').classList.remove('hidden');
      document.getElementById('previewContent').textContent =
        `Found ${pendingCSVData.length} requests. Ready to import.`;
      document.getElementById('confirmImport').disabled = false;
    } catch (error) {
      alert('Error parsing CSV: ' + error.message);
    }
  };
  reader.readAsText(file);
}


function parseCSV(csv) {
  const lines = csv.split('\n').filter(line => line.trim());
  if (lines.length < 2) throw new Error('CSV file is empty or invalid');

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const requests = [];

  // Find column indices (flexible column names)
  const nameIdx = headers.findIndex(h => h.includes('name'));
  const phoneIdx = headers.findIndex(h => h.includes('phone'));
  const emailIdx = headers.findIndex(h => h.includes('email'));
  const addressIdx = headers.findIndex(h => h.includes('address'));
  const dateIdx = headers.findIndex(h => h.includes('date'));
  const messageIdx = headers.findIndex(h => h.includes('description') || h.includes('problem') || h.includes('message'));

  if (messageIdx === -1) {
    throw new Error('Could not find problem description column');
  }

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length < headers.length) continue;

    const request = {
      id: makeRequestId(),
      name: nameIdx >= 0 ? values[nameIdx]?.trim() : '',
      phone: phoneIdx >= 0 ? values[phoneIdx]?.trim() : '',
      email: emailIdx >= 0 ? values[emailIdx]?.trim() : '',
      address: addressIdx >= 0 ? values[addressIdx]?.trim() : '',
      message: messageIdx >= 0 ? values[messageIdx]?.trim() : '',
      requestedDate: dateIdx >= 0 ? parseRequestedDate(values[dateIdx]) : null,
      scheduled: false,
      scheduledStart: null,
      scheduledEnd: null
    };

    // Run inference engine
    const analysis = InferenceEngine.analyze(request);
    request.jobType = analysis.jobType;
    request.partOfHouse = analysis.partOfHouse;
    request.urgency = analysis.urgency;
    request.laborMin = analysis.laborEstimate.min;
    request.laborMax = analysis.laborEstimate.max;
    request.materials = analysis.materials;
    request.tools = analysis.tools;
    request.uncertainties = analysis.uncertainties;
    request.point = estimateCoordinates(request.address);

    requests.push(request);
  }

  return requests;
}


function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current);

  return values.map(v => v.replace(/^"|"$/g, '').trim());
}


// Parse a "Date Requested" cell into an ISO string, or null when missing/unparseable.
// Accepts "YYYY-MM-DD HH:MM", "YYYY-MM-DD", and other Date-parseable forms; a missing
// or invalid value becomes null (treated as unknown) so it never blocks an import.
function parseRequestedDate(raw) {
  const str = (raw || '').trim();
  if (!str) return null;
  // Normalize "YYYY-MM-DD HH:MM" to ISO-ish "YYYY-MM-DDTHH:MM" so it parses as local time.
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(str) ? str.replace(' ', 'T') : str;
  const d = new Date(normalized);
  return isNaN(d.getTime()) ? null : d.toISOString();
}


// Identity key for duplicate detection: same customer name, phone, and message.
function dedupeKey(job) {
  return [job.name || '', job.phone || '', job.message || '']
    .map(s => s.trim().toLowerCase())
    .join('||');
}


function confirmImport() {
  if (!pendingCSVData) return;

  // Append to existing requests, skipping rows that exactly match one already present
  // (same name + phone + message) so re-importing the same file does not double up.
  const existingKeys = new Set(appState.requests.map(dedupeKey));
  const newJobs = pendingCSVData.filter(job => {
    const key = dedupeKey(job);
    if (existingKeys.has(key)) return false;
    existingKeys.add(key);
    return true;
  });
  appState.requests = appState.requests.concat(newJobs);
  saveData();
  updateUI();
  closeModal('importModal');
  enrichNotDeterminedJobs(newJobs);

  const skipped = pendingCSVData.length - newJobs.length;
  if (skipped > 0) {
    alert(`Imported ${newJobs.length} request${newJobs.length === 1 ? '' : 's'}. Skipped ${skipped} duplicate${skipped === 1 ? '' : 's'} already in the list.`);
  }

  // Reset import state
  pendingCSVData = null;
  document.getElementById('csvFile').value = '';
  document.getElementById('importPreview').classList.add('hidden');
  document.getElementById('confirmImport').disabled = true;
}


// ============ AI ENRICHMENT (optional, only for "Not determined" jobs) ============
// Transient, in-session only: never persisted, since they're just UI feedback about
// in-flight or failed AI calls, not data about the job itself.
const aiPendingIds = new Set();
const aiErrorMessages = new Map();


// Only the "message unclear" case is eligible. The "no description provided" case
// has no message for the AI to read either, so it is never sent.
function isAiEligible(r) {
  return r.jobType === 'Not determined (message unclear)';
}


// Run AI classification for one job: shows a pending badge while in flight, merges
// the result into the job on success, records an error message on failure. Safe to
// call with no API key configured (AIEnrichment.classify fails fast in that case).
async function runAIClassification(job) {
  aiPendingIds.add(job.id);
  aiErrorMessages.delete(job.id);
  refreshAfterAIChange(job.id);

  try {
    const result = await AIEnrichment.classify(
      job.message,
      { name: job.name, address: job.address },
      appState.settings.groqApiKey
    );
    job.jobType = result.jobType;
    job.partOfHouse = result.partOfHouse;
    job.urgency = result.urgency;
    job.laborMin = result.laborEstimate.min;
    job.laborMax = result.laborEstimate.max;
    job.materials = result.materials;
    job.tools = result.tools;
    job.uncertainties = result.uncertainties;
    job.inScope = result.inScope;
    saveData();
  } catch (err) {
    aiErrorMessages.set(job.id, err.message || 'AI classification failed.');
    console.warn('AI classification failed for job', job.id, err);
  } finally {
    aiPendingIds.delete(job.id);
    refreshAfterAIChange(job.id);
  }
}


// Re-render whatever is currently visible so AI pending/result state shows up live,
// whether that's the board (card badge) or an open detail page for this job.
function refreshAfterAIChange(jobId) {
  updateUI();
  if (currentDetailId === jobId && !document.getElementById('detail').classList.contains('hidden')) {
    openDetail(jobId);
  }
}


// Kick off background AI classification for every eligible Not Determined job after
// an import. No-op when no API key is configured, so behavior without a key is
// unchanged. Runs one job at a time to stay polite to the free-tier rate limit.
async function enrichNotDeterminedJobs(jobs) {
  if (!appState.settings.groqApiKey) return;
  const eligible = jobs.filter(isAiEligible);
  for (const job of eligible) {
    await runAIClassification(job);
  }
}


// Manual retry, wired to the "Try AI classification" button on a job's detail page.
function retryAIClassification(id) {
  const job = appState.requests.find(x => x.id === id);
  if (!job) return;
  if (!appState.settings.groqApiKey) {
    alert('Add a Groq API key in Settings to enable AI classification.');
    return;
  }
  runAIClassification(job);
}


// ============ DATA EXPORT ============
function exportData() {
  if (appState.currentScreen === 'scheduled') {
    exportScheduleAsICS();
    return;
  }

  if (appState.requests.length === 0) {
    alert('No data to export');
    return;
  }

  // Create CSV
  const headers = ['Customer Name', 'Phone', 'Email', 'Address', 'Problem Description',
                   'Job Type', 'Part of House', 'Urgency', 'Labor Min', 'Labor Max'];
  const rows = appState.requests.map(r => [
    r.name, r.phone, r.email, r.address, r.message,
    r.jobType, r.partOfHouse, r.urgency, r.laborMin, r.laborMax
  ]);

  const csv = [headers, ...rows]
    .map(row => row.map(cell => `"${cell}"`).join(','))
    .join('\n');

  // Download
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `electrician-requests-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}


// Export every scheduled job as an .ics calendar file (RFC 5545), importable into
// Google Calendar, Apple Calendar, Outlook, and other calendar apps.
function exportScheduleAsICS() {
  const scheduledJobs = appState.requests.filter(r => r.scheduled === true && r.scheduledStart && r.scheduledEnd);
  if (scheduledJobs.length === 0) {
    alert('No scheduled services to export');
    return;
  }

  const stamp = toICSDateTime(new Date().toISOString());
  const events = scheduledJobs.map(r => buildICSEvent(r, stamp)).join('\r\n');

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Electrician Job Dispatch//Scheduling//EN',
    'CALSCALE:GREGORIAN',
    events,
    'END:VCALENDAR'
  ].join('\r\n');

  const blob = new Blob([ics], { type: 'text/calendar' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `scheduled-services-${new Date().toISOString().split('T')[0]}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}


// Build a single VEVENT block for one scheduled job.
function buildICSEvent(r, stamp) {
  const descLines = [
    `Job type: ${r.jobType || 'Not determined'}`,
    `Urgency: ${r.urgency || 'unknown'}`,
    r.phone ? `Phone: ${r.phone}` : null,
    r.email ? `Email: ${r.email}` : null,
    r.message ? `Customer message: ${r.message}` : null
  ].filter(Boolean).join('\n');

  return [
    'BEGIN:VEVENT',
    `UID:job-${r.id}@electrician-job-dispatch`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${toICSDateTime(r.scheduledStart)}`,
    `DTEND:${toICSDateTime(r.scheduledEnd)}`,
    `SUMMARY:${escapeICSText(r.jobType || 'Service call')} for ${escapeICSText(r.name || 'customer')}`,
    r.address ? `LOCATION:${escapeICSText(r.address)}` : null,
    `DESCRIPTION:${escapeICSText(descLines)}`,
    'END:VEVENT'
  ].filter(Boolean).join('\r\n');
}


// Convert an ISO timestamp (already UTC) into the YYYYMMDDTHHMMSSZ form ICS requires.
function toICSDateTime(iso) {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}


// Escape text per RFC 5545 (backslash, semicolon, comma, newline).
function escapeICSText(s) {
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}


// ============ UI RENDERING ============
// The jobs shown on the active screen: unscheduled on Overview, scheduled on Scheduled.
function currentList() {
  return appState.requests.filter(r =>
    appState.currentScreen === 'scheduled' ? r.scheduled === true : r.scheduled !== true
  );
}


function updateUI() {
  const emptyState = document.getElementById('emptyState');
  const emptyStateAlt = document.getElementById('emptyStateAlt');
  const dataView = document.getElementById('dataView');

  applyScreenChrome();

  if (appState.requests.length === 0) {
    // No imported jobs at all: show the original import-prompt empty state.
    emptyState.classList.remove('hidden');
    emptyStateAlt.classList.add('hidden');
    dataView.classList.add('hidden');
    return;
  }

  const list = currentList();
  if (list.length === 0) {
    // Jobs exist, but none on this screen: show the screen-specific empty state.
    emptyState.classList.add('hidden');
    dataView.classList.add('hidden');
    setAltEmptyState();
    emptyStateAlt.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  emptyStateAlt.classList.add('hidden');
  dataView.classList.remove('hidden');
  renderSummary(list);
  renderRows(list);
}


// Update the eyebrow, title, lede, and active sidebar nav item for the active screen.
function applyScreenChrome() {
  const scheduled = appState.currentScreen === 'scheduled';
  document.getElementById('ovEyebrow').textContent =
    scheduled ? 'Scheduled services' : 'Service requests overview';
  document.getElementById('ovTitle').textContent =
    scheduled ? 'Scheduled services' : 'Incoming service requests';
  document.getElementById('ovLede').textContent =
    scheduled
      ? 'Booked jobs with a confirmed window. Select any card to open the full job summary.'
      : 'Sorted by urgency. Select any card to open the full job summary.';
  document.getElementById('navRequests').classList.toggle('active', !scheduled);
  document.getElementById('navScheduled').classList.toggle('active', scheduled);
  document.getElementById('exportBtnLabel').textContent =
    scheduled ? 'Export as Calendar Events' : 'Export Requests CSV';
  // Adding requests only makes sense on the Requests screen, so hide it on Scheduled.
  if (scheduled) closeAddRequestsMenu();
  document.getElementById('addRequestsWrap').classList.toggle('hidden', scheduled);
}


// Fill the screen-specific empty state text for the active screen.
function setAltEmptyState() {
  const scheduled = appState.currentScreen === 'scheduled';
  document.getElementById('emptyStateAltHeading').textContent =
    scheduled ? 'No scheduled services yet' : 'No incoming requests';
  document.getElementById('emptyStateAltText').textContent =
    scheduled
      ? 'Open a request from the overview and schedule it to see it here.'
      : 'Every request has been scheduled. Switch to scheduled services to view them.';
}


function renderSummary(list) {
  const counts = { high: 0, medium: 0, low: 0 };
  list.forEach(r => counts[r.urgency]++);

  document.getElementById('summary').innerHTML = `
    <div class="metric"><div class="n">${list.length}</div><div class="l">Total requests</div></div>
    <div class="metric high"><div class="n">${counts.high}</div><div class="l">High urgency</div></div>
    <div class="metric med"><div class="n">${counts.medium}</div><div class="l">Medium urgency</div></div>
    <div class="metric low"><div class="n">${counts.low}</div><div class="l">Low urgency</div></div>
  `;
}


const URG_CLASS = { high: 'high', medium: 'med', low: 'low' };


// Valid "sort by" values for the Requests board: "<field>-<direction>".
const SORT_OPTIONS = ['date-asc', 'date-desc', 'distance-asc', 'distance-desc', 'labor-asc', 'labor-desc'];


// The sortable numeric value for a job under a given field, or null when missing.
// Missing values are treated as the lowest value (see sortComparator), so they follow
// the sort direction: bottom when descending, top when ascending.
function sortValue(job, field) {
  if (field === 'date') {
    if (!job.requestedDate) return null;
    const t = new Date(job.requestedDate).getTime();
    return isNaN(t) ? null : t;
  }
  if (field === 'distance') {
    // With no base set, every card is equidistant (stable order). With a base but no
    // geocoded point, the distance is unknown (missing).
    if (!appState.settings.baseCoordinates) return 0;
    if (!job.point) return null;
    return straightLineMiles(appState.settings.baseCoordinates, job.point) * 1.3;
  }
  if (field === 'labor') {
    return ((job.laborMin || 0) + (job.laborMax || 0)) / 2;
  }
  return null;
}


// Build a comparator from a "<field>-<direction>" sort key. Missing values sort as the
// lowest value, so ascending puts them first and descending puts them last.
function sortComparator(sortBy) {
  const [field, dir] = String(sortBy || 'date-asc').split('-');
  return (a, b) => {
    let va = sortValue(a, field);
    let vb = sortValue(b, field);
    if (va === null) va = -Infinity;
    if (vb === null) vb = -Infinity;
    return dir === 'desc' ? vb - va : va - vb;
  };
}


// Small inline icons reused inside job cards.
const ICO_PERSON = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="8" r="3.2" stroke="currentColor" stroke-width="2"/><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const ICO_PHONE = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 4h3l1.5 4-2 1.5a11 11 0 0 0 5 5l1.5-2 4 1.5v3a1 1 0 0 1-1 1A15 15 0 0 1 4 5a1 1 0 0 1 1-1z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';
const ICO_EMAIL = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="1" stroke="currentColor" stroke-width="2"/><path d="M4 6l8 7 8-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICO_CHEVRON = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';


// Build one clickable job card. Shows the booked window prominently when showWindow is set
// (the Scheduled screen); the urgency-colored left border is always shown.
function buildJobCard(r, showWindow) {
  const card = document.createElement('div');
  card.className = 'job-card ' + URG_CLASS[r.urgency];
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', `Open job summary for ${r.jobType}`);

  const laborText = r.inScope === false ? 'N/A' : `~${r.laborMin}-${r.laborMax} hrs`;
  const windowHTML = showWindow
    ? `<div class="job-card-window">${esc(formatWindowTimeRange(r.scheduledStart, r.scheduledEnd))}</div>`
    : '';
  const aiBadgeHTML = aiPendingIds.has(r.id) ? `<div class="ai-badge">Checking with AI...</div>` : '';

  card.innerHTML = `
    ${windowHTML}
    ${aiBadgeHTML}
    <div class="job-card-title">${esc(r.jobType)}</div>
    <div class="job-card-meta">
      <span>${esc(r.partOfHouse)} &middot; ${esc(laborText)}</span>
      <span class="job-card-date${r.requestedDate ? '' : ' missing-date'}">${r.requestedDate ? esc(formatRequestedDate(r.requestedDate)) : 'No date'}</span>
    </div>
    <div class="job-card-rule"></div>
    <div class="job-card-contacts">
      <div class="job-card-contact">${ICO_PERSON}${r.name ? esc(r.name) : '<span class="missing">Not provided</span>'}</div>
      <div class="job-card-contact">${ICO_PHONE}<span class="mono">${r.phone ? esc(r.phone) : '<span class="missing">Not provided</span>'}</span></div>
      <div class="job-card-contact">${ICO_EMAIL}<span class="mono">${r.email ? esc(r.email) : '<span class="missing">Not provided</span>'}</span></div>
    </div>
    <div class="job-card-footer">
      <button type="button" class="job-card-schedule-btn">${r.scheduled ? 'Reschedule' : 'Schedule'}</button>
      <span class="job-card-open">Open ${ICO_CHEVRON}</span>
    </div>
  `;

  card.querySelector('.job-card-schedule-btn').addEventListener('click', e => {
    e.stopPropagation();
    openScheduleModal(r.id);
  });
  card.addEventListener('click', () => openDetail(r.id));
  card.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openDetail(r.id);
    }
  });

  return card;
}


function renderRows(list) {
  const board = document.getElementById('board');
  board.innerHTML = '';

  const scheduledScreen = appState.currentScreen === 'scheduled';

  // The sort control only applies to the Requests board, so show it only there.
  document.getElementById('sortBar').classList.toggle('hidden', scheduledScreen);

  if (!scheduledScreen) {
    board.className = 'board board-urgency';
    const compare = sortComparator(appState.settings.sortBy);
    const columns = [
      { key: 'high', label: 'High urgency' },
      { key: 'medium', label: 'Medium urgency' },
      { key: 'low', label: 'Low urgency' }
    ];
    columns.forEach(col => {
      // Each urgency column is sorted independently by the chosen criteria.
      const colJobs = list.filter(r => r.urgency === col.key).sort(compare);
      const colEl = document.createElement('div');
      colEl.className = 'board-col';
      const head = document.createElement('div');
      head.className = 'board-col-head ' + URG_CLASS[col.key];
      head.innerHTML = `<span class="board-col-title">${col.label}</span><span class="board-col-count">${colJobs.length}</span>`;
      colEl.appendChild(head);
      if (colJobs.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'board-col-empty';
        empty.textContent = 'No requests in this column.';
        colEl.appendChild(empty);
      } else {
        colJobs.forEach(r => colEl.appendChild(buildJobCard(r, false)));
      }
      board.appendChild(colEl);
    });
    return;
  }

  // Scheduled screen: day sections, days ascending, jobs within a day by start time.
  board.className = 'board board-days';
  const days = new Map();
  list.forEach(r => {
    const key = new Date(r.scheduledStart).toDateString();
    if (!days.has(key)) days.set(key, { date: new Date(r.scheduledStart), jobs: [] });
    days.get(key).jobs.push(r);
  });

  [...days.values()]
    .sort((a, b) => a.date - b.date)
    .forEach(group => {
      group.jobs.sort((a, b) => new Date(a.scheduledStart) - new Date(b.scheduledStart));
      const section = document.createElement('div');
      section.className = 'day-section';
      const head = document.createElement('div');
      head.className = 'day-section-head';
      const headLabel = document.createElement('span');
      headLabel.textContent = formatDayHeader(group.date, group.jobs.length);
      head.appendChild(headLabel);
      const mapUrl = buildDayMapUrl(group.jobs);
      if (mapUrl) {
        const mapLink = document.createElement('a');
        mapLink.className = 'day-map-link';
        mapLink.href = mapUrl;
        mapLink.target = '_blank';
        mapLink.rel = 'noopener noreferrer';
        mapLink.textContent = 'See map';
        head.appendChild(mapLink);
      }
      const cardsWrap = document.createElement('div');
      cardsWrap.className = 'day-section-cards';
      group.jobs.forEach(r => cardsWrap.appendChild(buildJobCard(r, true)));
      section.appendChild(head);
      section.appendChild(cardsWrap);
      board.appendChild(section);
    });
}


// ============ DETAIL VIEW ============
function openDetail(id) {
  const r = appState.requests.find(x => x.id === id);
  if (!r) return;

  // Remember where we came from so Back returns to the right screen.
  currentDetailId = id;
  detailOriginScreen = appState.currentScreen;

  const out = (r.inScope === false);
  const _mats = Array.isArray(r.materials) ? r.materials : [];
  const _tools = Array.isArray(r.tools) ? r.tools : [];
  const _unc = (r.uncertainties && typeof r.uncertainties === 'object') ? r.uncertainties : {};
  const _pc = Array.isArray(_unc.phoneCall) ? _unc.phoneCall : (Array.isArray(r.uncertainties) ? r.uncertainties : []);
  const _os = Array.isArray(_unc.onSite) ? _unc.onSite : [];

  const de = distanceAndEta(r.point);
  const uc = { high: 'high', medium: 'med', low: 'low' }[r.urgency];
  const urgLabel = { high: 'High', medium: 'Medium', low: 'Low' }[r.urgency];

  // Materials sorted by confidence (already sorted in inference engine)
  const materialsHTML = _mats.map(m => `
    <div class="mat">
      <span>${esc(m.name)}</span>
      <span class="prob ${m.prob}">${m.prob === 'surely' ? 'Surely' : m.prob === 'likely' ? 'Most likely' : 'Maybe'}</span>
    </div>`).join('');

  // Tools list
  const toolsHTML = _tools.length > 0
    ? _tools.map(t => `<li style="padding:4px 0;font-size:.88rem">• ${esc(t)}</li>`).join('')
    : '<li style="padding:4px 0;font-size:.88rem;color:var(--muted)">Standard electrician toolkit</li>';

  // Uncertainties separated into phone call vs on-site
  const phoneCallHTML = _pc.map(u => `<li>${esc(u)}</li>`).join('');
  const onSiteHTML = _os.map(u => `<li>${esc(u)}</li>`).join('');

  const materialsSection = out ? '' : `<div class="divider"></div><p class="block-label">Materials needed (ranked by confidence)</p>${materialsHTML}`;
  const toolsSection = out ? '' : `<div class="divider"></div><p class="block-label">Tools required</p><ul style="list-style:none;margin:8px 0;padding:0">${toolsHTML}</ul>`;
  const prepSection = out ? '' : `<div class="divider"></div><p class="block-label">📞 Questions for booking phone call</p><ul class="checks">${phoneCallHTML}</ul><div class="divider"></div><p class="block-label">🔧 On-site checks before starting work</p><ul class="checks">${onSiteHTML}</ul>`;
  const scopeSection = out ? `<div class="divider"></div><p class="msg" style="font-style:normal">This looks like a new installation or project, not a fix or repair, so it is outside the repair scope. Urgency and location are still flagged above. Materials, tools, labor, and prep questions are not estimated for out-of-scope jobs.</p>` : '';

  const avgDuration = (r.laborMin + r.laborMax) / 2 + 1;
  const slots = nextAvailable(avgDuration, 2);
  const slotsHTML = slots.length
    ? slots.map(s => `<div class="sched-row"><span class="ico">»</span><span>Open window: <span class="slot">${fmtSlot(s)}</span></span></div>`).join('')
    : `<div class="sched-row"><span class="ico">»</span><span>No standard window in next two weeks. Consider after-hours.</span></div>`;

  // Nearby = other imported requests within range (excludes this one)
  const near = nearbyScheduled(r.point, 6, r.id);
  const nearHTML = r.point
    ? (near.length
        ? near.map(n => `
          <div class="nearby-item clickable" onclick="openNearbyJob('${esc(String(n.id))}', event)" style="cursor:pointer;padding:8px;margin:2px 0;border-radius:6px;transition:background .15s" onmouseover="this.style.background='var(--canvas)'" onmouseout="this.style.background='transparent'">
            <span><strong>${esc(n.jobType)}</strong> (${esc(n.name || n.partOfHouse || 'Unknown')})</span>
            <span class="d">${n.miles.toFixed(1)} mi</span>
          </div>`).join('')
        : `<div class="nearby-item"><span>No other imported jobs within 6 miles yet.</span></div>`)
    : `<div class="nearby-item"><span class="missing">Address needed to find nearby jobs.</span></div>`;

  const etaHTML = de
    ? `<div class="eta">
         <div class="box"><div class="v">${de.miles.toFixed(1)} mi</div><div class="k">Est. road distance</div></div>
         <div class="box"><div class="v">${de.minutes} min</div><div class="k">Est. drive time</div></div>
       </div>`
    : `<p class="missing" style="margin:4px 0 0">Address not provided. Collect it to estimate distance and drive time.</p>`;

  // AI classification section: only for "Not determined (message unclear)" jobs, since
  // the "no description provided" case has nothing for the AI to read either.
  const hasKey = !!appState.settings.groqApiKey;
  const aiPending = aiPendingIds.has(r.id);
  const aiError = aiErrorMessages.get(r.id);
  const aiSection = isAiEligible(r) ? `
    <div class="divider"></div>
    <p class="block-label">AI classification</p>
    ${aiPending
      ? `<div class="ai-badge">Checking with AI...</div>`
      : `<button class="btn btn-secondary" onclick="retryAIClassification(${JSON.stringify(r.id)})" ${hasKey ? '' : 'disabled'}>Try AI classification</button>
         ${hasKey ? '' : '<p class="missing" style="margin-top:8px">Add a Groq API key in Settings to enable this.</p>'}
         ${aiError ? `<p class="ai-error">${esc(aiError)}</p>` : ''}`}
  ` : '';

  // Schedule area: differs for unscheduled versus scheduled jobs.
  const scheduleArea = r.scheduled
    ? `<div class="card" style="margin-bottom:18px">
         <p class="block-label" style="margin-top:0">Scheduled window</p>
         <p style="font-size:1rem;font-weight:600;margin:0 0 4px">${esc(formatWindowSummary(r.scheduledStart, r.scheduledEnd))}</p>
         <p style="font-size:.85rem;color:var(--muted);margin:0 0 14px">Duration: ${esc(formatDuration(r.scheduledStart, r.scheduledEnd))}</p>
         <div style="display:flex;gap:10px;flex-wrap:wrap">
           <button class="btn btn-primary" onclick="openScheduleModal(${JSON.stringify(r.id)})">Reschedule</button>
           <button class="btn btn-secondary" onclick="unscheduleJob(${JSON.stringify(r.id)})">Unschedule</button>
         </div>
       </div>`
    : `<div class="card" style="margin-bottom:18px">
         <p class="block-label" style="margin-top:0">Scheduling</p>
         <p style="font-size:.9rem;color:var(--ink-soft);margin:0 0 14px">Not scheduled yet.</p>
         <button class="btn btn-primary" onclick="openScheduleModal(${JSON.stringify(r.id)})">Schedule</button>
       </div>`;

  document.getElementById('detail').innerHTML = `
    <button class="back" id="backBtn">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      ${detailOriginScreen === 'scheduled' ? 'Back to scheduled services' : 'Back to all requests'}
    </button>


    <div class="detail-head u-${uc}">
      <div>
        <p class="eyebrow">Service request detail</p>
        <h2>${esc(r.jobType)}</h2>
        <div class="where">${esc(r.partOfHouse)} · ${r.name ? esc(r.name) : 'Customer name not provided'}</div>
      </div>
      <span class="pill ${uc}" style="font-size:.82rem;padding:6px 14px">${urgLabel} urgency</span>
    </div>


    ${scheduleArea}


    <div class="grid">
      <div class="card">
        <h3><span class="num">1</span> Job & customer</h3>
        <dl class="kv">
          <dt>Customer</dt><dd>${r.name ? esc(r.name) : '<span class="missing">Not provided</span>'}</dd>
          <dt>Requested</dt><dd>${r.requestedDate ? esc(formatRequestedDate(r.requestedDate)) : '<span class="missing">Not provided</span>'}</dd>
          <dt>Address</dt><dd>${r.address ? esc(r.address) : '<span class="missing">Not provided</span>'}</dd>
          <dt>Phone</dt><dd class="mono">${r.phone ? esc(r.phone) : '<span class="missing">Not provided</span>'}</dd>
          <dt>Email</dt><dd class="mono">${r.email ? `<a href="mailto:${esc(r.email)}">${esc(r.email)}</a>` : '<span class="missing">Not provided</span>'}</dd>
          <dt>Job type</dt><dd>${esc(r.jobType)}</dd>
          <dt>Part of house</dt><dd>${esc(r.partOfHouse)}</dd>
          <dt>Urgency</dt><dd><span class="pill ${uc}">${urgLabel}</span></dd>
          <dt>Est. labor</dt><dd class="mono">${out ? '<span class="missing">Not applicable (out of repair scope)</span>' : r.laborMin + '-' + r.laborMax + ' hours'}</dd>
        </dl>


        <div class="divider"></div>
        <p class="block-label">Customer's message</p>
        <p class="msg">${esc(r.message)}</p>
        ${aiSection}


        <div class="divider"></div>
        <p class="block-label">Distance & ETA from base</p>
        ${etaHTML}


        ${scopeSection}${materialsSection}${toolsSection}${prepSection}
      </div>


      <div class="card">
        <h3><span class="num">2</span> Scheduling insights</h3>
        <p class="block-label">Next available on your calendar</p>
        ${slotsHTML}


        <div class="divider"></div>
        <p class="block-label">Other nearby jobs (within 6 mi) - click to view</p>
        ${nearHTML}


        <div class="divider"></div>
        <p class="block-label">Routing note</p>
        <p style="font-size:.85rem;color:var(--ink-soft);margin:0">
          ${r.point
            ? (near.length
                ? `You have ${near.length} job${near.length > 1 ? 's' : ''} near this address. Grouping on the same day could cut drive time.`
                : `No nearby jobs yet. Try to batch this with another request in the same area when one comes in.`)
            : `Add the customer's address to enable routing and nearby-job suggestions.`}
        </p>
      </div>
    </div>


    <div class="note">
      Job type, urgency, part of house, materials, tools, labor hours and scheduling are AI-inferred estimates.
      A licensed electrician should confirm everything on site. Distance and drive time are approximate.
    </div>
  `;

  document.getElementById('backBtn').addEventListener('click', backToList);
  document.getElementById('overview').classList.add('hidden');
  document.getElementById('detail').classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}


// Switch to a screen (Requests or Scheduled), leaving the detail view if one is open.
// Used by the sidebar nav and by Back, so navigating away from a detail page always
// lands on the right list instead of leaving a hidden, stale screen behind it.
function goToScreen(screen) {
  appState.currentScreen = screen;
  currentDetailId = null;
  document.getElementById('detail').classList.add('hidden');
  document.getElementById('overview').classList.remove('hidden');
  updateUI();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}


// Return from a detail page to whichever screen it was opened from.
function backToList() {
  goToScreen(detailOriginScreen);
}


// Navigate to a nearby request's detail page
function openNearbyJob(requestId, event) {
  if (event) event.stopPropagation();
  // Inline onclick passes the id as a string; stored request ids are numbers.
  const req = appState.requests.find(x => String(x.id) === String(requestId));
  if (req) openDetail(req.id);
}


// ============ CALENDAR & SCHEDULING ============
function atDay(offset, hour, min) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(hour, min || 0, 0, 0);
  return d;
}


// A specific day offset at a fractional hour (8.5 becomes 08:30).
function atDayFrac(offset, fractionalHour) {
  const h = Math.floor(fractionalHour);
  const min = Math.round((fractionalHour - h) * 60);
  return atDay(offset, h, min);
}


// Business hours and lunch, read live from settings so the whole app agrees.
function bizStartHour() { return appState.settings.businessStartHour; }
function bizEndHour() { return appState.settings.businessEndHour; }
function lunchActive() { return !!appState.settings.lunchEnabled; }
function lunchStartHour() { return timeStrToHour(appState.settings.lunchStart); }
function lunchEndHour() { return timeStrToHour(appState.settings.lunchEnd); }


// Mock calendar - used for "next available" scheduling slots only
const CALENDAR = [
  { id: 'cal1', title: 'Panel inspection', city: 'Carmel', point: { lat: 39.9784, lng: -86.1180 }, start: atDay(0, 9, 0), end: atDay(0, 11, 0) },
  { id: 'cal2', title: 'Outlet install', city: 'Westfield', point: { lat: 40.0428, lng: -86.1275 }, start: atDay(0, 13, 0), end: atDay(0, 15, 0) },
  { id: 'cal3', title: 'Ceiling fan swap', city: 'Fishers', point: { lat: 39.9568, lng: -85.9686 }, start: atDay(1, 8, 30), end: atDay(1, 11, 30) },
  { id: 'cal4', title: 'Breaker replacement', city: 'Noblesville', point: { lat: 40.0456, lng: -86.0086 }, start: atDay(1, 14, 0), end: atDay(1, 16, 0) },
];


// Nearby = other imported requests near a point, excluding the current one
function nearbyScheduled(point, radius, excludeId) {
  if (!point) return [];
  return appState.requests
    .filter(req => req.id !== excludeId && req.point)
    .map(req => ({ ...req, miles: straightLineMiles(point, req.point) * 1.3 }))
    .filter(req => req.miles <= radius)
    .sort((a, b) => a.miles - b.miles);
}


function nextAvailable(durationHrs, count) {
  const slots = [];
  const needMs = durationHrs * 3600 * 1000;
  let cursor = new Date();
  cursor.setMinutes(0, 0, 0);
  if (cursor.getHours() < bizStartHour()) cursor.setHours(Math.floor(bizStartHour()), 0, 0, 0);

  for (let day = 0; day < 14 && slots.length < count; day++) {
    const dayStart = atDayFrac(day, bizStartHour());
    const dayEnd = atDayFrac(day, bizEndHour());
    const dow = dayStart.getDay();
    if (dow === 0 || dow === 6) continue;

    // Only block lunch when the setting is on.
    const busy = lunchActive()
      ? [{ start: atDayFrac(day, lunchStartHour()), end: atDayFrac(day, lunchEndHour()) }]
      : [];
    CALENDAR.forEach(c => {
      if (c.start.toDateString() === dayStart.toDateString()) busy.push({ start: c.start, end: c.end });
    });
    busy.sort((a, b) => a.start - b.start);

    let open = new Date(Math.max(dayStart, cursor));
    for (const b of busy) {
      if (b.start - open >= needMs && open >= dayStart) {
        slots.push(new Date(open));
        if (slots.length >= count) break;
      }
      if (b.end > open) open = new Date(b.end);
    }
    if (slots.length < count && dayEnd - open >= needMs && open >= dayStart) {
      slots.push(new Date(open));
    }
  }
  return slots;
}


function fmtSlot(d) {
  const day = d.toLocaleDateString(DATE_LOCALE, { weekday: 'short', month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString(DATE_LOCALE, { hour: 'numeric', minute: '2-digit' });
  return `${day}, ${time}`;
}


// ============ JOB SCHEDULING (Scheduled Services screen) ============

// Point-to-point travel time between two jobs (mirrors distanceAndEta, which is base-to-point).
function travelMinutesBetween(aPoint, bPoint) {
  if (!aPoint || !bPoint) return 0;
  const straight = straightLineMiles(aPoint, bPoint);
  const roadMiles = straight * 1.3;
  return Math.max(4, Math.round(roadMiles / 32 * 60));
}


// The scheduled job whose window ends most recently before candidateStart, or null.
function previousJobBefore(candidateStart) {
  let best = null;
  appState.requests.forEach(job => {
    if (!job.scheduled || !job.scheduledEnd) return;
    const end = new Date(job.scheduledEnd);
    if (end <= candidateStart && (!best || end > new Date(best.scheduledEnd))) {
      best = job;
    }
  });
  return best;
}


// Window length in hours for a job's service time: labor midpoint, or a placeholder
// when out of scope or zero-labor.
function laborMidHours(job) {
  if (job.inScope === false || !job.laborMin || !job.laborMax) return PLACEHOLDER_WINDOW_HOURS;
  const mid = (job.laborMin + job.laborMax) / 2;
  return mid > 0 ? mid : PLACEHOLDER_WINDOW_HOURS;
}


// Sum of scheduled job window lengths (service plus travel; excludes buffer and lunch)
// for all jobs scheduled on the same calendar day as dateLike.
function dayScheduledMinutes(dateLike) {
  const target = new Date(dateLike).toDateString();
  let total = 0;
  appState.requests.forEach(job => {
    if (!job.scheduled || !job.scheduledStart || !job.scheduledEnd) return;
    const start = new Date(job.scheduledStart);
    if (start.toDateString() !== target) return;
    total += (new Date(job.scheduledEnd) - start) / 60000;
  });
  return total;
}


// Round a date up to the next slot boundary (15 minutes).
function roundUpToSlot(date) {
  const ms = SLOT_GRANULARITY_MINUTES * 60 * 1000;
  return new Date(Math.ceil(date.getTime() / ms) * ms);
}


// True if [aStart, aEnd) overlaps [bStart, bEnd).
function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}


// Scan the schedule horizon for the earliest window that fits this job's required length,
// inside business hours, routed around other scheduled jobs (with buffer) and lunch (if
// enabled), without busting the daily cap. Returns { start, end } or null.
function proposeWindow(job) {
  const lengthHours = laborMidHours(job);
  const lengthMs = lengthHours * 3600 * 1000;
  const bufferMs = BUFFER_MINUTES * 60 * 1000;
  const capMinutes = appState.settings.dailyCapHours * 60;

  for (let day = 0; day < SCHEDULE_HORIZON_DAYS; day++) {
    const dayStart = atDayFrac(day, bizStartHour());
    const dayEnd = atDayFrac(day, bizEndHour());
    const dow = dayStart.getDay();
    if (dow === 0 || dow === 6) continue;

    // Busy windows to route around: other scheduled jobs (with buffer) and lunch.
    const busy = [];
    if (lunchActive()) {
      busy.push({ start: atDayFrac(day, lunchStartHour()), end: atDayFrac(day, lunchEndHour()) });
    }
    appState.requests.forEach(other => {
      if (other.id === job.id || !other.scheduled || !other.scheduledStart || !other.scheduledEnd) return;
      const s = new Date(other.scheduledStart);
      if (s.toDateString() !== dayStart.toDateString()) return;
      busy.push({
        start: new Date(new Date(other.scheduledStart).getTime() - bufferMs),
        end: new Date(new Date(other.scheduledEnd).getTime() + bufferMs)
      });
    });
    busy.sort((a, b) => a.start - b.start);

    let candidate = roundUpToSlot(new Date(Math.max(dayStart, day === 0 ? new Date() : dayStart)));
    if (candidate < dayStart) candidate = dayStart;

    // Walk forward past each busy window, then try to fit before the day ends.
    for (const b of busy) {
      if (candidate < b.start) {
        const prev = previousJobBefore(candidate);
        const travelMs = prev && prev.point && job.point ? travelMinutesBetween(prev.point, job.point) * 60 * 1000 : 0;
        const windowEnd = new Date(candidate.getTime() + lengthMs + travelMs);
        const usedMinutes = dayScheduledMinutes(candidate) + (lengthMs + travelMs) / 60000;
        if (windowEnd <= b.start && windowEnd <= dayEnd && usedMinutes <= capMinutes) {
          return { start: candidate, end: windowEnd };
        }
      }
      if (b.end > candidate) candidate = roundUpToSlot(b.end);
    }

    const prev = previousJobBefore(candidate);
    const travelMs = prev && prev.point && job.point ? travelMinutesBetween(prev.point, job.point) * 60 * 1000 : 0;
    const windowEnd = new Date(candidate.getTime() + lengthMs + travelMs);
    const usedMinutes = dayScheduledMinutes(candidate) + (lengthMs + travelMs) / 60000;
    if (candidate >= dayStart && windowEnd <= dayEnd && usedMinutes <= capMinutes) {
      return { start: candidate, end: windowEnd };
    }
  }
  return null;
}


// Hard errors block confirm; soft warnings allow override.
function evaluateWindow(job, start, end) {
  const errors = [];
  const warnings = [];

  if (!(start instanceof Date) || !(end instanceof Date) || isNaN(start) || isNaN(end)) {
    errors.push('Start and end must be valid dates.');
    return { errors, warnings };
  }
  if (end <= start) {
    errors.push('End must be after start.');
    return { errors, warnings };
  }

  const dow = start.getDay();
  if (dow === 0 || dow === 6) warnings.push('This falls on a weekend.');

  const dayStart = atDayFracOnDate(start, bizStartHour());
  const dayEnd = atDayFracOnDate(start, bizEndHour());
  if (start < dayStart || end > dayEnd) warnings.push('This window falls outside business hours.');

  if (lunchActive()) {
    const lunchS = atDayFracOnDate(start, lunchStartHour());
    const lunchE = atDayFracOnDate(start, lunchEndHour());
    if (rangesOverlap(start, end, lunchS, lunchE)) warnings.push('This window overlaps the lunch block.');
  }

  const bufferMs = BUFFER_MINUTES * 60 * 1000;
  appState.requests.forEach(other => {
    if (other.id === job.id || !other.scheduled || !other.scheduledStart || !other.scheduledEnd) return;
    const oStart = new Date(other.scheduledStart);
    const oEnd = new Date(other.scheduledEnd);
    if (rangesOverlap(start, end, oStart, oEnd)) {
      warnings.push(`This window overlaps another scheduled job (${esc(other.jobType)}).`);
    } else if (rangesOverlap(start, end, new Date(oStart.getTime() - bufferMs), new Date(oEnd.getTime() + bufferMs))) {
      warnings.push(`This window leaves less than the ${BUFFER_MINUTES} minute buffer around another scheduled job (${esc(other.jobType)}).`);
    }
  });

  const existingMinutes = dayScheduledMinutes(start) - currentJobMinutesOnDay(job, start);
  const thisMinutes = (end - start) / 60000;
  const capMinutes = appState.settings.dailyCapHours * 60;
  if (existingMinutes + thisMinutes > capMinutes) warnings.push('This window pushes the day over the daily work cap.');

  return { errors, warnings };
}


// Minutes this job currently contributes to its own scheduled day (excluded when
// re-evaluating an edit so the job is not double counted against the cap).
function currentJobMinutesOnDay(job, dateLike) {
  if (!job.scheduled || !job.scheduledStart || !job.scheduledEnd) return 0;
  const start = new Date(job.scheduledStart);
  if (start.toDateString() !== new Date(dateLike).toDateString()) return 0;
  return (new Date(job.scheduledEnd) - start) / 60000;
}


// Same as atDayFrac, but anchored to the calendar day of a given date rather than an offset.
function atDayFracOnDate(date, fractionalHour) {
  const h = Math.floor(fractionalHour);
  const min = Math.round((fractionalHour - h) * 60);
  const d = new Date(date);
  d.setHours(h, min, 0, 0);
  return d;
}


// ---------- Schedule modal ----------

function openScheduleModal(id) {
  const job = appState.requests.find(x => x.id === id);
  if (!job) return;
  schedulingJobId = id;

  document.getElementById('schedTitle').textContent = job.scheduled ? 'Reschedule service' : 'Schedule service';

  const proposed = proposeWindow(job);
  if (proposed) {
    document.getElementById('schedRationale').textContent =
      `Suggested window: ${formatWindowSummary(proposed.start, proposed.end)}. Adjust the fields below or use the suggestion as-is.`;
  } else {
    document.getElementById('schedRationale').textContent =
      `No open window was found in the next ${SCHEDULE_HORIZON_DAYS} days. Enter a window by hand below.`;
  }

  const startInput = document.getElementById('schedStart');
  const endInput = document.getElementById('schedEnd');
  if (job.scheduled && job.scheduledStart && job.scheduledEnd) {
    startInput.value = toDatetimeLocalValue(new Date(job.scheduledStart));
    endInput.value = toDatetimeLocalValue(new Date(job.scheduledEnd));
  } else if (proposed) {
    startInput.value = toDatetimeLocalValue(proposed.start);
    endInput.value = toDatetimeLocalValue(proposed.end);
  } else {
    startInput.value = '';
    endInput.value = '';
  }

  document.getElementById('schedSuggestBtn').classList.toggle('hidden', !proposed);
  refreshScheduleWarnings();
  openModal('scheduleModal');
}


// Fill in the suggested window when the user clicks "Use suggested window".
function applySuggestedWindow() {
  const job = appState.requests.find(x => x.id === schedulingJobId);
  if (!job) return;
  const proposed = proposeWindow(job);
  if (!proposed) return;
  document.getElementById('schedStart').value = toDatetimeLocalValue(proposed.start);
  document.getElementById('schedEnd').value = toDatetimeLocalValue(proposed.end);
  refreshScheduleWarnings();
}


// When the start changes, recompute the end so the window keeps the job's required length.
function onScheduleStartChange() {
  const job = appState.requests.find(x => x.id === schedulingJobId);
  if (!job) return;
  const startVal = document.getElementById('schedStart').value;
  if (!startVal) return;
  const start = new Date(startVal);
  if (isNaN(start)) return;

  const lengthHours = laborMidHours(job);
  const prev = previousJobBefore(start);
  const travelMin = prev && prev.point && job.point ? travelMinutesBetween(prev.point, job.point) : 0;
  const end = new Date(start.getTime() + (lengthHours * 60 + travelMin) * 60 * 1000);
  document.getElementById('schedEnd').value = toDatetimeLocalValue(end);
  refreshScheduleWarnings();
}


// Re-run evaluateWindow against the current form values and render errors/warnings.
function refreshScheduleWarnings() {
  const job = appState.requests.find(x => x.id === schedulingJobId);
  const warnEl = document.getElementById('schedWarn');
  const confirmBtn = document.getElementById('schedConfirmBtn');
  if (!job) { warnEl.innerHTML = ''; return; }

  const startVal = document.getElementById('schedStart').value;
  const endVal = document.getElementById('schedEnd').value;
  if (!startVal || !endVal) {
    warnEl.innerHTML = '';
    confirmBtn.disabled = false;
    return;
  }

  const { errors, warnings } = evaluateWindow(job, new Date(startVal), new Date(endVal));
  const items = [
    ...errors.map(e => `<li style="color:var(--high)">${esc(e)}</li>`),
    ...warnings.map(w => `<li style="color:var(--med-text)">${esc(w)}</li>`)
  ];
  warnEl.innerHTML = items.length
    ? `<ul style="list-style:none;margin:0;padding:0;font-size:.84rem;display:flex;flex-direction:column;gap:4px">${items.join('')}</ul>`
    : '';
  confirmBtn.disabled = errors.length > 0;
}


// Commit the chosen window: mark the job scheduled and move it to the Scheduled screen.
function confirmSchedule() {
  const job = appState.requests.find(x => x.id === schedulingJobId);
  if (!job) return;

  const startVal = document.getElementById('schedStart').value;
  const endVal = document.getElementById('schedEnd').value;
  if (!startVal || !endVal) {
    alert('Enter a start and end time before confirming.');
    return;
  }
  const start = new Date(startVal);
  const end = new Date(endVal);
  const { errors } = evaluateWindow(job, start, end);
  if (errors.length > 0) {
    alert(errors.join(' '));
    return;
  }

  job.scheduled = true;
  job.scheduledStart = start.toISOString();
  job.scheduledEnd = end.toISOString();
  saveData();
  closeModal('scheduleModal');

  appState.currentScreen = 'scheduled';
  if (currentDetailId === job.id) {
    openDetail(job.id);
  } else {
    updateUI();
  }
}


// Clear the window and return the job to the Overview screen.
function unscheduleJob(id) {
  const job = appState.requests.find(x => x.id === id);
  if (!job) return;
  job.scheduled = false;
  job.scheduledStart = null;
  job.scheduledEnd = null;
  saveData();

  appState.currentScreen = 'overview';
  if (currentDetailId === job.id) {
    openDetail(job.id);
  } else {
    updateUI();
  }
}


// ---------- Formatting helpers ----------

// Format a Date as the value a datetime-local input expects (local time, no timezone).
function toDatetimeLocalValue(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}


// Locale fixed to English so weekday and month names never follow the browser/OS locale.
const DATE_LOCALE = 'en-US';


// "Jun 22, 2:30 PM" style display for a request's submitted date.
function formatRequestedDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const day = d.toLocaleDateString(DATE_LOCALE, { month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString(DATE_LOCALE, { hour: 'numeric', minute: '2-digit' });
  return `${day}, ${time}`;
}


// "Mon, Jun 23, 9:00 AM to 11:30 AM" style summary for a scheduled window.
function formatWindowSummary(startIso, endIso) {
  if (!startIso || !endIso) return 'Not scheduled';
  const start = new Date(startIso);
  const end = new Date(endIso);
  const day = start.toLocaleDateString(DATE_LOCALE, { weekday: 'short', month: 'short', day: 'numeric' });
  const startTime = start.toLocaleTimeString(DATE_LOCALE, { hour: 'numeric', minute: '2-digit' });
  const endTime = end.toLocaleTimeString(DATE_LOCALE, { hour: 'numeric', minute: '2-digit' });
  return `${day}, ${startTime} to ${endTime}`;
}


// "2h30min" style duration for a scheduled window.
function formatDuration(startIso, endIso) {
  if (!startIso || !endIso) return '';
  const hrs = (new Date(endIso) - new Date(startIso)) / 3600000;
  return formatHoursMinutes(hrs);
}


// "9:00 AM to 11:30 AM" style time range for the Scheduled screen's table column.
function formatWindowTimeRange(startIso, endIso) {
  if (!startIso || !endIso) return '';
  const start = new Date(startIso);
  const end = new Date(endIso);
  const startTime = start.toLocaleTimeString(DATE_LOCALE, { hour: 'numeric', minute: '2-digit' });
  const endTime = end.toLocaleTimeString(DATE_LOCALE, { hour: 'numeric', minute: '2-digit' });
  return `${startTime} to ${endTime}`;
}


// Convert a fractional-hour number into "#h#min" form (e.g. 4.5 becomes "4h30min", 8 becomes "8h").
function formatHoursMinutes(hours) {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m === 0 ? `${h}h` : `${h}h${m}min`;
}


// "Mon, Jun 23: 3 jobs, 6h30min / 8h30min" style header for a day's group of scheduled jobs.
function formatDayHeader(date, jobCount) {
  const dayLabel = date.toLocaleDateString(DATE_LOCALE, { weekday: 'short', month: 'short', day: 'numeric' });
  const usedHours = dayScheduledMinutes(date) / 60;
  const capHours = appState.settings.dailyCapHours;
  return `${dayLabel}: ${jobCount} job${jobCount > 1 ? 's' : ''}, ${formatHoursMinutes(usedHours)} / ${formatHoursMinutes(capHours)}`;
}


// Build a Google Maps multi-stop directions URL for a day's jobs, in start-time order.
// This "universal" URL format opens the user's installed maps app (or prompts a choice)
// on Android and iOS, and falls back to Google Maps in the browser elsewhere. The base
// address is used as the route's starting point when one is set; the maps app itself
// lets the user change the start once the route opens.
function buildDayMapUrl(jobs) {
  const stops = jobs.filter(j => j.address && j.address.trim()).map(j => j.address.trim());
  if (stops.length === 0) return null;

  const params = new URLSearchParams();
  params.set('api', '1');
  params.set('travelmode', 'driving');

  const baseAddress = appState.settings.baseAddress;
  if (baseAddress) params.set('origin', baseAddress);

  const destination = stops[stops.length - 1];
  params.set('destination', destination);

  const waypoints = stops.slice(0, -1);
  if (waypoints.length > 0) params.set('waypoints', waypoints.join('|'));

  return 'https://www.google.com/maps/dir/?' + params.toString();
}


// ============ GEOGRAPHY ============
function estimateCoordinates(address) {
  if (!address) return null;

  // Simple city-based estimation for demo
  const cityCoords = {
    'carmel': { lat: 39.9784, lng: -86.1180 },
    'westfield': { lat: 40.0428, lng: -86.1275 },
    'fishers': { lat: 39.9568, lng: -85.9686 },
    'noblesville': { lat: 40.0456, lng: -86.0086 },
    'cicero': { lat: 40.1245, lng: -86.0140 },
    'sheridan': { lat: 40.1320, lng: -86.2210 },
    'arcadia': { lat: 40.1760, lng: -86.0230 }
  };

  const lower = address.toLowerCase();
  for (const [city, coords] of Object.entries(cityCoords)) {
    if (lower.includes(city)) return coords;
  }

  return { lat: 40.0, lng: -86.1 }; // Default central Indiana
}


function straightLineMiles(a, b) {
  if (!a || !b) return 0;
  const R = 3958.8;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}


function distanceAndEta(point) {
  if (!point || !appState.settings.baseCoordinates) return null;
  const straight = straightLineMiles(appState.settings.baseCoordinates, point);
  const roadMiles = straight * 1.3;
  const minutes = Math.max(4, Math.round(roadMiles / 32 * 60));
  return { miles: roadMiles, minutes };
}


// ============ MODAL MANAGEMENT ============
function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
}


function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}


// ============ UTILITIES ============
function esc(s) {
  if (!s) return '';
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}


// Made with Bob
