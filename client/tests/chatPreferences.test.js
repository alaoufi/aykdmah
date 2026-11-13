import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
test('bold preference survives reload, rejects corrupt values and applies only chat variable', () => {
  const storage = new Map(); const properties = new Map();
  const source = fs.readFileSync(new URL('../src/utils/chatPrefs.js', import.meta.url), 'utf8').replace(/^import .*;\r?\n/, '').replaceAll('export ', '');
  const context = vm.createContext({ localStorage: { getItem: k => storage.get(k), setItem: (k,v) => storage.set(k,v) }, document: {documentElement:{style:{setProperty:(k,v)=>properties.set(k,v)}}}, window:{dispatchEvent(){}}, CustomEvent:class {} });
  vm.runInContext(source, context);
  assert.equal(vm.runInContext('readChatPrefs().bold', context), false);
  vm.runInContext('saveChatPrefs({bold:true})', context);
  assert.equal(vm.runInContext('readChatPrefs().bold', context), true);
  assert.equal(properties.get('--chat-font-weight'), '700');
  storage.set('aykdmh_chat_prefs', '{"bold":"true"}');
  assert.equal(vm.runInContext('readChatPrefs().bold', context), false);
});
