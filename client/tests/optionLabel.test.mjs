import test from 'node:test';
import assert from 'node:assert/strict';
import { optionLabel } from '../src/utils/optionLabel.js';

test('a drop-down line starts with the direction of the page language (AYK-345)', () => {
  assert.equal(optionLabel('🛞', 'بنشر وتغيير زيوت', 'ar'), '‏🛞 بنشر وتغيير زيوت');
  assert.equal(optionLabel('🛞', 'گاڑی', 'ur-PK'), '‏🛞 گاڑی');
  assert.equal(optionLabel('🛞', 'Tyres', 'en'), '‎🛞 Tyres');
  assert.equal(optionLabel('', 'سباكة', 'ar'), '‏سباكة');
});
