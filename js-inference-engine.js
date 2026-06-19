





/**
 * INFERENCE ENGINE - COMPREHENSIVE ELECTRICAL SERVICES DATABASE
 * Rule-based system to analyze customer service requests
 * Extracts job type, urgency, location, materials, tools, and labor estimates
 *
 * This serves as the main knowledge base for the platform
 */


const InferenceEngine = {
 
  /**
   * Analyze a customer request and return inferred job details
   */
  analyze(request) {
    const message = (request.message || '').toLowerCase();
   
    return {
      jobType: this.inferJobType(message),
      partOfHouse: this.inferLocation(message),
      urgency: this.inferUrgency(message),
      laborEstimate: this.estimateLabor(message),
      materials: this.predictMaterials(message),
      tools: this.predictTools(message),
      uncertainties: this.identifyUncertainties(message, request)
    };
  },


  /**
   * Comprehensive job type inference covering all electrical services
   */
  inferJobType(message) {
    const patterns = [
      // OUTLETS & RECEPTACLES
      { keywords: ['outlet', 'receptacle', 'plug', 'socket'], type: 'Outlet repair/replacement', urgency: 'medium' },
      { keywords: ['gfci', 'ground fault'], type: 'GFCI outlet issue', urgency: 'high' },
      { keywords: ['usb outlet', 'usb receptacle'], type: 'USB outlet installation', urgency: 'low' },
      { keywords: ['outdoor outlet', 'exterior outlet'], type: 'Outdoor outlet installation', urgency: 'medium' },
      { keywords: ['tamper resistant outlet'], type: 'Tamper-resistant outlet upgrade', urgency: 'medium' },
     
      // PANELS & BREAKERS
      { keywords: ['panel', 'breaker box', 'fuse box', 'main breaker'], type: 'Panel inspection/upgrade', urgency: 'high' },
      { keywords: ['panel upgrade', 'service upgrade', 'fuse to breaker'], type: 'Service panel upgrade', urgency: 'high' },
      { keywords: ['breaker trip', 'breaker keeps', 'breaker won\'t reset'], type: 'Circuit breaker issue', urgency: 'high' },
      { keywords: ['buzzing', 'humming', 'panel noise'], type: 'Panel buzzing inspection', urgency: 'high' },
      { keywords: ['add breaker', 'new breaker'], type: 'Circuit breaker installation', urgency: 'medium' },
      { keywords: ['subpanel', 'sub panel', 'sub-panel'], type: 'Subpanel installation', urgency: 'medium' },
     
      // LIGHTING
      { keywords: ['light', 'fixture', 'lighting'], type: 'Light fixture installation/repair', urgency: 'low' },
      { keywords: ['flicker', 'flickering'], type: 'Light flickering diagnosis', urgency: 'medium' },
      { keywords: ['dimmer', 'dimmer switch'], type: 'Dimmer switch installation', urgency: 'low' },
      { keywords: ['recessed light', 'can light', 'pot light'], type: 'Recessed lighting installation', urgency: 'low' },
      { keywords: ['chandelier'], type: 'Chandelier installation', urgency: 'low' },
      { keywords: ['track lighting'], type: 'Track lighting installation', urgency: 'low' },
      { keywords: ['under cabinet light'], type: 'Under-cabinet lighting', urgency: 'low' },
      { keywords: ['outdoor light', 'exterior light', 'porch light'], type: 'Outdoor lighting installation', urgency: 'low' },
      { keywords: ['landscape light', 'yard light'], type: 'Landscape lighting installation', urgency: 'low' },
      { keywords: ['motion sensor light', 'motion light'], type: 'Motion sensor lighting', urgency: 'low' },
      { keywords: ['security light', 'flood light'], type: 'Security/flood lighting', urgency: 'medium' },
     
      // CEILING FANS
      { keywords: ['ceiling fan install'], type: 'Ceiling fan installation', urgency: 'low' },
      { keywords: ['ceiling fan', 'fan'], type: 'Ceiling fan repair/replacement', urgency: 'low' },
      { keywords: ['fan wobble', 'fan noise'], type: 'Ceiling fan balancing/repair', urgency: 'low' },
     
      // SWITCHES
      { keywords: ['switch', 'light switch'], type: 'Switch installation/replacement', urgency: 'low' },
      { keywords: ['three way', '3-way', '3 way'], type: 'Three-way switch installation', urgency: 'medium' },
      { keywords: ['four way', '4-way', '4 way'], type: 'Four-way switch installation', urgency: 'medium' },
      { keywords: ['smart switch', 'wifi switch'], type: 'Smart switch installation', urgency: 'low' },
      { keywords: ['timer switch'], type: 'Timer switch installation', urgency: 'low' },
     
      // POWER ISSUES
      { keywords: ['no power', 'lost power', 'outage', 'dead'], type: 'Power loss diagnosis', urgency: 'high' },
      { keywords: ['partial power', 'half the'], type: 'Partial power loss', urgency: 'high' },
      { keywords: ['power surge', 'surge'], type: 'Power surge investigation', urgency: 'high' },
     
      // WIRING
      { keywords: ['rewire', 'rewiring'], type: 'Complete rewiring', urgency: 'high' },
      { keywords: ['wiring', 'wire'], type: 'Wiring repair/upgrade', urgency: 'medium' },
      { keywords: ['aluminum wiring'], type: 'Aluminum wiring remediation', urgency: 'high' },
      { keywords: ['knob and tube', 'knob-and-tube'], type: 'Knob-and-tube wiring replacement', urgency: 'high' },
      { keywords: ['new circuit', 'add circuit', 'dedicated circuit'], type: 'New circuit installation', urgency: 'medium' },
     
      // MAJOR APPLIANCES & EQUIPMENT
      { keywords: ['ev charger', 'electric vehicle', 'tesla', 'car charger'], type: 'EV charger installation', urgency: 'low' },
      { keywords: ['hot tub', 'spa', 'jacuzzi'], type: 'Hot tub circuit installation', urgency: 'medium' },
      { keywords: ['water heater'], type: 'Water heater electrical', urgency: 'high' },
      { keywords: ['electric range', 'electric stove', 'oven'], type: 'Range/oven circuit installation', urgency: 'medium' },
      { keywords: ['dryer', 'electric dryer'], type: 'Dryer circuit installation', urgency: 'medium' },
      { keywords: ['air conditioner', 'ac unit', 'hvac'], type: 'AC/HVAC electrical work', urgency: 'high' },
      { keywords: ['pool', 'swimming pool'], type: 'Pool electrical installation', urgency: 'medium' },
      { keywords: ['generator', 'backup generator', 'standby generator'], type: 'Generator installation/hookup', urgency: 'medium' },
      { keywords: ['transfer switch'], type: 'Transfer switch installation', urgency: 'medium' },
     
      // SAFETY & HAZARDS
      { keywords: ['spark', 'sparking', 'burning smell', 'smoke', 'fire'], type: 'Electrical safety hazard', urgency: 'high' },
      { keywords: ['shock', 'tingle', 'electrocute'], type: 'Electrical shock hazard', urgency: 'high' },
      { keywords: ['arc fault', 'afci'], type: 'Arc fault circuit breaker issue', urgency: 'high' },
      { keywords: ['ground fault', 'grounding issue'], type: 'Grounding problem', urgency: 'high' },
     
      // SPECIALTY SYSTEMS
      { keywords: ['smoke detector', 'smoke alarm', 'carbon monoxide'], type: 'Smoke/CO detector installation', urgency: 'high' },
      { keywords: ['doorbell', 'door bell'], type: 'Doorbell installation/repair', urgency: 'low' },
      { keywords: ['thermostat'], type: 'Thermostat installation/wiring', urgency: 'medium' },
      { keywords: ['home automation', 'smart home'], type: 'Home automation wiring', urgency: 'low' },
      { keywords: ['security system', 'alarm system'], type: 'Security system wiring', urgency: 'medium' },
      { keywords: ['intercom'], type: 'Intercom system installation', urgency: 'low' },
     
      // RENOVATION & CONSTRUCTION
      { keywords: ['basement finish', 'finish basement'], type: 'Basement electrical rough-in', urgency: 'low' },
      { keywords: ['renovation', 'remodel'], type: 'Renovation electrical work', urgency: 'medium' },
      { keywords: ['addition', 'room addition'], type: 'Addition electrical work', urgency: 'medium' },
      { keywords: ['kitchen remodel'], type: 'Kitchen electrical upgrade', urgency: 'medium' },
      { keywords: ['bathroom remodel'], type: 'Bathroom electrical upgrade', urgency: 'medium' },
     
      // COMMERCIAL
      { keywords: ['commercial', 'business', 'office', 'store'], type: 'Commercial electrical service', urgency: 'medium' },
      { keywords: ['emergency light', 'exit sign'], type: 'Emergency lighting installation', urgency: 'medium' },
      { keywords: ['parking lot light'], type: 'Parking lot lighting', urgency: 'low' },
     
      // INSPECTIONS & ASSESSMENTS
      { keywords: ['inspection', 'assess', 'estimate'], type: 'Electrical inspection/assessment', urgency: 'low' },
      { keywords: ['code violation', 'code compliance'], type: 'Code compliance inspection', urgency: 'high' },
      { keywords: ['home inspection', 'pre-purchase'], type: 'Pre-purchase electrical inspection', urgency: 'low' },
      { keywords: ['troubleshoot', 'diagnose'], type: 'Electrical troubleshooting', urgency: 'medium' },
    ];


    for (const pattern of patterns) {
      if (pattern.keywords.some(kw => message.includes(kw))) {
        return pattern.type;
      }
    }
    return 'General electrical service';
  },


  /**
   * Infer location/part of house
   */
  inferLocation(message) {
    const locations = [
      'kitchen', 'bathroom', 'bedroom', 'living room', 'dining room',
      'basement', 'attic', 'garage', 'laundry room', 'hallway',
      'outdoor', 'exterior', 'backyard', 'front yard', 'porch',
      'office', 'den', 'family room', 'utility room', 'crawl space',
      'master bedroom', 'guest room', 'mudroom', 'foyer', 'entryway'
    ];


    for (const loc of locations) {
      if (message.includes(loc)) {
        return loc.charAt(0).toUpperCase() + loc.slice(1);
      }
    }


    if (message.includes('first floor') || message.includes('1st floor')) return 'First floor';
    if (message.includes('second floor') || message.includes('2nd floor')) return 'Second floor';
    if (message.includes('third floor') || message.includes('3rd floor')) return 'Third floor';
    if (message.includes('whole house') || message.includes('entire house')) return 'Whole house';


    return 'Not specified';
  },


  /**
   * Determine urgency level based on safety and operational impact
   */
  inferUrgency(message) {
    const highUrgency = [
      'no power', 'lost power', 'outage', 'emergency', 'urgent', 'asap',
      'spark', 'sparking', 'burning smell', 'smoke', 'fire', 'hot', 'melted',
      'shock', 'electrocute', 'dangerous', 'safety', 'hazard', 'tonight', 'today',
      'no hot water', 'no heat', 'no ac', 'buzzing', 'humming', 'arc',
      'aluminum wiring', 'knob and tube', 'code violation', 'inspector',
      'water heater', 'furnace', 'hvac down'
    ];


    const mediumUrgency = [
      'intermittent', 'sometimes', 'flickering', 'tripping', 'trip',
      'this week', 'soon', 'business', 'commercial', 'multiple',
      'remodel', 'renovation', 'upgrade', 'install', 'add'
    ];


    for (const indicator of highUrgency) {
      if (message.includes(indicator)) return 'high';
    }


    for (const indicator of mediumUrgency) {
      if (message.includes(indicator)) return 'medium';
    }


    return 'low';
  },


  /**
   * Estimate labor hours based on job complexity
   */
  estimateLabor(message) {
    const jobPatterns = [
      // Quick jobs (1-2 hours)
      { keywords: ['single outlet', 'one outlet', 'replace outlet'], min: 1, max: 2 },
      { keywords: ['light switch', 'dimmer switch', 'switch'], min: 1, max: 2 },
      { keywords: ['gfci'], min: 1, max: 2 },
      { keywords: ['smoke detector', 'doorbell'], min: 1, max: 2 },
     
      // Standard jobs (2-4 hours)
      { keywords: ['troubleshoot', 'diagnose', 'inspection'], min: 2, max: 4 },
      { keywords: ['ceiling fan'], min: 2, max: 4 },
      { keywords: ['multiple outlet'], min: 2, max: 4 },
      { keywords: ['light fixture', 'chandelier'], min: 2, max: 4 },
      { keywords: ['recessed light'], min: 2, max: 4 },
      { keywords: ['three way', '3-way'], min: 2, max: 4 },
      { keywords: ['thermostat'], min: 1, max: 3 },
     
      // Medium jobs (3-6 hours)
      { keywords: ['ev charger'], min: 3, max: 6 },
      { keywords: ['new circuit', 'add circuit'], min: 3, max: 6 },
      { keywords: ['subpanel'], min: 4, max: 6 },
      { keywords: ['outdoor lighting'], min: 3, max: 6 },
      { keywords: ['under cabinet'], min: 2, max: 4 },
     
      // Large jobs (4-8 hours)
      { keywords: ['hot tub', 'spa'], min: 4, max: 7 },
      { keywords: ['dryer circuit', 'range circuit'], min: 3, max: 5 },
      { keywords: ['generator'], min: 6, max: 10 },
      { keywords: ['transfer switch'], min: 4, max: 6 },
     
      // Major projects (6-16+ hours)
      { keywords: ['panel upgrade', 'service upgrade'], min: 6, max: 10 },
      { keywords: ['basement finish', 'renovation'], min: 8, max: 16 },
      { keywords: ['rewire', 'whole house'], min: 16, max: 40 },
      { keywords: ['aluminum wiring', 'knob and tube'], min: 12, max: 30 },
      { keywords: ['kitchen remodel'], min: 8, max: 20 },
      { keywords: ['pool'], min: 8, max: 16 },
    ];


    for (const pattern of jobPatterns) {
      if (pattern.keywords.some(kw => message.includes(kw))) {
        return { min: pattern.min, max: pattern.max };
      }
    }
    return { min: 1, max: 3 };
  },


  /**
   * Predict materials needed with confidence levels
   * Returns array sorted by confidence: surely > likely > maybe
   */
  predictMaterials(message) {
    const materials = [];


    // OUTLETS & RECEPTACLES
    if (message.includes('outlet') || message.includes('receptacle')) {
      materials.push({ name: 'Replacement receptacle', prob: 'likely', category: 'device' });
      materials.push({ name: 'Wire connectors', prob: 'surely', category: 'connector' });
      materials.push({ name: 'Wall plate', prob: 'likely', category: 'finish' });
     
      if (message.includes('kitchen') || message.includes('bathroom') || message.includes('outdoor')) {
        materials.push({ name: 'GFCI receptacle', prob: 'surely', category: 'device' });
      }
      if (message.includes('usb')) {
        materials.push({ name: 'USB outlet', prob: 'surely', category: 'device' });
      }
    }


    if (message.includes('gfci')) {
      materials.push({ name: 'GFCI receptacle', prob: 'surely', category: 'device' });
      materials.push({ name: 'Wire connectors', prob: 'surely', category: 'connector' });
      materials.push({ name: 'Wall plate', prob: 'likely', category: 'finish' });
    }


    // PANELS & BREAKERS
    if (message.includes('panel') || message.includes('breaker')) {
      materials.push({ name: 'Circuit breaker', prob: 'likely', category: 'protection' });
     
      if (message.includes('upgrade') || message.includes('fuse')) {
        materials.push({ name: 'New load center/panel', prob: 'surely', category: 'panel' });
        materials.push({ name: 'Circuit breakers (multiple)', prob: 'surely', category: 'protection' });
        materials.push({ name: 'Grounding equipment', prob: 'surely', category: 'safety' });
        materials.push({ name: 'Permit', prob: 'surely', category: 'admin' });
        materials.push({ name: 'Meter socket (if needed)', prob: 'maybe', category: 'service' });
      }
     
      if (message.includes('subpanel')) {
        materials.push({ name: 'Subpanel enclosure', prob: 'surely', category: 'panel' });
        materials.push({ name: 'Main breaker', prob: 'surely', category: 'protection' });
        materials.push({ name: 'Feeder cable', prob: 'surely', category: 'wire' });
        materials.push({ name: 'Ground rod', prob: 'likely', category: 'safety' });
      }
    }


    // LIGHTING
    if (message.includes('light') || message.includes('fixture')) {
      materials.push({ name: 'Light fixture', prob: 'maybe', category: 'fixture' });
      materials.push({ name: 'Wire connectors', prob: 'likely', category: 'connector' });
      materials.push({ name: 'Mounting hardware', prob: 'likely', category: 'hardware' });
     
      if (message.includes('dimmer')) {
        materials.push({ name: 'LED-compatible dimmer', prob: 'surely', category: 'device' });
      }
      if (message.includes('recessed')) {
        materials.push({ name: 'Recessed can housings', prob: 'surely', category: 'fixture' });
        materials.push({ name: 'LED trim kits', prob: 'likely', category: 'fixture' });
      }
      if (message.includes('under cabinet')) {
        materials.push({ name: 'LED strip lights', prob: 'likely', category: 'fixture' });
        materials.push({ name: 'Power supply/transformer', prob: 'surely', category: 'device' });
      }
      if (message.includes('outdoor') || message.includes('exterior')) {
        materials.push({ name: 'Weather-resistant fixtures', prob: 'surely', category: 'fixture' });
        materials.push({ name: 'Outdoor-rated wire', prob: 'likely', category: 'wire' });
      }
      if (message.includes('motion')) {
        materials.push({ name: 'Motion sensor', prob: 'surely', category: 'device' });
      }
    }


    // CEILING FANS
    if (message.includes('ceiling fan')) {
      materials.push({ name: 'Fan-rated ceiling box', prob: 'surely', category: 'hardware' });
      materials.push({ name: 'Fan/light switch', prob: 'likely', category: 'device' });
      materials.push({ name: 'Wire connectors', prob: 'surely', category: 'connector' });
      materials.push({ name: 'Ceiling fan (if not provided)', prob: 'maybe', category: 'fixture' });
    }


    // SWITCHES
    if (message.includes('switch') && !message.includes('transfer')) {
      materials.push({ name: 'Switch', prob: 'likely', category: 'device' });
      materials.push({ name: 'Wall plate', prob: 'likely', category: 'finish' });
     
      if (message.includes('smart')) {
        materials.push({ name: 'Smart switch', prob: 'surely', category: 'device' });
        materials.push({ name: 'Neutral wire (if needed)', prob: 'maybe', category: 'wire' });
      }
      if (message.includes('three way') || message.includes('3-way')) {
        materials.push({ name: '3-way switches (2)', prob: 'surely', category: 'device' });
        materials.push({ name: '3-wire cable', prob: 'likely', category: 'wire' });
      }
    }


    // EV CHARGER
    if (message.includes('ev') || message.includes('charger') || message.includes('tesla')) {
      materials.push({ name: '40-50A double-pole breaker', prob: 'surely', category: 'protection' });
      materials.push({ name: '6 AWG copper wire', prob: 'surely', category: 'wire' });
      materials.push({ name: 'NEMA 14-50 outlet or hardwire kit', prob: 'likely', category: 'device' });
      materials.push({ name: 'Conduit', prob: 'likely', category: 'raceway' });
      materials.push({ name: 'Permit', prob: 'surely', category: 'admin' });
    }


    // HOT TUB
    if (message.includes('hot tub') || message.includes('spa')) {
      materials.push({ name: '50A 240V GFCI breaker', prob: 'surely', category: 'protection' });
      materials.push({ name: '6 AWG copper wire', prob: 'surely', category: 'wire' });
      materials.push({ name: 'Exterior disconnect box', prob: 'surely', category: 'device' });
      materials.push({ name: 'Conduit', prob: 'surely', category: 'raceway' });
      materials.push({ name: 'Permit', prob: 'likely', category: 'admin' });
    }


    // MAJOR APPLIANCES
    if (message.includes('dryer')) {
      materials.push({ name: '30A double-pole breaker', prob: 'surely', category: 'protection' });
      materials.push({ name: '10 AWG wire', prob: 'surely', category: 'wire' });
      materials.push({ name: 'NEMA 14-30 outlet', prob: 'surely', category: 'device' });
    }


    if (message.includes('range') || message.includes('stove') || message.includes('oven')) {
      materials.push({ name: '40-50A double-pole breaker', prob: 'surely', category: 'protection' });
      materials.push({ name: '6 AWG wire', prob: 'surely', category: 'wire' });
      materials.push({ name: 'NEMA 14-50 outlet', prob: 'surely', category: 'device' });
    }


    // GENERATOR
    if (message.includes('generator')) {
      materials.push({ name: 'Transfer switch', prob: 'surely', category: 'device' });
      materials.push({ name: 'Generator breaker', prob: 'surely', category: 'protection' });
      materials.push({ name: 'Heavy gauge wire', prob: 'surely', category: 'wire' });
      materials.push({ name: 'Permit', prob: 'surely', category: 'admin' });
    }


    // WIRING & CIRCUITS
    if (message.includes('wire') || message.includes('circuit')) {
      materials.push({ name: 'Electrical wire (gauge TBD)', prob: 'surely', category: 'wire' });
      materials.push({ name: 'Wire connectors', prob: 'surely', category: 'connector' });
      materials.push({ name: 'Junction boxes', prob: 'likely', category: 'box' });
      materials.push({ name: 'Cable staples', prob: 'likely', category: 'hardware' });
    }


    if (message.includes('rewire') || message.includes('aluminum') || message.includes('knob')) {
      materials.push({ name: 'Romex cable (multiple rolls)', prob: 'surely', category: 'wire' });
      materials.push({ name: 'Outlet boxes', prob: 'surely', category: 'box' });
      materials.push({ name: 'Switch boxes', prob: 'surely', category: 'box' });
      materials.push({ name: 'Wire connectors (bulk)', prob: 'surely', category: 'connector' });
      materials.push({ name: 'Permit', prob: 'surely', category: 'admin' });
    }


    // SAFETY DEVICES
    if (message.includes('smoke') || message.includes('carbon monoxide')) {
      materials.push({ name: 'Smoke/CO detectors', prob: 'surely', category: 'safety' });
      materials.push({ name: 'Mounting hardware', prob: 'surely', category: 'hardware' });
      materials.push({ name: 'Wire connectors', prob: 'likely', category: 'connector' });
    }


    // GROUNDING
    if (message.includes('ground')) {
      materials.push({ name: 'Ground rod', prob: 'likely', category: 'safety' });
      materials.push({ name: 'Ground wire', prob: 'surely', category: 'wire' });
      materials.push({ name: 'Ground clamps', prob: 'surely', category: 'hardware' });
    }


    // Default if nothing matched
    if (materials.length === 0) {
      materials.push({ name: 'To be determined after diagnosis', prob: 'maybe', category: 'tbd' });
    }


    // Sort by confidence: surely > likely > maybe
    const probOrder = { 'surely': 0, 'likely': 1, 'maybe': 2 };
    return materials.sort((a, b) => probOrder[a.prob] - probOrder[b.prob]);
  },


  /**
   * Predict tools needed for the job
   */
  predictTools(message) {
    const tools = new Set();
   
    // Basic tools for almost any job
    tools.add('Voltage tester');
    tools.add('Wire strippers');
    tools.add('Screwdrivers');
    tools.add('Pliers');
   
    // Job-specific tools
    if (message.includes('panel') || message.includes('breaker')) {
      tools.add('Multimeter');
      tools.add('Torque screwdriver');
      tools.add('Panel puller');
    }
   
    if (message.includes('wire') || message.includes('circuit') || message.includes('rewire')) {
      tools.add('Fish tape');
      tools.add('Drill with bits');
      tools.add('Cable ripper');
      tools.add('Stud finder');
    }
   
    if (message.includes('recessed') || message.includes('ceiling')) {
      tools.add('Hole saw');
      tools.add('Ladder');
      tools.add('Drywall saw');
    }
   
    if (message.includes('outdoor') || message.includes('conduit')) {
      tools.add('Conduit bender');
      tools.add('Hacksaw');
      tools.add('Level');
    }
   
    if (message.includes('generator') || message.includes('ev charger') || message.includes('hot tub')) {
      tools.add('Torque wrench');
      tools.add('Conduit bender');
      tools.add('Knockout punch');
    }
   
    return Array.from(tools);
  },


  /**
   * Identify uncertainties - separated into phone call vs on-site checks
   */
  identifyUncertainties(message, request) {
    const phoneCall = [];  // Can be clarified over the phone
    const onSite = [];     // Must be checked on-site


    // MISSING CONTACT INFO (phone call category)
    if (!request.name || request.name.trim() === '') {
      phoneCall.push('Customer name not provided on form');
    }
    if (!request.email || request.email.trim() === '') {
      phoneCall.push('Customer email not provided on form');
    }
    if (!request.phone || request.phone.trim() === '') {
      phoneCall.push('Customer phone number not provided on form');
    }
    if (!request.address || request.address.trim() === '') {
      phoneCall.push('Customer address not provided - needed for scheduling and distance calculation');
    }


    // JOB-SPECIFIC CLARIFICATIONS
   
    // Outlets
    if (message.includes('outlet') && !message.includes('gfci')) {
      phoneCall.push('Is this a counter outlet that requires GFCI protection by code?');
      phoneCall.push('How many outlets are affected?');
      onSite.push('Check if upstream GFCI/breaker is the cause');
      onSite.push('Verify wire gauge and circuit capacity');
    }


    // Flickering lights
    if (message.includes('flicker')) {
      phoneCall.push('Is it one fixture or multiple fixtures?');
      phoneCall.push('Are you using LED bulbs with an old dimmer?');
      phoneCall.push('Does it happen at specific times or randomly?');
      onSite.push('Check for loose connections at panel');
      onSite.push('Test voltage stability');
      onSite.push('Inspect service entrance if whole-house flicker');
    }


    // Breaker tripping
    if (message.includes('breaker') && message.includes('trip')) {
      phoneCall.push('How often does the breaker trip?');
      phoneCall.push('What devices are on the circuit?');
      phoneCall.push('Does it trip immediately or after some time?');
      onSite.push('Test for short circuit or ground fault');
      onSite.push('Measure actual load on circuit');
      onSite.push('Inspect breaker for damage');
    }


    // Panel upgrade
    if (message.includes('panel') && message.includes('upgrade')) {
      phoneCall.push('Current service amperage? (100A, 150A, 200A?)');
      phoneCall.push('Target amperage needed?');
      phoneCall.push('Age of home and existing panel?');
      onSite.push('Inspect service entrance and meter base condition');
      onSite.push('Check for aluminum wiring');
      onSite.push('Verify grounding system');
      onSite.push('Coordinate permit and utility requirements');
    }


    // Power loss
    if (message.includes('no power') || message.includes('lost power')) {
      phoneCall.push('Is it the whole house, one circuit, or one room?');
      phoneCall.push('Have you checked and reset breakers?');
      phoneCall.push('Did anything happen before power loss? (storm, loud noise, etc.)');
      onSite.push('Check main breaker and service entrance');
      onSite.push('Test for voltage at panel');
      onSite.push('Inspect for damaged wiring');
    }


    // EV Charger
    if (message.includes('ev charger') || message.includes('tesla')) {
      phoneCall.push('What is the charger amperage rating? (32A, 40A, 48A?)');
      phoneCall.push('Hardwired or plug-in installation?');
      phoneCall.push('Distance from panel to installation location?');
      onSite.push('Verify panel has spare capacity for new load');
      onSite.push('Determine best routing path');
      onSite.push('Check if panel upgrade needed');
    }


    // Hot tub
    if (message.includes('hot tub') || message.includes('spa')) {
      phoneCall.push('What is the hot tub amperage requirement?');
      phoneCall.push('Distance from panel to hot tub location?');
      phoneCall.push('Is there existing conduit or will it be surface-mounted?');
      onSite.push('Verify panel capacity');
      onSite.push('Determine conduit routing');
      onSite.push('Check local code requirements for disconnect location');
    }


    // Renovation/Remodel
    if (message.includes('basement') || message.includes('renovation') || message.includes('remodel')) {
      phoneCall.push('Do you have plans or layout drawings?');
      phoneCall.push('How many outlets, switches, and fixtures needed?');
      phoneCall.push('Any special requirements? (home theater, workshop, etc.)');
      onSite.push('Confirm final layout and scope');
      onSite.push('Check for obstacles in walls/ceiling');
      onSite.push('Verify permit requirements');
    }


    // Ceiling fan
    if (message.includes('ceiling fan')) {
      phoneCall.push('Is there an existing light fixture or fan?');
      phoneCall.push('Do you have the fan or need recommendation?');
      phoneCall.push('Do you want separate switches for fan and light?');
      onSite.push('Verify ceiling box is fan-rated');
      onSite.push('Check if additional wiring needed for separate controls');
    }


    // Generator
    if (message.includes('generator')) {
      phoneCall.push('Generator size/wattage?');
      phoneCall.push('Portable or standby generator?');
      phoneCall.push('Which circuits do you want on backup power?');
      onSite.push('Verify panel compatibility');
      onSite.push('Determine transfer switch location');
      onSite.push('Plan fuel line routing (if gas)');
    }


    // Rewiring
    if (message.includes('rewire') || message.includes('aluminum') || message.includes('knob')) {
      phoneCall.push('Age of home?');
      phoneCall.push('How many rooms/floors?');
      phoneCall.push('Are walls open or will drywall work be needed?');
      onSite.push('Full assessment of existing wiring');
      onSite.push('Identify all circuits and loads');
      onSite.push('Plan new panel location if needed');
      onSite.push('Coordinate with other trades if renovation');
    }


    // Smoke detectors
    if (message.includes('smoke') || message.includes('carbon monoxide')) {
      phoneCall.push('How many detectors needed?');
      phoneCall.push('Hardwired or battery-powered?');
      phoneCall.push('Interconnected system desired?');
      onSite.push('Verify wiring exists or plan new runs');
      onSite.push('Check local code requirements for placement');
    }


    // Generic short description
    if (message.length < 20) {
      phoneCall.push('Very limited description - follow up for detailed information');
    }


    // Default on-site check
    if (onSite.length === 0) {
      onSite.push('Confirm all details and scope on-site before starting work');
    }


    return {
      phoneCall: phoneCall.length > 0 ? phoneCall : ['Confirm appointment time and address'],
      onSite: onSite
    };
  }
};


// Made with Bob

