import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {executeGovernedOperation,repositoryRoot} from '../runtime/index.mjs';
import {fileIdentity} from '../runtime/governance/primitives.mjs';
import {setup} from './portable-test-host.mjs';
import {materialSpec,rig} from './portable-fixtures.mjs';
const h=await setup();console.error('SMOKE_ROOT='+h.root);const fixture=path.join(repositoryRoot,'runtime','assets','citrine-normal-use.glb');
const r=await h.request('AUDIT',{asset:await fileIdentity(fixture),candidate_ref:null});await h.authorize(r);const audit=await executeGovernedOperation(r,h.host);assert.equal(audit.admission.status,'ADMITTED');
let build=null,builtAudit=null;
if(process.env.GEMSTONE_SMOKE_MODE!=='render-only'){
const buildRequest=await h.request('BUILD',{materialSpec,candidateLabel:'portability-smoke',parent_candidate_ref:null},'case:portability');await h.authorize(buildRequest);build=await executeGovernedOperation(buildRequest,h.host);assert.equal(build.candidate.profile_ref,null);assert.equal(build.candidate.immutable,true);
const ca=build.candidate;h.candidates.set(ca.candidate_id,{candidate_ref:ca.candidate_id,case_ref:ca.case_ref,immutable:true,artifact:ca.artifact});
const ar=await h.request('AUDIT',{asset:ca.artifact,candidate_ref:ca.candidate_id},ca.case_ref);await h.authorize(ar);builtAudit=await executeGovernedOperation(ar,h.host);assert.equal(builtAudit.admission.status,'ADMITTED');
}
const browser=process.env.GEMSTONE_BROWSER;let rendered=null;
if(browser){const rr=await h.request('RENDER',{asset:await fileIdentity(fixture),candidate_ref:null,admission_ref:r.run_id,rig,browserExecutable:path.normalize(browser)});await h.authorize(rr);rendered=await executeGovernedOperation(rr,h.host);assert.equal(rendered.authoritative_output,'LEGACY');assert.equal(rendered.raw_adapter_result.material.preserved,true);}
const summary={status:browser?'PASS':'PARTIAL_BROWSER_NOT_SUPPLIED',root:h.root,existingAssetAudit:audit.status,build:build?.status??'NOT_EXECUTED',builtCandidateAudit:builtAudit?.status??'NOT_EXECUTED',render:rendered?.status??'NOT_EXECUTED',profilePromotion:0,qualification:false,sourceAsset:await fileIdentity(fixture)};await fs.writeFile(path.join(h.root,'smoke-summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
