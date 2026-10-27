import test from 'node:test';
import assert from 'node:assert/strict';
import { localizedSettingLabel, SETTING_LABELS } from '../src/data/settingLabels.js';

const scripts = { ar: /[\u0600-\u06ff]/u, en: /[a-z]/iu, ur: /[\u0600-\u06ff]/u, hi: /[\u0900-\u097f]/u, bn: /[\u0980-\u09ff]/u };

test('all 56 seeded setting labels have native translations in each supported language', () => {
  assert.equal(Object.keys(SETTING_LABELS).length, 56);
  for (const [setting_key, labels] of Object.entries(SETTING_LABELS)) {
    const setting = { setting_key, description: labels.ar };
    for (const [lang, script] of Object.entries(scripts)) {
      assert.match(labels[lang], script, `${setting_key} is missing ${lang}`);
      assert.equal(localizedSettingLabel(setting, lang), labels[lang]);
      assert.equal(localizedSettingLabel(setting, `${lang}-XX`), labels[lang]);
    }
  }
});

test('setting labels require an exact key and source match so administrator edits remain unchanged', () => {
  const setting = { setting_key: 'site_name', description: 'اسم مخصص أضافه المسؤول' };
  assert.equal(localizedSettingLabel(setting, 'hi'), setting.description);
  assert.equal(localizedSettingLabel({ setting_key: 'new_setting', description: 'إعداد إضافي' }, 'bn'), 'إعداد إضافي');
  assert.equal(localizedSettingLabel({ setting_key: 'site_logo', description: SETTING_LABELS.site_name.ar }, 'hi'), SETTING_LABELS.site_name.ar);
  assert.equal(localizedSettingLabel({ setting_key: 'site_name', description: '' }, 'en'), 'site_name');
  assert.equal(localizedSettingLabel({ setting_key: 'constructor', description: 'custom' }, 'en'), 'custom');
  assert.equal(localizedSettingLabel(null, 'en'), '');
});

test('technical provider codes are retained while the surrounding setting label changes language', () => {
  for (const setting_key of ['map_provider', 'review_translation_provider', 'ads_geo_provider']) {
    const source = SETTING_LABELS[setting_key];
    const setting = { setting_key, description: source.ar };
    const code = setting_key === 'map_provider' ? 'osm' : setting_key === 'ads_geo_provider' ? 'ip-api' : 'mymemory';
    for (const lang of ['ar', 'en', 'ur', 'hi', 'bn']) assert.ok(localizedSettingLabel(setting, lang).includes(code));
  }
});
