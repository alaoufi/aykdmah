'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=path.resolve(__dirname,'..');
test('registry maps projects to distinct repositories and has safe approvals',()=>{
 const data=JSON.parse(fs.readFileSync(path.join(base,'projects.json'),'utf8'));
 assert.ok(data.projects.length>=2);
 assert.equal(new Set(data.projects.map(p=>p.id)).size,data.projects.length);
 assert.equal(new Set(data.projects.map(p=>p.repository.toLowerCase())).size,data.projects.length);
 assert.equal(data.policy.allowMeteredApi,false);
 assert.equal(data.policy.allowAutomaticPurchases,false);
 assert.ok(data.policy.requireOwnerApprovalFor.includes('app-store-release'));
 for(const p of data.projects) assert.ok(p.deliverables.length>0);
});
test('app store integration defaults to disabled',()=>{
 const s=JSON.parse(fs.readFileSync(path.join(base,'store-registry.json'),'utf8'));
 for(const p of s.applications){assert.equal(p.googlePlay.enabled,false);assert.equal(p.appStore.enabled,false)}
});
test('PWA metadata valid',()=>{
 const m=JSON.parse(fs.readFileSync(path.join(base,'public/manifest.webmanifest'),'utf8'));
 assert.equal(m.display,'standalone');assert.equal(m.dir,'rtl');
});
