import assert from 'node:assert/strict';
import test from 'node:test';
import { createPersonaGenClient } from '../references/personagen-client.mjs';
import { buildPersonaRequest } from './public-persona.mjs';

function jsonResponse(status, body) {
  return { status, json: async () => body };
}

test('discovers, looks up, validates and generates through advertised HTTP operations', async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: new URL(url), init });
    if (calls.length === 1) return jsonResponse(200, {
      success: true,
      data: {
        operation_links: {
          filter_values: '/us/filters/{dimension}/values',
          validate_personas: '/us/personas/validate',
          generate_personas: '/us/personas',
        },
      },
    });
    if (calls.length === 2) return jsonResponse(200, {
      success: true,
      data: { dimension: 'employer_sector', values: ['saas_software'], total: 1, next_offset: null },
    });
    if (calls.length === 3) return jsonResponse(200, {
      success: true,
      data: { country: 'us', count: 2, seed: 'b2b-pilot', generation_guaranteed: false },
    });
    if (calls.length === 4) return jsonResponse(200, { success: true, data: [], metadata: { count: 2 } });
    throw new Error('Unexpected HTTP request');
  };
  const client = createPersonaGenClient({ baseUrl: 'https://api.test', fetchImpl });

  const capability = await client.capabilities('us');
  assert.equal(capability.status, 200);
  await client.filterValues('us', 'employer_sector', { q: 'software', offset: 0, limit: 25 });
  const request = {
    count: 2,
    seed: 'b2b-pilot',
    filters: { employer_sector: ['saas_software'], career_context_scope: ['current_role'] },
  };
  const result = await client.validateThenGenerate('us', request);

  assert.equal(result.validation.accepted, true);
  assert.equal(result.generated, true);
  assert.deepEqual(calls.map(({ url }) => `${url.pathname}${url.search}`), [
    '/us/capabilities?compact=true',
    '/us/filters/employer_sector/values?q=software&offset=0&limit=25',
    '/us/personas/validate',
    '/us/personas',
  ]);
  assert.equal(calls[2].init.body, calls[3].init.body);
  assert.deepEqual(JSON.parse(calls[2].init.body), request);
});

test('does not call generation after a static 422 validation result', async () => {
  let generationCalls = 0;
  const fetchImpl = async (url) => {
    const path = new URL(url).pathname;
    if (path.endsWith('/capabilities')) return jsonResponse(200, {
      success: true,
      data: { operation_links: { validate_personas: '/uk/personas/validate', generate_personas: '/uk/personas' } },
    });
    if (path.endsWith('/validate')) return jsonResponse(422, {
      success: false,
      error: { code: 'UNSATISFIABLE_FILTERS' },
    });
    generationCalls += 1;
    return jsonResponse(200, { success: true, data: [] });
  };
  const client = createPersonaGenClient({ baseUrl: 'https://api.test', fetchImpl });
  const result = await client.validateThenGenerate('uk', { count: 1, seed: 'blocked', filters: {} });

  assert.equal(result.validation.status, 422);
  assert.equal(result.validation.accepted, false);
  assert.equal(result.generated, false);
  assert.equal(generationCalls, 0);
});

test('does not guess unadvertised operations or forward credentials to another origin', async () => {
  let calls = 0;
  const noLinksClient = createPersonaGenClient({
    baseUrl: 'https://api.test',
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse(200, { success: true, data: {} });
    },
  });
  await assert.rejects(noLinksClient.filterValues('uk', 'gender'), /did not advertise/);
  assert.equal(calls, 1);

  const maliciousClient = createPersonaGenClient({
    baseUrl: 'https://api.test',
    headers: { 'X-API-Key': 'test-only' },
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse(200, {
        success: true,
        data: { operation_links: { validate_personas: 'https://attacker.invalid/collect' } },
      });
    },
  });
  await assert.rejects(maliciousClient.validate('uk', { count: 1, seed: 'fixture', filters: {} }), /invalid validate_personas/);
  assert.equal(calls, 2);
});

test('the model projection preserves ordinary work while dropping unrecognized private fields', () => {
  const person = {
    name: { first_name: 'Riley', last_name: 'Jordan' },
    identity: { age: 41, gender: 'woman' },
    work: {
      occupation_title: 'Operations manager',
      occupation_code: '11-1021.00',
      employment_status: 'employed_full_time',
      career_context: {
        scope: 'current_role',
        canonical_role: 'general_and_operations_managers',
        occupation_title: 'Operations manager',
        employer_type: 'private_company',
        company_size_band: 'medium',
        business_ownership_status: 'not_owner',
        industry: { code: '54161', label: 'Management consulting services', sectors: ['professional_services'] },
        source_posture: 'private source note',
        private_profile_key: 'private_profile_sentinel',
        warnings: ['private diagnostic'],
      },
    },
    metadata: { private_profile_key: 'private_profile_sentinel' },
  };
  const body = buildPersonaRequest({
    country: 'us', surveyed: 'October 2026', question: 'Would you choose this?',
    context: 'This is a hypothetical choice.', options: ['Yes', 'No'],
  }, person, [0, 1]);
  const profile = body.state.respondent.profile;

  assert.equal(profile.work.occupation_title, 'Operations manager');
  assert.equal(profile.work.employment_status, 'employed_full_time');
  assert.deepEqual(profile.work.career_context.industry, {
    code: '54161', label: 'Management consulting services', sectors: ['professional_services'],
  });
  assert.equal(profile.work.career_context.company_size_band, 'medium');
  assert.equal(JSON.stringify(body).includes('private_profile_sentinel'), false);
  assert.equal(JSON.stringify(body).includes('private source note'), false);
  assert.equal(JSON.stringify(body).includes('private diagnostic'), false);
});
