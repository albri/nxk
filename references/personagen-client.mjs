function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function countryPath(country, suffix) {
  if (country !== 'uk' && country !== 'us') throw new TypeError('country must be uk or us');
  return `/${country}/${suffix}`;
}

function operationPath(capabilities, key, baseUrl) {
  const candidate = capabilities?.data?.operation_links?.[key];
  if (typeof candidate !== 'string') {
    throw new Error(`PersonaGen did not advertise the ${key} operation`);
  }
  if (!candidate.startsWith('/') || candidate.startsWith('//')) {
    throw new Error(`PersonaGen advertised an invalid ${key} operation`);
  }
  const baseOrigin = new URL(baseUrl).origin;
  if (new URL(candidate, baseUrl).origin !== baseOrigin) {
    throw new Error(`PersonaGen advertised an invalid ${key} operation`);
  }
  return candidate;
}

/** Small HTTP-only client for the public PersonaGen discovery/validate/draw flow. */
export function createPersonaGenClient({
  baseUrl = 'https://api.personagen.dev',
  headers = {},
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');
  const capabilitiesByCountry = new Map();

  async function request(path, init = {}) {
    const response = await fetchImpl(new URL(path, baseUrl), {
      ...init,
      headers: {
        ...headers,
        ...(init.headers ?? {}),
        ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
    });
    const body = await response.json();
    if (!isRecord(body)) throw new TypeError('PersonaGen returned a non-object response');
    return { status: response.status, body };
  }

  async function capabilities(country, { compact = true } = {}) {
    const path = `${countryPath(country, 'capabilities')}${compact ? '?compact=true' : ''}`;
    const result = await request(path);
    if (result.status === 200 && result.body.success === true) {
      capabilitiesByCountry.set(country, result.body);
    }
    return result;
  }

  async function capabilitiesFor(country) {
    const cached = capabilitiesByCountry.get(country);
    if (cached) return cached;
    const result = await capabilities(country);
    if (result.status !== 200 || result.body.success !== true) {
      throw new Error(`PersonaGen capability discovery failed with HTTP ${result.status}`);
    }
    return result.body;
  }

  async function filterValues(country, dimension, { q, offset = 0, limit = 25 } = {}) {
    const capabilityBody = await capabilitiesFor(country);
    const template = operationPath(
      capabilityBody,
      'filter_values',
      baseUrl,
    );
    const path = template.replace('{dimension}', encodeURIComponent(dimension));
    const url = new URL(path, baseUrl);
    if (q !== undefined) url.searchParams.set('q', q);
    url.searchParams.set('offset', String(offset));
    url.searchParams.set('limit', String(limit));
    return request(`${url.pathname}${url.search}`);
  }

  async function validate(country, requestBody) {
    const capabilityBody = await capabilitiesFor(country);
    const path = operationPath(
      capabilityBody,
      'validate_personas',
      baseUrl,
    );
    const result = await request(path, { method: 'POST', body: JSON.stringify(requestBody) });
    return {
      ...result,
      accepted: result.status === 200 && result.body.success === true &&
        isRecord(result.body.data) && result.body.data.generation_guaranteed === false,
    };
  }

  async function generate(country, requestBody) {
    const capabilityBody = await capabilitiesFor(country);
    const path = operationPath(
      capabilityBody,
      'generate_personas',
      baseUrl,
    );
    return request(path, { method: 'POST', body: JSON.stringify(requestBody) });
  }

  async function validateThenGenerate(country, requestBody) {
    const validation = await validate(country, requestBody);
    if (!validation.accepted) {
      return { validation, generated: false };
    }
    const generation = await generate(country, requestBody);
    return { validation, generation, generated: true };
  }

  return { capabilities, filterValues, validate, generate, validateThenGenerate };
}
