/**
 * INFERENCE ENGINE  (v2)  ----  RESIDENTIAL ELECTRICAL REPAIR KNOWLEDGE BASE
 *
 * Acts as the offline "brain" for the dispatch platform. It reads a customer's
 * free-text message and infers:
 *    jobType, partOfHouse, urgency, laborEstimate, materials, tools, uncertainties
 *
 * Design:
 *  - SCOPE: residential FIXING / REPAIRS only. New installations or projects
 *    (e.g. "install new outdoor lights") are flagged "out of repair scope":
 *    urgency and part of house are still inferred, but materials, tools, labor,
 *    and uncertainties are left empty.
 *  - MATCHING: every service is scored against the message (multi-word phrases
 *    weigh more); the highest-scoring service wins.
 *  - SAFETY OVERRIDE: hazard / emergency words force urgency to "high" no matter
 *    what service matched.
 *  - NO GUESSING: if the message is too vague to classify, jobType comes back as
 *    "Not determined" and the gap is added to the uncertainties list rather than
 *    inventing a service.
 *
 * Output contract is identical to v1 (plus an added boolean `inScope`), so the
 * existing app.js keeps working without changes.
 */

const InferenceEngine = (function () {

  const VERSION = 2;

  // ---------- small helpers ----------
  const m = (name, prob) => ({ name, prob });            // material with likelihood
  const has = (msg, list) => list.some(w => msg.includes(w));
  const val = (s) => !!(s && String(s).trim() !== '');

  const URG_RANK = { low: 0, medium: 1, high: 2 };
  const higherUrgency = (a, b) => (URG_RANK[a] >= URG_RANK[b] ? a : b);

  // Tools present on essentially every residential call
  const BASIC_TOOLS = [
    'Voltage tester / multimeter',
    'Insulated screwdrivers',
    'Wire strippers',
    'Lineman pliers',
    'Flashlight or headlamp'
  ];

  // ---------- urgency signal words ----------
  // Hazard / emergency words trigger the safety override (force "high").
  const HAZARD_WORDS = [
    'spark', 'sparking', 'sparks', 'sparked',
    'smoke', 'smoking', 'smell of burning', 'burning smell', 'burning', 'burnt',
    'fire', 'flame', 'flames',
    'melt', 'melted', 'melting', 'scorch', 'scorched', 'charred',
    'shock', 'shocked', 'shocking', 'electrocut', 'tingle', 'tingling',
    'arcing', 'arc fault',
    'hot to touch', 'too hot', 'getting hot', 'warm to touch', 'overheat'
  ];
  const EMERGENCY_WORDS = [
    'no power', 'lost power', 'power out', 'power is out', 'no electricity',
    'outage', 'emergency', 'urgent', 'asap', 'right away', 'right now',
    'immediately', 'today', 'tonight', 'no hot water', 'no heat', 'no ac',
    'no a/c', 'flooding', 'flooded'
  ];
  const MEDIUM_WORDS = [
    'intermittent', 'sometimes', 'occasionally', 'flicker', 'flickering',
    'tripping', 'keeps tripping', 'trips', 'this week', 'soon', 'multiple',
    'several', 'buzzing', 'humming', 'crackling', 'dim', 'dimming'
  ];

  function signalUrgency(message) {
    if (has(message, HAZARD_WORDS) || has(message, EMERGENCY_WORDS)) return 'high';
    if (has(message, MEDIUM_WORDS)) return 'medium';
    return 'low';
  }
  function safetyFlagged(message) {
    return has(message, HAZARD_WORDS) || has(message, EMERGENCY_WORDS);
  }

  // ---------- location inference ----------
  const LOCATIONS = [
    'master bedroom', 'guest bedroom', 'living room', 'dining room', 'family room',
    'laundry room', 'utility room', 'crawl space', 'front yard', 'back yard', 'backyard',
    'kitchen', 'bathroom', 'bedroom', 'basement', 'attic', 'garage', 'laundry',
    'hallway', 'stairway', 'closet', 'mudroom', 'foyer', 'entryway', 'office', 'den',
    'sunroom', 'porch', 'patio', 'deck', 'driveway', 'pantry', 'nursery', 'workshop',
    'shed', 'exterior', 'outdoor', 'outside'
  ];
  const WET_LOCATIONS = [
    'kitchen', 'bathroom', 'outdoor', 'outside', 'exterior', 'garage', 'laundry',
    'basement', 'patio', 'porch', 'deck', 'pool', 'spa', 'hot tub', 'driveway'
  ];

  function inferLocation(message) {
    for (const loc of LOCATIONS) {
      if (message.includes(loc)) {
        if (loc === 'outside' || loc === 'exterior') return 'Outdoor';
        if (loc === 'laundry') return 'Laundry room';
        if (loc === 'backyard') return 'Back yard';
        return loc.charAt(0).toUpperCase() + loc.slice(1);
      }
    }
    if (message.includes('first floor') || message.includes('1st floor')) return 'First floor';
    if (message.includes('second floor') || message.includes('2nd floor')) return 'Second floor';
    if (message.includes('third floor') || message.includes('3rd floor')) return 'Third floor';
    if (message.includes('whole house') || message.includes('entire house')) return 'Whole house';
    return 'Not specified';
  }

  // ---------- in-scope (repair) vs out-of-scope (new install/project) ----------
  // Repair signals: something exists and is broken / misbehaving.
  const REPAIR_SIGNALS = [
    'fix', 'repair', 'broken', 'break', 'not working', 'stopped working', 'stopped',
    'doesnt work', 'does not work', 'wont work', 'will not work', 'dead', 'no power',
    'tripping', 'trips', 'flicker', 'flickering', 'spark', 'sparking', 'smoke',
    'burning', 'buzzing', 'humming', 'loose', 'damaged', 'damage', 'shock', 'problem',
    'issue', 'malfunction', 'failed', 'failing', 'quit', 'wont turn on', 'wont reset',
    'reset', 'keeps', 'overheat', 'melted', 'exposed', 'chewed', 'rusted', 'corroded',
    'water damage', 'leaking', 'replace', 'replacing', 'wont stay', 'cuts out', 'went out'
  ];
  // New-install / project signals (a NEW thing being added).
  const INSTALL_SIGNALS = [
    'install', 'installation', 'installing', 'put in', 'add a', 'add an', 'adding',
    'set up', 'setting up', 'run a new', 'run new', 'wire up', 'wire in', 'mount a new',
    'would like to add', 'want to add', 'like to add', 'looking to add', 'looking to install',
    'have installed', 'new outlet', 'new light', 'new fixture', 'new circuit',
    'new fan', 'new panel', 'brand new'
  ];

  function isOutOfScope(message) {
    const repair = REPAIR_SIGNALS.some(w => message.includes(w));
    const install = INSTALL_SIGNALS.some(w => message.includes(w));
    // Out of scope only when it's clearly a NEW install/project AND nothing is
    // described as broken. If anything is broken, it's a repair (in scope).
    return install && !repair;
  }

  // Subject detection (for labeling out-of-scope jobs nicely)
  const SUBJECTS = [
    { kw: ['ev charger', 'car charger', 'tesla'], label: 'EV charger' },
    { kw: ['hot tub', 'spa', 'jacuzzi'], label: 'hot tub circuit' },
    { kw: ['generator', 'transfer switch'], label: 'generator' },
    { kw: ['pool'], label: 'pool wiring' },
    { kw: ['recessed', 'can light', 'pot light'], label: 'recessed lighting' },
    { kw: ['chandelier'], label: 'chandelier' },
    { kw: ['under cabinet', 'undercabinet', 'under-cabinet'], label: 'under-cabinet lighting' },
    { kw: ['landscape', 'outdoor light', 'exterior light', 'porch light', 'flood light', 'security light'], label: 'outdoor lighting' },
    { kw: ['ceiling fan', 'fan'], label: 'ceiling fan' },
    { kw: ['light', 'fixture', 'lighting'], label: 'lighting' },
    { kw: ['switch', 'dimmer'], label: 'switch' },
    { kw: ['outlet', 'receptacle', 'plug'], label: 'outlet' },
    { kw: ['subpanel', 'sub panel', 'panel', 'breaker box'], label: 'panel' },
    { kw: ['doorbell'], label: 'doorbell' },
    { kw: ['thermostat'], label: 'thermostat' },
    { kw: ['smoke', 'carbon monoxide', 'co detector'], label: 'detector' },
    { kw: ['smart', 'automation'], label: 'smart-home wiring' }
  ];
  function detectSubject(message) {
    for (const s of SUBJECTS) if (s.kw.some(k => message.includes(k))) return s.label;
    return null;
  }

  // ===================================================================
  //  SERVICE CATALOG  (residential repairs/fixes only)
  //  Hazard / safety services are listed FIRST so they win on score ties.
  //  cat is used for the contextual GFCI rule; keywords are apostrophe-free
  //  where possible so messy messages ("wont","doesnt") still match.
  // ===================================================================
  const SERVICES = [

    // ---------- SAFETY / HAZARD ----------
    {
      id: 'burning_smell', cat: 'hazard', name: 'Burning smell or smoke (electrical hazard)',
      keywords: ['burning smell', 'smell of burning', 'burning', 'burnt', 'smoke', 'smoking', 'scorched', 'charred'],
      urgency: 'high', labor: { min: 1, max: 3 },
      materials: [m('Replacement device or wiring section (after diagnosis)', 'likely'), m('Wire connectors', 'surely')],
      tools: ['Infrared / thermal thermometer', 'Multimeter'],
      questions: {
        phoneCall: ['Is there active smoke or flame right now? If so, advise turning off the main breaker and calling 911', 'Which device, room, or area is the smell coming from?'],
        onSite: ['Locate and de-energize the affected circuit before opening anything', 'Inspect for charred insulation or overheated connections']
      }
    },
    {
      id: 'sparking', cat: 'hazard', name: 'Sparking outlet, switch, or panel (hazard)',
      keywords: ['spark', 'sparking', 'sparks', 'sparked', 'arcing', 'arc fault'],
      urgency: 'high', labor: { min: 1, max: 3 },
      materials: [m('Replacement receptacle or switch', 'likely'), m('Wire connectors', 'surely'), m('Wall plate', 'likely')],
      tools: ['Multimeter'],
      questions: {
        phoneCall: ['Where exactly is the sparking (which outlet, switch, or the panel)?', 'Advise the customer to stop using that device until inspected'],
        onSite: ['De-energize and confirm dead with a meter before touching', 'Check for loose terminations and damaged conductors']
      }
    },
    {
      id: 'shock', cat: 'hazard', name: 'Electrical shock or tingling (hazard)',
      keywords: ['shock', 'shocked', 'getting shocked', 'electrocut', 'tingle', 'tingling', 'zap', 'zapped'],
      urgency: 'high', labor: { min: 2, max: 4 },
      materials: [m('Grounding / bonding hardware', 'likely'), m('Replacement device', 'likely'), m('Wire connectors', 'surely')],
      tools: ['Multimeter', 'Outlet / ground tester'],
      questions: {
        phoneCall: ['What were you touching when you felt the shock (an outlet, appliance, faucet, etc.)?', 'Advise the customer to avoid that point until inspected'],
        onSite: ['Test for voltage on metal surfaces and verify grounding', 'Check for a hot/ground reversal or open ground']
      }
    },
    {
      id: 'overheating', cat: 'hazard', name: 'Hot or overheating outlet, switch, or wire (hazard)',
      keywords: ['hot to touch', 'too hot', 'getting hot', 'warm to touch', 'feels warm', 'feels hot', 'warm outlet', 'smells funny', 'smells hot', 'overheat', 'overheating', 'melted', 'melting'],
      urgency: 'high', labor: { min: 1, max: 3 },
      materials: [m('Replacement receptacle or switch', 'likely'), m('Wire connectors', 'surely')],
      tools: ['Infrared / thermal thermometer', 'Multimeter'],
      questions: {
        phoneCall: ['Which device is hot, and what is plugged into it?', 'Advise unplugging loads from that device until inspected'],
        onSite: ['Check for loose or undersized connections causing heat', 'Verify the load does not exceed the circuit rating']
      }
    },
    {
      id: 'panel_noise', cat: 'panel', name: 'Buzzing or humming from panel or wall (hazard)',
      keywords: ['buzzing', 'humming', 'crackling', 'sizzling', 'panel noise'],
      urgency: 'high', labor: { min: 1, max: 3 },
      materials: [m('Replacement breaker', 'likely'), m('Wire connectors', 'likely')],
      tools: ['Multimeter', 'Torque screwdriver'],
      questions: {
        phoneCall: ['Is the noise coming from the breaker panel or from inside a wall?', 'Is any breaker warm or discolored?'],
        onSite: ['Locate the source; a buzzing breaker often needs replacement', 'Torque-check terminations']
      }
    },

    // ---------- WHOLE-HOUSE / POWER ----------
    {
      id: 'no_power_house', cat: 'power', name: 'No power to the whole house',
      keywords: ['no power', 'whole house', 'entire house', 'no electricity', 'power out', 'power is out', 'house has no power'],
      urgency: 'high', labor: { min: 1, max: 3 },
      materials: [m('Main breaker (if faulty)', 'maybe'), m('Wire connectors', 'likely')],
      tools: ['Multimeter'],
      questions: {
        phoneCall: ['Are the neighbors also out? (points to a utility outage, not your wiring)', 'Have you checked the main breaker?'],
        onSite: ['Test for voltage at the meter and main', 'Determine if the issue is utility-side or panel-side']
      }
    },
    {
      id: 'partial_power', cat: 'power', name: 'Partial power loss (part of the house)',
      keywords: ['partial power', 'half the house', 'half my house', 'some outlets', 'part of the house', 'lost power to', 'half power', 'one side'],
      urgency: 'high', labor: { min: 2, max: 4 },
      materials: [m('Replacement breaker', 'maybe'), m('Wire connectors', 'likely')],
      tools: ['Multimeter'],
      questions: {
        phoneCall: ['Which rooms or circuits are affected?', 'Have you checked and reset the breakers for those areas?'],
        onSite: ['Check for a lost line / open neutral at the panel', 'Test affected circuits for voltage']
      }
    },
    {
      id: 'lights_dim_brownout', cat: 'power', name: 'Lights dimming or browning out',
      keywords: ['lights dim', 'dimming', 'brownout', 'browning out', 'dim when', 'lights flicker when', 'voltage drop'],
      urgency: 'medium', labor: { min: 2, max: 4 },
      materials: [m('Wire connectors', 'likely')],
      tools: ['Multimeter', 'Torque screwdriver'],
      questions: {
        phoneCall: ['Does it happen when a large appliance turns on (AC, dryer, microwave)?', 'Whole house or specific rooms?'],
        onSite: ['Check main lugs and neutral for loose / corroded connections', 'Measure voltage under load']
      }
    },
    {
      id: 'power_surge', cat: 'power', name: 'Power surge damage investigation',
      keywords: ['power surge', 'surge', 'after the storm', 'after a storm', 'lightning'],
      urgency: 'medium', labor: { min: 1, max: 3 },
      materials: [m('Replacement devices (as needed)', 'maybe'), m('Whole-home surge protector', 'maybe')],
      tools: ['Multimeter'],
      questions: {
        phoneCall: ['What stopped working after the surge?', 'Did a breaker trip during the event?'],
        onSite: ['Test affected circuits and devices', 'Inspect panel for surge damage']
      }
    },

    // ---------- OUTLETS ----------
    {
      id: 'dead_outlet', cat: 'outlet', name: 'Outlet not working / dead outlet',
      keywords: ['outlet not working', 'outlet stopped', 'dead outlet', 'outlet dead', 'no power to outlet', 'outlet quit', 'receptacle not working', 'plug not working', 'socket not working', 'outlet out'],
      urgency: 'medium', labor: { min: 1, max: 2 },
      materials: [m('Replacement receptacle', 'likely'), m('Wire connectors', 'surely'), m('Wall plate', 'likely')],
      tools: ['Outlet tester'],
      questions: {
        phoneCall: ['Is it one outlet or several?', 'Is the outlet controlled by a wall switch?'],
        onSite: ['Check whether an upstream GFCI or tripped breaker is the cause', 'Verify wiring and connections at the device']
      }
    },
    {
      id: 'gfci_trip', cat: 'outlet', name: 'GFCI outlet tripping or will not reset',
      keywords: ['gfci', 'ground fault', 'reset button', 'wont reset', 'keeps tripping outlet', 'gfci trips', 'test reset'],
      urgency: 'medium', labor: { min: 1, max: 2 },
      materials: [m('GFCI receptacle', 'surely'), m('Wire connectors', 'surely'), m('Wall plate', 'likely')],
      tools: ['Outlet / GFCI tester'],
      questions: {
        phoneCall: ['Does it trip constantly or only sometimes (e.g. when it rains)?', 'Which outlets go dead when it trips?'],
        onSite: ['Isolate the downstream fault vs a failed GFCI device', 'Check for moisture in wet-location boxes']
      }
    },
    {
      id: 'loose_outlet', cat: 'outlet', name: 'Loose or damaged outlet (will not hold plug)',
      keywords: ['loose outlet', 'outlet loose', 'wont hold plug', 'plug falls out', 'cracked outlet', 'broken outlet', 'outlet broken', 'wobbly outlet'],
      urgency: 'low', labor: { min: 1, max: 2 },
      materials: [m('Replacement receptacle', 'surely'), m('Wall plate', 'likely'), m('Wire connectors', 'likely')],
      tools: ['Outlet tester'],
      questions: {
        phoneCall: ['Is the outlet face cracked or just loose in the wall?'],
        onSite: ['Check box mounting and device condition', 'Inspect terminals for damage']
      }
    },
    {
      id: 'outdoor_outlet', cat: 'outlet', name: 'Outdoor outlet not working',
      keywords: ['outdoor outlet', 'exterior outlet', 'outside outlet', 'outlet outside', 'patio outlet', 'garage outlet'],
      urgency: 'medium', labor: { min: 1, max: 2 },
      materials: [m('Weather-resistant GFCI receptacle', 'surely'), m('In-use weatherproof cover', 'likely'), m('Wire connectors', 'surely')],
      tools: ['Outlet / GFCI tester'],
      questions: {
        phoneCall: ['Is there a GFCI nearby (garage, bathroom) that may have tripped?', 'Did it stop after rain?'],
        onSite: ['Check for moisture intrusion and a tripped upstream GFCI', 'Verify weatherproof cover and seal']
      }
    },

    // ---------- SWITCHES ----------
    {
      id: 'switch_dead', cat: 'switch', name: 'Light switch not working',
      keywords: ['switch not working', 'switch stopped', 'light switch', 'dead switch', 'broken switch', 'switch broken', 'switch wont', 'switch does nothing'],
      urgency: 'low', labor: { min: 1, max: 2 },
      materials: [m('Replacement switch', 'likely'), m('Wall plate', 'likely'), m('Wire connectors', 'surely')],
      tools: [],
      questions: {
        phoneCall: ['Does the switch feel loose or make a noise?', 'What does it control?'],
        onSite: ['Test switch and verify load wiring', 'Check for loose connections']
      }
    },
    {
      id: 'dimmer', cat: 'switch', name: 'Dimmer switch not working or buzzing',
      keywords: ['dimmer', 'dimmer switch', 'dimmer buzz', 'dimmer not working'],
      urgency: 'low', labor: { min: 1, max: 2 },
      materials: [m('LED-compatible dimmer', 'surely'), m('Wall plate', 'likely')],
      tools: [],
      questions: {
        phoneCall: ['Are the bulbs LED? (old dimmers buzz/flicker with LEDs)', 'How many bulbs are on the dimmer?'],
        onSite: ['Confirm dimmer is rated for the LED load', 'Verify neutral availability if a smart dimmer is wanted later']
      }
    },
    {
      id: 'three_way', cat: 'switch', name: 'Three-way switch not working correctly',
      keywords: ['three way', '3-way', '3 way', 'two switches', 'switch at top and bottom', 'one switch controls'],
      urgency: 'medium', labor: { min: 2, max: 4 },
      materials: [m('3-way switches', 'likely'), m('Wire connectors', 'surely')],
      tools: ['Multimeter'],
      questions: {
        phoneCall: ['Do both switches fail, or only one position?'],
        onSite: ['Trace traveler wiring between the two switches', 'Verify correct common terminal connections']
      }
    },
    {
      id: 'smart_switch', cat: 'switch', name: 'Smart switch malfunction',
      keywords: ['smart switch', 'wifi switch', 'smart light not', 'app wont control', 'smart dimmer not'],
      urgency: 'low', labor: { min: 1, max: 2 },
      materials: [m('Replacement smart switch', 'maybe'), m('Neutral pigtail (if needed)', 'maybe')],
      tools: [],
      questions: {
        phoneCall: ['Is it a wiring issue or an app/network issue?', 'Does the load work when controlled manually?'],
        onSite: ['Confirm neutral present at the box', 'Verify line/load wiring matches the device']
      }
    },

    // ---------- LIGHTING ----------
    {
      id: 'flickering', cat: 'lighting', name: 'Lights flickering',
      keywords: ['flicker', 'flickering', 'lights blink', 'blinking lights', 'lights pulse'],
      urgency: 'medium', labor: { min: 2, max: 4 },
      materials: [m('Wire connectors', 'likely'), m('Replacement bulbs / dimmer (as needed)', 'maybe')],
      tools: ['Multimeter', 'Torque screwdriver'],
      questions: {
        phoneCall: ['One fixture or multiple? (whole-house flicker can be a service issue)', 'LED bulbs on an older dimmer?'],
        onSite: ['Check for loose connections at fixtures and panel', 'Test voltage stability; inspect service if whole-house']
      }
    },
    {
      id: 'fixture_dead', cat: 'lighting', name: 'Light fixture not working',
      keywords: ['light not working', 'fixture not working', 'light wont turn on', 'light out', 'lights out', 'fixture dead', 'no light', 'light stopped', 'ceiling light not', 'chandelier'],
      urgency: 'low', labor: { min: 1, max: 3 },
      materials: [m('Wire connectors', 'likely'), m('Replacement fixture or socket', 'maybe'), m('Mounting hardware', 'maybe')],
      tools: ['Ladder'],
      questions: {
        phoneCall: ['Have you tried new bulbs?', 'Is it controlled by a switch that might be faulty?'],
        onSite: ['Test switch, fixture, and supply voltage', 'Check fixture socket and connections']
      }
    },
    {
      id: 'recessed', cat: 'lighting', name: 'Recessed lights out or cycling off',
      keywords: ['recessed', 'can light', 'pot light', 'can lights', 'recessed light', 'downlight'],
      urgency: 'low', labor: { min: 2, max: 4 },
      materials: [m('LED trim / retrofit module', 'maybe'), m('Wire connectors', 'likely')],
      tools: ['Ladder'],
      questions: {
        phoneCall: ['Do they cut out then come back? (thermal cutoff is common)', 'One light or several?'],
        onSite: ['Check for overheating cutoff with non-rated bulbs', 'Verify connections in each housing']
      }
    },
    {
      id: 'bulbs_burnout', cat: 'lighting', name: 'Bulbs burning out too quickly',
      keywords: ['bulbs burn out', 'burning out quickly', 'bulbs keep', 'keep replacing bulbs', 'bulb keeps', 'bulbs dont last'],
      urgency: 'medium', labor: { min: 1, max: 3 },
      materials: [m('Replacement fixture or socket (if damaged)', 'maybe'), m('Wire connectors', 'likely')],
      tools: ['Multimeter'],
      questions: {
        phoneCall: ['Which fixtures? How often do bulbs fail?', 'What bulb type and wattage?'],
        onSite: ['Check for overvoltage or loose neutral', 'Inspect fixture for heat damage or vibration']
      }
    },
    {
      id: 'outdoor_light', cat: 'lighting', name: 'Outdoor or porch light not working',
      keywords: ['porch light', 'outdoor light', 'exterior light', 'flood light', 'floodlight', 'security light', 'yard light', 'garage light'],
      urgency: 'low', labor: { min: 1, max: 3 },
      materials: [m('Weather-resistant components', 'maybe'), m('Wire connectors', 'likely'), m('Photocell (if dusk-to-dawn)', 'maybe')],
      tools: ['Ladder'],
      questions: {
        phoneCall: ['Is it on a switch, timer, or dusk-to-dawn sensor?'],
        onSite: ['Test switch/photocell and supply', 'Check for moisture in the fixture']
      }
    },
    {
      id: 'motion_light', cat: 'lighting', name: 'Motion sensor light malfunction',
      keywords: ['motion light', 'motion sensor', 'sensor light', 'motion detector light', 'wont shut off', 'stays on'],
      urgency: 'low', labor: { min: 1, max: 2 },
      materials: [m('Replacement motion sensor / fixture', 'maybe')],
      tools: ['Ladder'],
      questions: {
        phoneCall: ['Does it stay on, stay off, or trigger randomly?'],
        onSite: ['Check sensor settings and wiring', 'Verify the override switch position']
      }
    },
    {
      id: 'undercabinet', cat: 'lighting', name: 'Under-cabinet lighting failure',
      keywords: ['under cabinet', 'undercabinet', 'under-cabinet', 'cabinet lights'],
      urgency: 'low', labor: { min: 1, max: 3 },
      materials: [m('LED strip / puck section', 'maybe'), m('Driver / transformer', 'maybe'), m('Wire connectors', 'likely')],
      tools: [],
      questions: {
        phoneCall: ['Is it one section out or all of them?', 'Plug-in or hardwired?'],
        onSite: ['Test driver/transformer output', 'Check low-voltage connections']
      }
    },

    // ---------- CEILING FANS ----------
    {
      id: 'fan_dead', cat: 'fan', name: 'Ceiling fan not working',
      keywords: ['ceiling fan', 'ceiling fan not', 'fan not working', 'fan wont', 'fan stopped', 'fan dead', 'fan wont turn'],
      urgency: 'low', labor: { min: 1, max: 3 },
      materials: [m('Replacement pull chain / switch', 'maybe'), m('Capacitor', 'maybe'), m('Wire connectors', 'likely')],
      tools: ['Ladder'],
      questions: {
        phoneCall: ['Does the light work but not the fan, or neither?', 'Remote-controlled or wall switch?'],
        onSite: ['Test switch, capacitor, and motor', 'Check wiring at the canopy']
      }
    },
    {
      id: 'fan_wobble', cat: 'fan', name: 'Ceiling fan wobbling or noisy',
      keywords: ['ceiling fan', 'fan wobble', 'wobbling', 'fan noise', 'fan noisy', 'fan shakes', 'fan rattle', 'fan rattling'],
      urgency: 'low', labor: { min: 1, max: 2 },
      materials: [m('Fan-rated box (if not present)', 'maybe'), m('Balancing kit', 'likely'), m('Mounting hardware', 'likely')],
      tools: ['Ladder'],
      questions: {
        phoneCall: ['Has it always wobbled or did it start recently?'],
        onSite: ['Verify the box is fan-rated and secure', 'Balance blades; check for warped blades']
      }
    },
    {
      id: 'fan_light', cat: 'fan', name: 'Ceiling fan light not working',
      keywords: ['ceiling fan', 'fan light', 'fan light not', 'light on fan'],
      urgency: 'low', labor: { min: 1, max: 2 },
      materials: [m('Light kit / socket', 'maybe'), m('Wire connectors', 'likely')],
      tools: ['Ladder'],
      questions: {
        phoneCall: ['Fan works but light does not?', 'Tried new bulbs?'],
        onSite: ['Test light kit wiring and socket', 'Check remote/receiver if present']
      }
    },

    // ---------- PANELS / BREAKERS ----------
    {
      id: 'breaker_trips', cat: 'panel', name: 'Breaker keeps tripping',
      keywords: ['breaker trip', 'breaker keeps', 'keeps tripping', 'breaker tripping', 'tripping breaker', 'circuit keeps', 'breaker pops'],
      urgency: 'medium', labor: { min: 2, max: 4 },
      materials: [m('Replacement breaker (if faulty)', 'maybe'), m('Wire connectors', 'likely')],
      tools: ['Multimeter', 'Clamp meter'],
      questions: {
        phoneCall: ['How often does it trip, and immediately or after a while?', 'What is plugged into that circuit?'],
        onSite: ['Test for short, ground fault, or overload', 'Measure actual load on the circuit']
      }
    },
    {
      id: 'breaker_no_reset', cat: 'panel', name: 'Breaker will not reset',
      keywords: ['breaker wont reset', 'wont reset', 'breaker stuck', 'breaker not reset', 'cant reset breaker'],
      urgency: 'high', labor: { min: 2, max: 4 },
      materials: [m('Replacement breaker', 'likely'), m('Wire connectors', 'likely')],
      tools: ['Multimeter', 'Torque screwdriver'],
      questions: {
        phoneCall: ['Does it trip instantly when you try to reset it?', 'Anything unusual happen before it failed?'],
        onSite: ['Isolate a dead short on the circuit', 'Test the breaker itself for failure']
      }
    },
    {
      id: 'fuse_blows', cat: 'panel', name: 'Fuse keeps blowing',
      keywords: ['fuse blow', 'fuse keeps', 'blown fuse', 'blowing fuses', 'fuse box'],
      urgency: 'medium', labor: { min: 2, max: 4 },
      materials: [m('Correct-rated fuses', 'surely'), m('Wire connectors', 'likely')],
      tools: ['Multimeter'],
      questions: {
        phoneCall: ['How quickly does it blow?', 'Is the home on a fuse box rather than breakers?'],
        onSite: ['Test for overload or fault', 'Verify correct fuse rating is in use']
      }
    },
    {
      id: 'panel_water', cat: 'panel', name: 'Panel water damage, rust, or corrosion',
      keywords: ['panel rust', 'rusty panel', 'rust', 'rusty', 'water in panel', 'panel wet', 'corroded panel', 'corrosion', 'panel rusted'],
      urgency: 'high', labor: { min: 2, max: 5 },
      materials: [m('Replacement breakers / bus parts', 'maybe'), m('Anti-oxidant compound', 'likely')],
      tools: ['Multimeter', 'Torque screwdriver'],
      questions: {
        phoneCall: ['Is there an active leak above or near the panel?', 'Advise keeping the area dry and clear until inspected'],
        onSite: ['Assess extent of corrosion and safety to operate', 'Determine if repair or panel replacement is required']
      }
    },
    {
      id: 'double_tap', cat: 'panel', name: 'Loose or double-tapped breaker',
      keywords: ['double tap', 'double-tap', 'loose breaker', 'breaker loose', 'two wires on breaker', 'inspection noted'],
      urgency: 'medium', labor: { min: 1, max: 3 },
      materials: [m('Additional breaker(s)', 'likely'), m('Pigtail / connectors', 'likely')],
      tools: ['Torque screwdriver'],
      questions: {
        phoneCall: ['Is this from a home inspection report?'],
        onSite: ['Separate double-tapped conductors to their own breakers', 'Torque-check all terminations']
      }
    },

    // ---------- WIRING ----------
    {
      id: 'exposed_wiring', cat: 'wiring', name: 'Exposed or damaged wiring',
      keywords: ['exposed wire', 'exposed wiring', 'bare wire', 'damaged wire', 'wire showing', 'wires hanging', 'cut wire', 'frayed wire'],
      urgency: 'high', labor: { min: 1, max: 4 },
      materials: [m('Replacement cable / wire', 'likely'), m('Junction box', 'likely'), m('Wire connectors', 'surely')],
      tools: ['Drill', 'Fish tape'],
      questions: {
        phoneCall: ['Where is the exposed wire, and is it within reach of people/pets?', 'Advise keeping clear until repaired'],
        onSite: ['De-energize and make safe', 'Repair in an approved junction box, not a splice in the open']
      }
    },
    {
      id: 'rodent_wiring', cat: 'wiring', name: 'Rodent-chewed wiring',
      keywords: ['chewed', 'mice', 'rats', 'rodent', 'squirrel', 'chewed wire', 'animal chewed'],
      urgency: 'medium', labor: { min: 2, max: 5 },
      materials: [m('Replacement cable sections', 'surely'), m('Junction boxes', 'likely'), m('Wire connectors', 'surely')],
      tools: ['Fish tape', 'Drill'],
      questions: {
        phoneCall: ['Where did you find the chewed wiring (attic, crawl space)?', 'Is a circuit currently dead because of it?'],
        onSite: ['Trace and replace all damaged sections', 'Inspect nearby runs for additional damage']
      }
    },
    {
      id: 'aluminum_wiring', cat: 'wiring', name: 'Aluminum wiring concern / remediation',
      keywords: ['aluminum wiring', 'aluminum wire', 'alum wiring'],
      urgency: 'medium', labor: { min: 3, max: 8 },
      materials: [m('Approved aluminum-to-copper connectors (e.g. AlumiConn)', 'surely'), m('Antioxidant compound', 'surely')],
      tools: ['Torque screwdriver'],
      questions: {
        phoneCall: ['What prompted the concern (inspection, insurance, warm outlets)?', 'Whole house or specific circuits?'],
        onSite: ['Pigtail terminations with approved connectors', 'Inspect for prior overheating at devices']
      }
    },
    {
      id: 'knob_tube', cat: 'wiring', name: 'Knob-and-tube wiring issue',
      keywords: ['knob and tube', 'knob-and-tube', 'old wiring', 'cloth wiring'],
      urgency: 'medium', labor: { min: 4, max: 10 },
      materials: [m('Replacement modern cable', 'likely'), m('Junction boxes', 'likely'), m('Wire connectors', 'surely')],
      tools: ['Fish tape', 'Drill'],
      questions: {
        phoneCall: ['Is a specific circuit failing, or is this a general assessment?', 'Any insulation contacting the old wiring?'],
        onSite: ['Assess condition and extent', 'Plan safe replacement of affected runs']
      }
    },
    {
      id: 'junction_arc', cat: 'wiring', name: 'Loose connection or arcing in a junction box',
      keywords: ['junction box', 'loose connection', 'connection in box', 'arcing', 'crackle in wall'],
      urgency: 'high', labor: { min: 1, max: 3 },
      materials: [m('Wire connectors', 'surely'), m('Replacement box (if damaged)', 'maybe')],
      tools: ['Multimeter'],
      questions: {
        phoneCall: ['Which area or circuit is affected?'],
        onSite: ['Open and inspect suspect boxes', 'Remake connections to spec']
      }
    },

    // ---------- APPLIANCE / EQUIPMENT CIRCUITS ----------
    {
      id: 'water_heater', cat: 'appliance', name: 'Water heater has no power (no hot water)',
      keywords: ['water heater', 'no hot water', 'hot water heater'],
      urgency: 'high', labor: { min: 1, max: 3 },
      materials: [m('Double-pole breaker (if faulty)', 'maybe'), m('High-temp wire connectors', 'likely')],
      tools: ['Multimeter'],
      questions: {
        phoneCall: ['Electric or gas water heater?', 'Did the breaker trip?'],
        onSite: ['Verify voltage at the heater', 'Test breaker and elements/thermostat supply']
      }
    },
    {
      id: 'furnace_power', cat: 'appliance', name: 'Furnace / heat has no power (no heat)',
      keywords: ['furnace', 'no heat', 'heat not working', 'heater no power', 'furnace wont'],
      urgency: 'high', labor: { min: 1, max: 3 },
      materials: [m('Replacement breaker / fuse (if faulty)', 'maybe'), m('Wire connectors', 'likely')],
      tools: ['Multimeter'],
      questions: {
        phoneCall: ['Is the furnace switch (looks like a light switch nearby) on?', 'Did a breaker trip?'],
        onSite: ['Verify power to the furnace disconnect and unit', 'Coordinate with HVAC if the fault is internal']
      }
    },
    {
      id: 'ac_power', cat: 'appliance', name: 'Air conditioner has no power',
      keywords: ['air conditioner', 'ac unit', 'a/c not', 'ac not', 'no ac', 'no a/c', 'central air', 'condenser not'],
      urgency: 'high', labor: { min: 1, max: 3 },
      materials: [m('Double-pole breaker (if faulty)', 'maybe'), m('Fused disconnect parts', 'maybe'), m('Wire connectors', 'likely')],
      tools: ['Multimeter'],
      questions: {
        phoneCall: ['Did the outdoor unit stop, the indoor, or both?', 'Any breaker tripped?'],
        onSite: ['Check the outdoor disconnect and breaker', 'Verify voltage to the condenser']
      }
    },
    {
      id: 'dryer_circuit', cat: 'appliance', name: 'Dryer outlet not working',
      keywords: ['dryer', 'dryer outlet', 'dryer plug', 'dryer no power'],
      urgency: 'medium', labor: { min: 1, max: 3 },
      materials: [m('NEMA 14-30 receptacle', 'likely'), m('Double-pole 30A breaker (if faulty)', 'maybe'), m('Wire connectors', 'likely')],
      tools: ['Multimeter'],
      questions: {
        phoneCall: ['Does the dryer get no power, or only heat/tumble missing?', '3-prong or 4-prong outlet?'],
        onSite: ['Test the 240V receptacle for both legs', 'Inspect breaker and terminations']
      }
    },
    {
      id: 'range_circuit', cat: 'appliance', name: 'Range / oven / cooktop has no power',
      keywords: ['range', 'oven', 'stove', 'cooktop', 'range outlet'],
      urgency: 'medium', labor: { min: 1, max: 3 },
      materials: [m('NEMA 14-50 receptacle (if applicable)', 'maybe'), m('Double-pole breaker (if faulty)', 'maybe'), m('Wire connectors', 'likely')],
      tools: ['Multimeter'],
      questions: {
        phoneCall: ['Whole appliance dead, or just oven/burners?', 'Hardwired or plug-in?'],
        onSite: ['Test for both 120V legs at the supply', 'Check breaker and connections']
      }
    },
    {
      id: 'ev_charger_fault', cat: 'appliance', name: 'EV charger not working / fault',
      keywords: ['ev charger', 'car charger', 'tesla charger', 'charger not', 'ev not charging', 'charger fault'],
      urgency: 'medium', labor: { min: 1, max: 4 },
      materials: [m('Double-pole breaker (if faulty)', 'maybe'), m('Wire connectors', 'likely')],
      tools: ['Multimeter'],
      questions: {
        phoneCall: ['Is there a fault code on the charger?', 'Hardwired or plug-in (NEMA 14-50)?'],
        onSite: ['Verify breaker, voltage, and terminations', 'Check the receptacle for heat damage if plug-in']
      }
    },
    {
      id: 'hot_tub_power', cat: 'appliance', name: 'Hot tub / spa has no power or trips',
      keywords: ['hot tub', 'spa', 'jacuzzi', 'hot tub trips', 'spa no power'],
      urgency: 'medium', labor: { min: 2, max: 4 },
      materials: [m('50A 240V GFCI breaker (if faulty)', 'maybe'), m('Exterior disconnect parts', 'maybe'), m('Wire connectors', 'likely')],
      tools: ['Multimeter'],
      questions: {
        phoneCall: ['Does the spa-panel GFCI trip immediately or under load?', 'Any moisture at the disconnect?'],
        onSite: ['Test GFCI breaker and disconnect', 'Inspect for moisture intrusion and bonding']
      }
    },
    {
      id: 'disposal', cat: 'appliance', name: 'Garbage disposal not working',
      keywords: ['garbage disposal', 'disposal', 'sink disposal'],
      urgency: 'low', labor: { min: 1, max: 2 },
      materials: [m('Replacement switch or cord (if faulty)', 'maybe'), m('Wire connectors', 'likely')],
      tools: [],
      questions: {
        phoneCall: ['Does it hum, or is it completely dead?', 'Have you tried the red reset button on the unit?'],
        onSite: ['Test switch and supply', 'Check the unit reset and wiring']
      }
    },
    {
      id: 'dishwasher_elec', cat: 'appliance', name: 'Dishwasher electrical issue',
      keywords: ['dishwasher', 'dishwasher power', 'dishwasher dead'],
      urgency: 'low', labor: { min: 1, max: 2 },
      materials: [m('Replacement supply connections', 'maybe'), m('Wire connectors', 'likely')],
      tools: ['Multimeter'],
      questions: {
        phoneCall: ['Is it hardwired or plugged in under the sink?', 'Did a breaker trip?'],
        onSite: ['Verify supply voltage and connections', 'Coordinate with appliance repair if internal']
      }
    },
    {
      id: 'sump_pump', cat: 'appliance', name: 'Sump pump has no power',
      keywords: ['sump pump', 'sump', 'basement pump'],
      urgency: 'high', labor: { min: 1, max: 2 },
      materials: [m('GFCI receptacle (if faulty)', 'maybe'), m('Wire connectors', 'likely')],
      tools: ['Outlet / GFCI tester'],
      questions: {
        phoneCall: ['Is water currently rising? (raises urgency)', 'Is the outlet a GFCI that may have tripped?'],
        onSite: ['Test the dedicated outlet and GFCI', 'Verify the pump receives power']
      }
    },
    {
      id: 'pool_equipment', cat: 'appliance', name: 'Pool equipment electrical issue',
      keywords: ['pool pump', 'pool equipment', 'pool light', 'pool electrical', 'pool heater'],
      urgency: 'medium', labor: { min: 2, max: 4 },
      materials: [m('GFCI protection (if required)', 'likely'), m('Wire connectors', 'likely')],
      tools: ['Multimeter'],
      questions: {
        phoneCall: ['Which equipment is affected (pump, light, heater)?', 'Any GFCI tripping?'],
        onSite: ['Test supply and GFCI protection', 'Verify bonding of pool equipment']
      }
    },
    {
      id: 'generator_issue', cat: 'appliance', name: 'Generator not working / will not transfer',
      keywords: ['generator', 'transfer switch', 'wont switch over', 'generator not', 'backup power not'],
      urgency: 'medium', labor: { min: 2, max: 5 },
      materials: [m('Transfer switch parts (if faulty)', 'maybe'), m('Wire connectors', 'likely')],
      tools: ['Multimeter'],
      questions: {
        phoneCall: ['Portable or standby generator?', 'Does the engine run but power not transfer?'],
        onSite: ['Test transfer switch operation', 'Verify generator output and connections']
      }
    },

    // ---------- DETECTORS / LOW-VOLTAGE ----------
    {
      id: 'smoke_detector', cat: 'detector', name: 'Smoke / CO detector chirping or malfunction',
      keywords: ['smoke detector', 'smoke alarm', 'carbon monoxide', 'co detector', 'detector chirping', 'alarm chirping', 'beeping', 'detector going off'],
      urgency: 'medium', labor: { min: 1, max: 2 },
      materials: [m('Replacement smoke/CO detector(s)', 'likely'), m('Backup batteries', 'surely'), m('Wire connectors', 'likely')],
      tools: ['Ladder'],
      questions: {
        phoneCall: ['Are the detectors interconnected (all sound together)?', 'How many are in the home, and how old?'],
        onSite: ['Identify the chirping unit and cause', 'Replace end-of-life units; verify interconnect']
      }
    },
    {
      id: 'doorbell', cat: 'lowvoltage', name: 'Doorbell not working',
      keywords: ['doorbell', 'door bell', 'chime', 'ring not working'],
      urgency: 'low', labor: { min: 1, max: 2 },
      materials: [m('Transformer (if faulty)', 'maybe'), m('Button or chime unit', 'maybe'), m('Low-voltage wire', 'maybe')],
      tools: ['Multimeter'],
      questions: {
        phoneCall: ['Wired or battery/smart doorbell?', 'Does the chime, the button, or both fail?'],
        onSite: ['Test transformer output and button continuity', 'Check chime unit and wiring']
      }
    },
    {
      id: 'thermostat', cat: 'lowvoltage', name: 'Thermostat has no power / wiring issue',
      keywords: ['thermostat', 'thermostat blank', 'thermostat no power', 'tstat'],
      urgency: 'medium', labor: { min: 1, max: 2 },
      materials: [m('C-wire / adapter (if needed)', 'maybe'), m('Low-voltage wire', 'maybe')],
      tools: ['Multimeter'],
      questions: {
        phoneCall: ['Is the screen blank or showing an error?', 'Recently replaced the thermostat?'],
        onSite: ['Check 24V supply and C-wire availability', 'Verify wiring at the air handler/furnace board']
      }
    },
    {
      id: 'exhaust_fan', cat: 'lowvoltage', name: 'Bathroom exhaust / vent fan not working',
      keywords: ['exhaust fan', 'bathroom fan', 'vent fan', 'ventilation fan', 'fan in bathroom'],
      urgency: 'low', labor: { min: 1, max: 2 },
      materials: [m('Replacement fan motor / unit', 'maybe'), m('Wire connectors', 'likely')],
      tools: ['Ladder'],
      questions: {
        phoneCall: ['Does the fan run at all, or is it just noisy/weak?', 'On its own switch or combined with the light?'],
        onSite: ['Test switch and motor', 'Check wiring and damper']
      }
    },

    // ---------- MOISTURE / WEATHER ----------
    {
      id: 'rain_tripping', cat: 'outlet', name: 'Circuit trips when it rains (moisture fault)',
      keywords: ['it rains', 'rains', 'when it rains', 'after rain', 'trips when wet', 'when wet', 'gets wet', 'moisture', 'wet outlet', 'trips in rain'],
      urgency: 'medium', labor: { min: 1, max: 3 },
      materials: [m('Weather-resistant GFCI receptacle', 'likely'), m('In-use weatherproof covers', 'likely'), m('Sealant / gaskets', 'likely')],
      tools: ['Outlet / GFCI tester'],
      questions: {
        phoneCall: ['Which outlets or circuit go out when it rains?'],
        onSite: ['Find the moisture intrusion point', 'Reseal boxes and replace damaged devices']
      }
    }
  ];

  // ===================================================================
  //  SCORING + ASSEMBLY
  // ===================================================================
  // Lookup + device-level fallbacks (used only when no specific symptom matched)
  const SERVICE_BY_ID = {};
  SERVICES.forEach(s => { SERVICE_BY_ID[s.id] = s; });

  const FALLBACKS = [
    { keys: ['outlet', 'outlets', 'receptacle', 'plug', 'socket'], label: 'Outlet issue (symptom to confirm)', ref: 'dead_outlet' },
    { keys: ['ceiling fan'], label: 'Ceiling fan issue (symptom to confirm)', ref: 'fan_dead' },
    { keys: ['exhaust fan', 'vent fan', 'bathroom fan'], label: 'Exhaust fan issue (symptom to confirm)', ref: 'exhaust_fan' },
    { keys: ['switch', 'dimmer'], label: 'Switch issue (symptom to confirm)', ref: 'switch_dead' },
    { keys: ['light', 'lights', 'lighting', 'fixture', 'bulb', 'bulbs', 'lamp', 'chandelier'], label: 'Lighting issue (symptom to confirm)', ref: 'fixture_dead' },
    { keys: ['breaker', 'fuse', 'breaker box', 'fuse box', 'panel', 'subpanel'], label: 'Panel or breaker issue (symptom to confirm)', ref: 'breaker_trips' },
    { keys: ['wiring', 'wire', 'wires', 'circuit'], label: 'Wiring issue (symptom to confirm)', ref: 'exposed_wiring' },
    { keys: ['ev charger', 'car charger', 'tesla', 'charger'], label: 'EV charger issue (symptom to confirm)', ref: 'ev_charger_fault' },
    { keys: ['water heater'], label: 'Water heater electrical issue (symptom to confirm)', ref: 'water_heater' },
    { keys: ['furnace', 'hvac', 'air conditioner', 'ac unit', 'a/c', 'condenser'], label: 'HVAC electrical issue (symptom to confirm)', ref: 'ac_power' },
    { keys: ['generator', 'transfer switch'], label: 'Generator issue (symptom to confirm)', ref: 'generator_issue' },
    { keys: ['thermostat'], label: 'Thermostat issue (symptom to confirm)', ref: 'thermostat' },
    { keys: ['doorbell', 'chime'], label: 'Doorbell issue (symptom to confirm)', ref: 'doorbell' },
    { keys: ['smoke detector', 'smoke alarm', 'carbon monoxide', 'co detector', 'detector'], label: 'Detector issue (symptom to confirm)', ref: 'smoke_detector' },
    { keys: ['dryer'], label: 'Dryer circuit issue (symptom to confirm)', ref: 'dryer_circuit' },
    { keys: ['range', 'oven', 'stove', 'cooktop'], label: 'Range/oven circuit issue (symptom to confirm)', ref: 'range_circuit' },
    { keys: ['hot tub', 'spa', 'jacuzzi'], label: 'Hot tub circuit issue (symptom to confirm)', ref: 'hot_tub_power' },
    { keys: ['pool'], label: 'Pool electrical issue (symptom to confirm)', ref: 'pool_equipment' },
    { keys: ['sump pump', 'sump'], label: 'Sump pump issue (symptom to confirm)', ref: 'sump_pump' },
    { keys: ['disposal'], label: 'Garbage disposal issue (symptom to confirm)', ref: 'disposal' },
    { keys: ['dishwasher'], label: 'Dishwasher electrical issue (symptom to confirm)', ref: 'dishwasher_elec' },
    { keys: ['fan'], label: 'Fan issue (symptom to confirm)', ref: 'fan_dead' }
  ];

  function scoreService(service, message) {
    let score = 0;
    for (const kw of service.keywords) {
      if (message.includes(kw)) score += kw.includes(' ') ? 2 : 1; // phrase weighs more
    }
    return score;
  }

  function bestMatch(message) {
    let best = null, bestScore = 0;
    for (const service of SERVICES) {
      const s = scoreService(service, message);
      if (s > bestScore) { best = service; bestScore = s; } // first listed wins ties (hazards first)
    }
    return { service: best, score: bestScore };
  }

  function assembleTools(service) {
    const set = new Set(BASIC_TOOLS);
    (service.tools || []).forEach(t => set.add(t));
    return Array.from(set);
  }

  function assembleMaterials(service, message, location) {
    const list = service.materials.map(x => ({ ...x }));
    // Contextual rule: outlet/switch-type repairs in wet locations should carry GFCI.
    const wet = WET_LOCATIONS.some(w => message.includes(w)) ||
                ['Kitchen', 'Bathroom', 'Outdoor', 'Garage', 'Laundry room', 'Basement'].includes(location);
    if ((service.cat === 'outlet' || service.cat === 'switch') && wet &&
        !list.some(x => /gfci/i.test(x.name))) {
      list.push(m('GFCI receptacle (wet-location code requirement)', 'likely'));
    }
    const order = { surely: 0, likely: 1, maybe: 2 };
    return list.sort((a, b) => order[a.prob] - order[b.prob]);
  }

  function buildUncertainties(service, message, request) {
    const phoneCall = [];
    const onSite = [];

    if (!val(request.name)) phoneCall.push('Customer name not provided: collect on the booking call');
    if (!val(request.phone)) phoneCall.push('Customer phone not provided: needed to confirm details');
    if (!val(request.email)) phoneCall.push('Customer email not provided');
    if (!val(request.address)) phoneCall.push('Customer address not provided: needed for scheduling and distance');

    if (service && service.questions) {
      (service.questions.phoneCall || []).forEach(q => phoneCall.push(q));
      (service.questions.onSite || []).forEach(q => onSite.push(q));
    }

    if (message.trim().length < 25) {
      phoneCall.push('Very short description: ask the customer to describe the problem in more detail');
    }

    if (onSite.length === 0) onSite.push('Confirm scope and conditions on-site before starting work');
    if (phoneCall.length === 0) phoneCall.push('Confirm appointment time and address');
    return { phoneCall, onSite };
  }

  // ===================================================================
  //  PUBLIC API
  // ===================================================================
  function analyze(request) {
    const message = (request.message || '').toLowerCase().trim();
    const partOfHouse = inferLocation(message);

    // --- Empty / unusable message: do not guess ---
    if (message.length === 0) {
      return {
        jobType: 'Not determined (no description provided)',
        partOfHouse,
        urgency: 'medium',
        laborEstimate: { min: 0, max: 0 },
        materials: [],
        tools: [],
        uncertainties: {
          phoneCall: ['No problem description was provided: call the customer to find out what needs fixing'],
          onSite: []
        },
        inScope: false
      };
    }

    // --- Out of scope: a NEW installation / project, nothing broken ---
    if (isOutOfScope(message)) {
      const subject = detectSubject(message);
      return {
        jobType: subject
          ? `New ${subject} installation (out of repair scope)`
          : 'New installation or project (out of repair scope)',
        partOfHouse,
        urgency: signalUrgency(message), // still flag urgency per requirement
        laborEstimate: { min: 0, max: 0 },
        materials: [],
        tools: [],
        uncertainties: { phoneCall: [], onSite: [] },
        inScope: false
      };
    }

    // --- Try to classify as a repair ---
    const { service, score } = bestMatch(message);

    // --- Too vague to classify: do not guess ---
    if (!service || score === 0) {
      const _fb = FALLBACKS.find(f => f.keys.some(k => message.includes(k)));
      if (_fb) {
        const _ref = SERVICE_BY_ID[_fb.ref];
        const _u = buildUncertainties(_ref, message, request);
        _u.phoneCall.unshift('The message names the equipment but not the exact problem: confirm the specific symptom with the customer');
        return {
          jobType: _fb.label,
          partOfHouse,
          urgency: higherUrgency(_ref.urgency, signalUrgency(message)),
          laborEstimate: { min: _ref.labor.min, max: _ref.labor.max },
          materials: assembleMaterials(_ref, message, partOfHouse),
          tools: assembleTools(_ref),
          uncertainties: _u,
          inScope: true
        };
      }
      const urgency = safetyFlagged(message) ? 'high' : signalUrgency(message);
      const phoneCall = [];
      if (!val(request.name)) phoneCall.push('Customer name not provided');
      if (!val(request.address)) phoneCall.push('Customer address not provided: needed for scheduling and distance');
      phoneCall.push('Could not determine the job type from the message: call the customer to clarify what needs fixing');
      return {
        jobType: 'Not determined (message unclear)',
        partOfHouse,
        urgency: urgency === 'low' ? 'medium' : urgency, // unknown problem: do not under-prioritize
        laborEstimate: { min: 0, max: 0 },
        materials: [],
        tools: [],
        uncertainties: { phoneCall, onSite: ['Confirm the actual problem on-site before quoting'] },
        inScope: true
      };
    }

    // --- Matched a repair service ---
    const urgency = higherUrgency(service.urgency, signalUrgency(message)); // safety override raises only
    return {
      jobType: service.name,
      partOfHouse,
      urgency,
      laborEstimate: { min: service.labor.min, max: service.labor.max },
      materials: assembleMaterials(service, message, partOfHouse),
      tools: assembleTools(service),
      uncertainties: buildUncertainties(service, message, request),
      inScope: true
    };
  }

  return {
    version: VERSION,
    analyze,
    _serviceCount: SERVICES.length // exposed for diagnostics/testing
  };
})();

// Node export for testing only; ignored by browsers.
if (typeof module !== 'undefined' && module.exports) { module.exports = InferenceEngine; }

// Made with Bob
