import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {hostConfig} from './governance/host.mjs';
import {exact,canonical,hash,token,inside,safePath,fileIdentity,writeNew,deny,GovernanceError} from './governance/primitives.mjs';
import {acquireReadLease} from './governance/read-lease.mjs';
import {admitAsset} from './governance/assets.mjs';
import {translateMaterialSpec,validateReferenceMatchRig} from './production/adapter/engine-tool-adapter.mjs';
export {createTrustedHost} from './governance/host.mjs';
export {GovernanceError} from './governance/primitives.mjs';
export const repositoryRoot=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const engineRoot=path.join(repositoryRoot,'runtime','engine');
const requiredAuthorities=['knowledge','capability','confidence','phase','approval','frozen_scope'];
async function runtimeIdentity(){
  const manifest=JSON.parse(await fs.readFile(new URL('./source-manifest.json',import.meta.url),'utf8'));
  const rows=[];for(const r of manifest.files){const p=path.resolve(repositoryRoot,r.path);if(!inside(path.join(repositoryRoot,'runtime'),p))deny('IDENTITY_MISMATCH');const id=await fileIdentity(p);if(id.sha256!==r.sha256||id.bytes!==r.bytes)deny('IDENTITY_MISMATCH','Packaged runtime source drift: '+r.path);rows.push({...id,relative:r.path});}
  for(const r of manifest.packageFiles??[]){const p=await fs.realpath(path.resolve(engineRoot,'node_modules',r.path));if(!inside(path.join(engineRoot,'node_modules'),p))deny('IDENTITY_MISMATCH','Package resolves outside installed dependency tree');const id=await fileIdentity(p);if(id.sha256!==r.sha256)deny('IDENTITY_MISMATCH','Installed package differs from reviewed lock identity');rows.push({...id,relative:'package:'+r.path});}
  return {fingerprint:hash(rows.map(({relative,sha256,bytes})=>({relative,sha256,bytes}))),files:rows};
}
function requestShape(r){
  exact(r,['schema_version','context_kind','request_id','run_id','authorization_id','operation_id','case_ref','profile_ref','input','output_root'],'request');
  if(r.schema_version!=='1.0.0'||r.context_kind!=='OPERATION_RUN_CONTEXT_V1')deny('CONTEXT_KIND_UNSUPPORTED');
  if(!token(r.request_id)||!token(r.run_id)||typeof r.authorization_id!=='string'||!r.authorization_id)deny('IDENTITY_REQUIRED');
  if(!['BUILD','AUDIT','RENDER'].includes(r.operation_id))deny('UNAUTHORIZED_OPERATION');
  if(!(r.case_ref===null||/^case:[a-z0-9][a-z0-9-]*$/.test(r.case_ref)))deny('IDENTITY_REQUIRED');
  if(!(r.profile_ref===null||typeof r.profile_ref==='string'))deny('PROFILE_STATE_INVALID');
}
// Read-only normalization for Human review; this function neither approves nor dispatches.
export async function prepareOperation(request,host){
  const c=hostConfig(host);const r=JSON.parse(canonical(request));requestShape(r);
  await safePath(r.output_root,'directory');
  if(!inside(c.workspaceRoot,r.output_root)||inside(path.join(repositoryRoot,'runtime'),r.output_root)||r.output_root===path.join(repositoryRoot,'runtime')||inside(c.stateRoot,r.output_root)||inside(r.output_root,c.stateRoot)||r.output_root===c.stateRoot)deny('UNAUTHORIZED_OPERATION','Output/state/source separation required');
  if((await fs.readdir(r.output_root)).length)deny('OUTPUT_ALREADY_EXISTS','Dedicated empty operation output required');
  const runtime=await runtimeIdentity();let input,identity=null,outputs=[],browser=null;
  if(r.operation_id==='BUILD'){
    exact(r.input,['materialSpec','candidateLabel','parent_candidate_ref'],'build input');if(!r.case_ref)deny('IDENTITY_REQUIRED','Real Case required before first build');
    const t=translateMaterialSpec(r.input.materialSpec,{candidateLabel:r.input.candidateLabel});
    if(r.input.parent_candidate_ref!==null&&typeof r.input.parent_candidate_ref!=='string')deny('IDENTITY_REQUIRED');
    const stem=t.candidateLabel+'-'+t.specSha256.slice(0,12).toLowerCase();
    outputs=[stem+'.glb',stem+'.manifest.json'];input={materialSpec:t.materialSpecUsed,candidateLabel:t.candidateLabel,outputDirectory:r.output_root,engineRoot};
    identity={kind:'BUILD_REQUEST',request_id:r.request_id,spec_sha256:t.specSha256,parent_candidate_ref:r.input.parent_candidate_ref};
  }else{
    exact(r.input,r.operation_id==='AUDIT'?['asset','candidate_ref']:['asset','candidate_ref','admission_ref','rig','browserExecutable'],'asset input');
    exact(r.input.asset,['locator','sha256','bytes'],'asset identity');
    const actual=await fileIdentity(r.input.asset.locator);if(canonical(actual)!==canonical(r.input.asset))deny('IDENTITY_MISMATCH','Asset identity mismatch');
    if(r.input.candidate_ref!==null&&typeof r.input.candidate_ref!=='string')deny('IDENTITY_REQUIRED');
    identity={kind:r.input.candidate_ref?'CANDIDATE':'IMPORTED_ASSET',...actual,candidate_ref:r.input.candidate_ref};
    input={glbPath:actual.locator,engineRoot};
    if(r.operation_id==='RENDER'){
      if(!token(r.input.admission_ref))deny('IDENTITY_REQUIRED','Prior run admission reference required');
      browser=await fileIdentity(r.input.browserExecutable);
      input={candidateGlb:actual.locator,rig:validateReferenceMatchRig(r.input.rig),outputImage:path.join(r.output_root,'render.png'),engineRoot,browserExecutable:browser.locator};outputs=['render.png','render.render.json'];
    }
  }
  const candidateRef=r.input.candidate_ref??r.input.parent_candidate_ref;
  const objectBindings=JSON.parse(canonical({case:r.case_ref?await c.resolveCase(r.case_ref):null,profile:r.profile_ref?await c.resolveProfile(r.profile_ref):null,candidate:candidateRef?await c.resolveCandidate(candidateRef):null}));
  const basisQuery={operation_id:r.operation_id,request_id:r.request_id,run_id:r.run_id,case_ref:r.case_ref,input_identity:identity,effective_input:input,production_path:'LEGACY'};
  const governanceBasis=JSON.parse(canonical(await c.resolveGovernance(basisQuery)));
  const binding={schema_version:'1.0.0',context_kind:r.context_kind,request_id:r.request_id,run_id:r.run_id,operation_id:r.operation_id,caller:{principal:c.principal,session:c.session,caller_class:'CODEX_SKILL_NORMAL_USE'},workspace_root:c.workspaceRoot,state_root:c.stateRoot,case_ref:r.case_ref,profile_ref:r.profile_ref,object_bindings:objectBindings,governance_basis:governanceBasis,production_path:'LEGACY',input_identity:identity,effective_input:input,runtime_fingerprint:runtime.fingerprint,browser,admission_ref:r.input.admission_ref??null,expected_write_set:{output_root:r.output_root,files:[...outputs,'operation-result.json'],temporary_root:path.join(r.output_root,'.operation-temp'),state_run:path.join(c.stateRoot,'runs',r.run_id),receipt_root:path.join(c.stateRoot,'receipts')}};
  return {binding,binding_sha256:hash(binding)};
}
async function resolveAuthority(r,plan,c){
  const a=await c.resolveAuthorization(r.authorization_id);
  try{exact(a,['authorization_id','human_approval_ref','principal','session','run_id','operation_id','binding_sha256','production_path','expires_at','execution_budget','retry'],'trusted authorization');}catch{deny('UNAUTHORIZED_OPERATION','Trusted decision missing or malformed');}
  if(a.authorization_id!==r.authorization_id||!a.human_approval_ref||a.principal!==c.principal||a.session!==c.session||a.run_id!==r.run_id||a.operation_id!==r.operation_id||a.binding_sha256!==plan.binding_sha256||a.production_path!=='LEGACY'||a.execution_budget!==1||a.retry!==false||!Number.isFinite(Date.parse(a.expires_at))||Date.parse(a.expires_at)<=Date.now())deny('UNAUTHORIZED_OPERATION','Approval binding/lifetime mismatch');
  const g=plan.binding.governance_basis;
  if(!g||!/^P(?:[0-9]|10|11)$/.test(g.phase_id)||!g.frozen_scope_ref)deny('UNAUTHORIZED_OPERATION','Phase/Frozen Scope unresolved');
  for(const k of requiredAuthorities)if(g[k]?.state!=='PASS'||typeof g[k]?.source_ref!=='string'||!g[k].source_ref)deny('UNAUTHORIZED_OPERATION','Required authority denied/unresolved: '+k);
  if(r.operation_id==='BUILD'&&!['P4','P5','P6','P7'].includes(g.phase_id))deny('UNAUTHORIZED_OPERATION','Build in invalid mutation phase');
  if(r.case_ref){const cas=await c.resolveCase(r.case_ref);if(cas?.case_ref!==r.case_ref||!cas.provenance_ref)deny('IDENTITY_REQUIRED','Genuine Case not resolved');}
  if(r.profile_ref!==null){const p=await c.resolveProfile(r.profile_ref);if(!p||p.profile_ref!==r.profile_ref||p.case_ref!==r.case_ref||p.committed!==true||!p.content_sha256)deny('PROFILE_STATE_INVALID');}
  const candidateRef=r.input.candidate_ref??r.input.parent_candidate_ref;
  if(candidateRef){const candidate=await c.resolveCandidate(candidateRef);if(!candidate||candidate.candidate_ref!==candidateRef||candidate.immutable!==true||candidate.case_ref!==r.case_ref||!candidate.artifact?.sha256)deny('IDENTITY_MISMATCH','Candidate record mismatch');if(r.operation_id!=='BUILD'&&canonical(candidate.artifact)!==canonical(r.input.asset))deny('IDENTITY_MISMATCH');}
  if(r.operation_id==='RENDER'){
    const result=JSON.parse(await fs.readFile(path.join(c.stateRoot,'runs',r.input.admission_ref,'result.json'),'utf8'));
    if(result.status!=='COMPLETE'||result.operation_id!=='AUDIT'||result.admission?.status!=='ADMITTED'||canonical(result.input_identity)!==canonical(plan.binding.input_identity)||result.runtime_fingerprint!==plan.binding.runtime_fingerprint)deny('IDENTITY_MISMATCH','Stale/wrong admission');
  }
  return {authorization:a,governance:g};
}
function dispatch(operation,input,temp){return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[fileURLToPath(new URL('./governance/adapter-worker.mjs',import.meta.url))],{cwd:engineRoot,windowsHide:true,env:{...process.env,TEMP:temp,TMP:temp,TMPDIR:temp},stdio:['pipe','pipe','pipe']});let stdout='',stderr='';
  child.on('error',reject);child.stdout.on('data',b=>{stdout+=b;});child.stderr.on('data',b=>{stderr+=b;});child.on('close',()=>{try{const value=JSON.parse(stdout);if(!value.ok)reject(Object.assign(new GovernanceError(value.error.code,value.error.message),{adapterDetails:value.error.details}));else resolve(value.result);}catch(e){reject(Object.assign(e,{stderr}));}});child.stdin.end(JSON.stringify({operation,input}));
});}
export async function executeGovernedOperation(request,host){
  const c=hostConfig(host),r=JSON.parse(canonical(request));let plan=await prepareOperation(r,host);let authority=await resolveAuthority(r,plan,c);
  const runtime=await runtimeIdentity();const lease=await acquireReadLease([...runtime.files.map(f=>f.locator),...(plan.binding.input_identity.locator?[plan.binding.input_identity.locator]:[])]);
  let runDir=null,reserved=false;
  try{
    lease.assert();const fresh=await prepareOperation(r,host);if(fresh.binding_sha256!==plan.binding_sha256)deny('IDENTITY_MISMATCH');plan=fresh;authority=await resolveAuthority(r,plan,c);
    if(r.operation_id!=='BUILD')await admitAsset(plan.binding.input_identity.locator);
    await safePath(c.stateRoot,'directory');await fs.mkdir(path.join(c.stateRoot,'receipts'),{recursive:true});await fs.mkdir(path.join(c.stateRoot,'runs'),{recursive:true});
    await safePath(path.join(c.stateRoot,'receipts'),'directory');await safePath(path.join(c.stateRoot,'runs'),'directory');
    const receipt=path.join(c.stateRoot,'receipts',hash([c.principal,r.authorization_id])+'.json');
    try{await writeNew(receipt,{status:'RESERVED_NO_AUTOMATIC_RETRY',authorization:authority.authorization,binding_sha256:plan.binding_sha256});reserved=true;}catch(e){if(e.code==='EEXIST')deny('UNAUTHORIZED_OPERATION','Authorization already consumed');throw e;}
    runDir=path.join(c.stateRoot,'runs',r.run_id);await fs.mkdir(runDir);await writeNew(path.join(runDir,'context.json'),{...plan.binding,authority_class:'EXECUTION_STATE_NON_AUTHORITATIVE',lifecycle_state:'ACTIVE',governance:authority.governance,human_approval_ref:authority.authorization.human_approval_ref});
    const temp=plan.binding.expected_write_set.temporary_root;await fs.mkdir(temp);
    lease.assert();const raw=await dispatch(r.operation_id,plan.binding.effective_input,temp);lease.assert();
    if(plan.binding.input_identity.locator&&canonical(await fileIdentity(plan.binding.input_identity.locator))!==canonical(r.input.asset))deny('IDENTITY_MISMATCH','Input changed during operation');
    const actualNames=(await fs.readdir(r.output_root)).filter(n=>n!=='.operation-temp');const expected=plan.binding.expected_write_set.files.filter(n=>n!=='operation-result.json');
    if(canonical(actualNames.sort())!==canonical([...expected].sort()))deny('UNEXPECTED_WRITE_SET');
    const outputs=[];for(const name of actualNames)outputs.push(await fileIdentity(path.join(r.output_root,name)));
    let candidate=null,admission=null;
    if(r.operation_id==='BUILD'){
      await admitAsset(raw.glb.path);const artifact=await fileIdentity(raw.glb.path);
      candidate={schema_version:'1.0.0',candidate_id:`candidate:${r.case_ref.slice(5)}:${r.run_id}@1.0.0`,object_revision:'1.0.0',case_ref:r.case_ref,parent_candidate_ref:r.input.parent_candidate_ref,immutable:true,changed_domains:['geometry','material'],frozen_domains:['profile','golden','source'],profile_ref:r.profile_ref,artifact,tool_candidate_label:raw.candidateRef};
      await writeNew(path.join(runDir,'candidate.json'),candidate);
    }
    if(r.operation_id==='AUDIT'&&raw.status==='AUDIT_COMPLETE'&&raw.fatalTechnicalErrors?.length===0)admission={status:'ADMITTED',scope:'TECHNICAL_ASSET_ONLY',contract:'SELF_CONTAINED_GLB_ONLY',qualification:false};
    const result={status:'COMPLETE',operation_id:r.operation_id,request_id:r.request_id,run_id:r.run_id,authorization_id:r.authorization_id,input_identity:plan.binding.input_identity,output_identities:outputs,candidate,admission,runtime_fingerprint:plan.binding.runtime_fingerprint,authoritative_output:'LEGACY',relational_path_v1:'DISABLED_BY_DEFAULT',raw_adapter_result:raw,qualification:false,promotion:false};
    await writeNew(path.join(runDir,'result.json'),result);await writeNew(path.join(r.output_root,'operation-result.json'),result);await writeNew(path.join(runDir,'lifecycle.json'),{lifecycle_state:'COMPLETED',run_id:r.run_id,result_sha256:hash(result)});return result;
  }catch(error){if(reserved&&runDir)await writeNew(path.join(runDir,'failure.json'),{status:'FAILED_OR_UNKNOWN',code:error.code??'RUNTIME_ERROR',message:error.message,mutation_state:'UNKNOWN_RECONCILE_BEFORE_RETRY',authorization_consumed:true}).catch(()=>{});throw error;}
  finally{await lease.release();}
}
