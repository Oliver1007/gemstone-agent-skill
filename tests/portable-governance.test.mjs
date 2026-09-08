import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {executeGovernedOperation,prepareOperation,repositoryRoot} from '../runtime/index.mjs';
import {fileIdentity,canonical,hash} from '../runtime/governance/primitives.mjs';
import {admitAsset} from '../runtime/governance/assets.mjs';
import {acquireReadLease} from '../runtime/governance/read-lease.mjs';
import {setup} from './portable-test-host.mjs';
import {materialSpec} from './portable-fixtures.mjs';
const fixture=path.join(repositoryRoot,'runtime','assets','citrine-normal-use.glb');
test('normal-use asset is pinned and self-contained',async()=>{assert.equal((await fileIdentity(fixture)).sha256,'8FB9E9DBD2DA677CABD26C40C3D8FE205825196E3829CEED4B5B2547A41016E4');assert.equal((await admitAsset(fixture)).contract,'SELF_CONTAINED_GLB_ONLY');});
test('canonical request binding deterministic and finite-only',()=>{assert.equal(hash({b:1,a:2}),hash({a:2,b:1}));assert.throws(()=>canonical({x:NaN}));assert.throws(()=>canonical({x:undefined}));});
test('untrusted host cannot dispatch',async()=>{await assert.rejects(executeGovernedOperation({},{}),e=>e.code==='UNAUTHORIZED_OPERATION');});
for(const [field,value]of Object.entries({operation_id:'BUILD',principal:'other',session:'other',run_id:'wrong',binding_sha256:'0'.repeat(64),production_path:'RELATIONAL_PATH_V1',expires_at:'2000-01-01',execution_budget:2,retry:true})){
  test('reject grant mismatch '+field,async()=>{const h=await setup();const r=await h.request('AUDIT',{asset:await fileIdentity(fixture),candidate_ref:null});await h.authorize(r);h.grants.get(r.authorization_id)[field]=value;await assert.rejects(executeGovernedOperation(r,h.host));assert.deepEqual(await fs.readdir(r.output_root),[]);assert.deepEqual(await fs.readdir(h.state),[]);});
}
test('missing approval fails without writes',async()=>{const h=await setup();const r=await h.request('AUDIT',{asset:await fileIdentity(fixture),candidate_ref:null});await assert.rejects(executeGovernedOperation(r,h.host));assert.deepEqual(await fs.readdir(h.state),[]);});
for(const dimension of ['knowledge','capability','confidence','phase','approval','frozen_scope'])test('weakest authority '+dimension,async()=>{const h=await setup();const r=await h.request('AUDIT',{asset:await fileIdentity(fixture),candidate_ref:null});await h.authorize(r);h.governance[dimension].state='UNKNOWN';await assert.rejects(executeGovernedOperation(r,h.host),e=>e.code==='UNAUTHORIZED_OPERATION');assert.deepEqual(await fs.readdir(h.state),[]);});
test('old context cannot downgrade to profileless route',async()=>{const h=await setup();const r=await h.request('AUDIT',{asset:await fileIdentity(fixture),candidate_ref:null});r.context_kind='ACTIVE_CASE';await assert.rejects(prepareOperation(r,h.host),e=>e.code==='CONTEXT_KIND_UNSUPPORTED');});
test('forged Profile rejected',async()=>{const h=await setup();const r=await h.request('AUDIT',{asset:await fileIdentity(fixture),candidate_ref:null},'case:portability');r.profile_ref='profile:fake:fake@1.0.0';await h.authorize(r);await assert.rejects(executeGovernedOperation(r,h.host),e=>e.code==='PROFILE_STATE_INVALID');});
test('build requires real Case not placeholder',async()=>{const h=await setup();const r=await h.request('BUILD',{materialSpec,candidateLabel:'test',parent_candidate_ref:null});await assert.rejects(prepareOperation(r,h.host),e=>e.code==='IDENTITY_REQUIRED');r.case_ref='case:invented';await h.authorize(r);await assert.rejects(executeGovernedOperation(r,h.host),e=>e.code==='IDENTITY_REQUIRED');});
test('input hash mismatch rejected',async()=>{const h=await setup();const r=await h.request('AUDIT',{asset:{...await fileIdentity(fixture),sha256:'0'.repeat(64)},candidate_ref:null});await assert.rejects(prepareOperation(r,h.host),e=>e.code==='IDENTITY_MISMATCH');});
test('output escape rejected',async()=>{const h=await setup();const r=await h.request('AUDIT',{asset:await fileIdentity(fixture),candidate_ref:null});r.output_root=path.join(repositoryRoot,'runtime','assets');await assert.rejects(prepareOperation(r,h.host));});
test('consumed grant cannot dispatch or create run',async()=>{const h=await setup();const r=await h.request('AUDIT',{asset:await fileIdentity(fixture),candidate_ref:null});await h.authorize(r);await fs.mkdir(path.join(h.state,'receipts'));await fs.writeFile(path.join(h.state,'receipts',hash(['packaging-test',r.authorization_id])+'.json'),'{}');await assert.rejects(executeGovernedOperation(r,h.host),e=>e.code==='UNAUTHORIZED_OPERATION');assert.deepEqual(await fs.readdir(r.output_root),[]);});
test('Windows read lease actually denies writes, not an attestation',async()=>{const h=await setup(),p=path.join(h.root,'lease.txt');await fs.writeFile(p,'original');const lease=await acquireReadLease([p]);try{await assert.rejects(fs.writeFile(p,'changed'));assert.equal(await fs.readFile(p,'utf8'),'original');}finally{await lease.release();}await fs.writeFile(p,'released');});
