/**
 * AI ENRICHMENT (optional)
 * Thin wrapper around Groq's OpenAI-compatible chat completions endpoint, used only
 * to reclassify jobs the offline InferenceEngine marks "Not determined." Pure and
 * network-only: takes a message and a Groq API key, returns a promise that resolves
 * to the same output shape as InferenceEngine.analyze(), or rejects with a
 * descriptive Error. Never touches the DOM or app state.
 */
const AIEnrichment = (function () {

  const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
  const GROQ_MODEL = 'llama-3.3-70b-versatile';

  const SYSTEM_PROMPT = `You are a classification assistant for a residential electrician job dispatch platform.
A customer's free-text service request could not be confidently classified by the offline rules engine, so you are being asked to make a best-effort judgment call.

Scope: residential electrical FIXES and REPAIRS. If the message clearly describes a NEW installation or project rather than something broken, set inScope to false.

Safety override: if the message mentions sparking, smoke, a burning smell, shock, arcing, or a total loss of power, urgency must be "high".

Respond with ONLY a single JSON object (no markdown, no commentary) with this exact shape:
{
  "jobType": "short label, for example 'Outlet repair'",
  "partOfHouse": "short label, for example 'Kitchen', or 'Not specified'",
  "urgency": "low" or "medium" or "high",
  "laborEstimate": { "min": number of hours, "max": number of hours },
  "materials": [ { "name": string, "prob": "surely" or "likely" or "maybe" } ],
  "tools": [ string, ... ],
  "uncertainties": { "phoneCall": [string, ...], "onSite": [string, ...] },
  "inScope": boolean
}

"materials" should list parts likely needed, ranked by confidence. "tools" should list any tools beyond a standard electrician toolkit (voltage tester, screwdrivers, wire strippers, pliers). "uncertainties.phoneCall" are questions to ask before booking; "uncertainties.onSite" are checks to make on arrival. If you genuinely cannot determine anything useful, set jobType to "Not determined".`;


  function buildUserPrompt(message, context) {
    return [
      `Customer message: """${message}"""`,
      `Customer name provided: ${context && context.name ? 'yes' : 'no'}`,
      `Customer address provided: ${context && context.address ? 'yes' : 'no'}`
    ].join('\n');
  }


  // Coerce and defend against a malformed or partially-shaped AI response.
  function validateResult(raw) {
    if (!raw || typeof raw !== 'object') throw new Error('AI response was not a JSON object.');

    const jobType = String(raw.jobType || '').trim();
    if (!jobType || /^not determined/i.test(jobType)) {
      throw new Error('AI could not determine a job type either.');
    }

    const urgency = ['low', 'medium', 'high'].includes(raw.urgency) ? raw.urgency : 'medium';

    const laborEstimate = (raw.laborEstimate && typeof raw.laborEstimate === 'object')
      ? { min: Number(raw.laborEstimate.min) || 0, max: Number(raw.laborEstimate.max) || 0 }
      : { min: 1, max: 2 };

    const materials = Array.isArray(raw.materials)
      ? raw.materials
          .filter(m => m && typeof m.name === 'string' && m.name.trim())
          .map(m => ({ name: m.name.trim(), prob: ['surely', 'likely', 'maybe'].includes(m.prob) ? m.prob : 'maybe' }))
      : [];

    const tools = Array.isArray(raw.tools) ? raw.tools.filter(t => typeof t === 'string' && t.trim()) : [];

    const uncertainties = (raw.uncertainties && typeof raw.uncertainties === 'object')
      ? {
          phoneCall: Array.isArray(raw.uncertainties.phoneCall) ? raw.uncertainties.phoneCall.filter(s => typeof s === 'string' && s.trim()) : [],
          onSite: Array.isArray(raw.uncertainties.onSite) ? raw.uncertainties.onSite.filter(s => typeof s === 'string' && s.trim()) : []
        }
      : { phoneCall: [], onSite: [] };

    const partOfHouse = String(raw.partOfHouse || '').trim() || 'Not specified';
    const inScope = raw.inScope !== false;

    return { jobType, partOfHouse, urgency, laborEstimate, materials, tools, uncertainties, inScope };
  }


  async function classify(message, context, apiKey) {
    if (!apiKey) throw new Error('No Groq API key configured.');
    if (!message || !message.trim()) throw new Error('No message to classify.');

    const requestBody = {
      model: GROQ_MODEL,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(message, context) }
      ]
    };

    let response;
    try {
      response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestBody)
      });
    } catch (networkErr) {
      throw new Error('Could not reach Groq (network error or the request was blocked).');
    }

    if (!response.ok) {
      let detail = '';
      try {
        const errJson = await response.json();
        detail = (errJson && errJson.error && errJson.error.message) || '';
      } catch (_) { /* response body wasn't JSON; fall through with no detail */ }
      throw new Error(`Groq API error (${response.status})${detail ? ': ' + detail : ''}.`);
    }

    const data = await response.json();
    const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!content) throw new Error('Groq returned an empty response.');

    let raw;
    try {
      raw = JSON.parse(content);
    } catch (parseErr) {
      throw new Error('Could not parse the AI response as JSON.');
    }

    return validateResult(raw);
  }

  return { classify };
})();
