import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { integrationLabels, localizedIntegrationText } from '../src/data/referenceIntegrationLabels.js';

process.env.NODE_ENV = 'test';
const require = createRequire(new URL('../../server/package.json', import.meta.url));
const { listAllTypes, listAdapters } = require('./services/integrations/index.js');
const nativeScript = { ar: /[\u0600-\u06ff]/u, ur: /[\u0600-\u06ff]/u, hi: /[\u0900-\u097f]/u, bn: /[\u0980-\u09ff]/u };

test('built-in integration descriptions and field labels follow every supported UI language', () => {
  for (const type of listAllTypes()) {
    for (const adapter of listAdapters(type)) {
      const labels = [adapter.description, ...adapter.fields.map(field => field.label), ...adapter.config_fields.map(field => field.label)].filter(Boolean);
      for (const label of labels) {
        assert.equal(localizedIntegrationText(label, 'en'), label);
        for (const [language, script] of Object.entries(nativeScript)) {
          assert.match(localizedIntegrationText(label, language), script, `${type}/${adapter.provider}: ${label} needs ${language}`);
        }
      }
    }
  }
});

test('integration translation preserves provider identities and custom labels', () => {
  for (const value of ['Twilio', 'Unifonic', 'Custom administrator description', 'api_key', 'https://gateway.example.invalid']) {
    for (const language of ['ar', 'en', 'ur', 'hi', 'bn']) assert.equal(localizedIntegrationText(value, language), value);
  }
  for (const entry of integrationLabels) {
    assert.equal(localizedIntegrationText(entry.en, 'hi-IN'), entry.hi);
    assert.equal(localizedIntegrationText(entry.en, 'bn-BD'), entry.bn);
  }
});
