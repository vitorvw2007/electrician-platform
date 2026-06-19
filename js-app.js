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
    businessHours: '8:00 AM - 5:00 PM'
  },
  calendar: []
};


// ============ INITIALIZATION ============
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  loadData();
  initializeEventListeners();
  updateUI();
});


function initializeEventListeners() {
  document.getElementById('baseChip').addEventListener('click', () => openModal('settingsModal'));
  document.getElementById('importBtn').addEventListener('click', () => openModal('importModal'));
  document.getElementById('exportBtn').addEventListener('click', exportData);
}


// ============ SETTINGS MANAGEMENT ============
function loadSettings() {
  const saved = localStorage.getItem('electrician_settings');
  if (saved) {
    appState.settings = { ...appState.settings, ...JSON.parse(saved) };
  }
  updateBaseLabel();
}


function saveSettings() {
  const businessName = document.getElementById('businessName').value;
  const baseAddress = document.getElementById('baseAddress').value;

  appState.settings.businessName = businessName || appState.settings.businessName;
  appState.settings.baseAddress = baseAddress || appState.settings.baseAddress;

  // Geocode address (simplified - in production use a real geocoding API)
  if (baseAddress) {
    appState.settings.baseCoordinates = estimateCoordinates(baseAddress);
  }

  localStorage.setItem('electrician_settings', JSON.stringify(appState.settings));
  updateBaseLabel();
  closeModal('settingsModal');

  // Recalculate distances if we have requests
  if (appState.requests.length > 0) {
    updateUI();
  }
}


function updateBaseLabel() {
  const label = appState.settings.baseAddress || 'Not set';
  document.getElementById('baseLabel').textContent = label;

  // Pre-fill settings modal
  document.getElementById('businessName').value = appState.settings.businessName;
  document.getElementById('baseAddress').value = appState.settings.baseAddress;
}


// ============ DATA MANAGEMENT ============
function loadData() {
  const saved = localStorage.getItem('electrician_requests');
  if (saved) {
    appState.requests = JSON.parse(saved);
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
  const messageIdx = headers.findIndex(h => h.includes('description') || h.includes('problem') || h.includes('message'));

  if (messageIdx === -1) {
    throw new Error('Could not find problem description column');
  }

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length < headers.length) continue;

    const request = {
      id: Date.now() + i,
      name: nameIdx >= 0 ? values[nameIdx]?.trim() : '',
      phone: phoneIdx >= 0 ? values[phoneIdx]?.trim() : '',
      email: emailIdx >= 0 ? values[emailIdx]?.trim() : '',
      address: addressIdx >= 0 ? values[addressIdx]?.trim() : '',
      message: messageIdx >= 0 ? values[messageIdx]?.trim() : ''
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


function confirmImport() {
  if (!pendingCSVData) return;

  appState.requests = pendingCSVData;
  saveData();
  updateUI();
  closeModal('importModal');

  // Reset import state
  pendingCSVData = null;
  document.getElementById('csvFile').value = '';
  document.getElementById('importPreview').classList.add('hidden');
  document.getElementById('confirmImport').disabled = true;
}


// ============ DATA EXPORT ============
function exportData() {
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


// ============ UI RENDERING ============
function updateUI() {
  if (appState.requests.length === 0) {
    document.getElementById('emptyState').classList.remove('hidden');
    document.getElementById('dataView').classList.add('hidden');
  } else {
    document.getElementById('emptyState').classList.add('hidden');
    document.getElementById('dataView').classList.remove('hidden');
    renderSummary();
    renderRows();
  }
}


function renderSummary() {
  const counts = { high: 0, medium: 0, low: 0 };
  appState.requests.forEach(r => counts[r.urgency]++);

  document.getElementById('summary').innerHTML = `
    <div class="stat"><div class="n">${appState.requests.length}</div><div class="l">Total requests</div></div>
    <div class="stat"><div class="n">${counts.high}</div><div class="l"><span class="dot high"></span>High urgency</div></div>
    <div class="stat"><div class="n">${counts.medium}</div><div class="l"><span class="dot med"></span>Medium urgency</div></div>
    <div class="stat"><div class="n">${counts.low}</div><div class="l"><span class="dot low"></span>Low urgency</div></div>
  `;
}


function renderRows() {
  const URGENCY_RANK = { high: 0, medium: 1, low: 2 };
  const URG_LABEL = { high: 'High', medium: 'Medium', low: 'Low' };
  const URG_CLASS = { high: 'high', medium: 'med', low: 'low' };

  const sorted = [...appState.requests].sort((a, b) =>
    URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency]
  );

  const tbody = document.getElementById('rows');
  tbody.innerHTML = '';

  sorted.forEach(r => {
    const tr = document.createElement('tr');
    tr.className = 'u-' + URG_CLASS[r.urgency];
    tr.tabIndex = 0;
    tr.setAttribute('role', 'button');
    tr.setAttribute('aria-label', `Open job summary for ${r.jobType}`);

    tr.innerHTML = `
      <td class="job">${esc(r.jobType)}
        <span class="sub"><span class="pill ${URG_CLASS[r.urgency]}">${URG_LABEL[r.urgency]} urgency</span></span>
      </td>
      <td>${esc(r.partOfHouse)}</td>
      <td class="mono">${r.inScope === false ? '<span class="missing">N/A</span>' : r.laborMin + '-' + r.laborMax + ' hrs'}</td>
      <td>${r.name ? esc(r.name) : '<span class="missing">Not provided</span>'}</td>
      <td class="mono">${r.phone ? esc(r.phone) : '<span class="missing">Not provided</span>'}</td>
      <td class="mono">${r.email ? esc(r.email) : '<span class="missing">Not provided</span>'}</td>
    `;

    tr.addEventListener('click', () => openDetail(r.id));
    tr.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openDetail(r.id);
      }
    });

    tbody.appendChild(tr);
  });
}


// ============ DETAIL VIEW ============
function openDetail(id) {
  const r = appState.requests.find(x => x.id === id);
  if (!r) return;

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

  document.getElementById('detail').innerHTML = `
    <button class="back" id="backBtn">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      Back to all requests
    </button>


    <div class="detail-head u-${uc}">
      <div>
        <p class="eyebrow">Service request detail</p>
        <h2>${esc(r.jobType)}</h2>
        <div class="where">${esc(r.partOfHouse)} · ${r.name ? esc(r.name) : 'Customer name not provided'}</div>
      </div>
      <span class="pill ${uc}" style="font-size:.82rem;padding:6px 14px">${urgLabel} urgency</span>
    </div>


    <div class="grid">
      <div class="card">
        <h3><span class="num">1</span> Job & customer</h3>
        <dl class="kv">
          <dt>Customer</dt><dd>${r.name ? esc(r.name) : '<span class="missing">Not provided</span>'}</dd>
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

  document.getElementById('backBtn').addEventListener('click', showOverview);
  document.getElementById('overview').classList.add('hidden');
  document.getElementById('detail').classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}


// Navigate to a nearby request's detail page
function openNearbyJob(requestId, event) {
  if (event) event.stopPropagation();
  // Inline onclick passes the id as a string; stored request ids are numbers.
  const req = appState.requests.find(x => String(x.id) === String(requestId));
  if (req) openDetail(req.id);
}


function showOverview() {
  document.getElementById('detail').classList.add('hidden');
  document.getElementById('overview').classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}


// ============ CALENDAR & SCHEDULING ============
const BUSINESS_START = 8, BUSINESS_END = 17;
const LUNCH_START = 12, LUNCH_END = 13;


function atDay(offset, hour, min) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(hour, min || 0, 0, 0);
  return d;
}


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
  if (cursor.getHours() < BUSINESS_START) cursor.setHours(BUSINESS_START, 0, 0, 0);

  for (let day = 0; day < 14 && slots.length < count; day++) {
    const dayStart = atDay(day, BUSINESS_START, 0);
    const dayEnd = atDay(day, BUSINESS_END, 0);
    const dow = dayStart.getDay();
    if (dow === 0 || dow === 6) continue;

    const busy = [{ start: atDay(day, LUNCH_START, 0), end: atDay(day, LUNCH_END, 0) }];
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
  const day = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${day}, ${time}`;
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
