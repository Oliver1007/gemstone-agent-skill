import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createTrustedHost,prepareOperation} from '../runtime/index.mjs';
export async function setup(){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'gemstone-portability-'));const state=path.join(root,'state');await fs.mkdir(state);const grants=new Map();const candidates=new Map();
  const basis={phase:'P4',frozen_scope_ref:'test-only:packaging-smoke-no-source-write'};for(const k of ['knowledge','capability','confidence','phase','approval','frozen_scope'])if(k!=='phase')basis[k]={state:'PASS',source_ref:'test-only:bounded-portability-fixture'};
  // phase routing and Phase authority are separate fields in the provider response.
  const governance={phase_id:'P4',frozen_scope_ref:basis.frozen_scope_ref};for(const k of ['knowledge','capability','confidence','phase','approval','frozen_scope'])governance[k]={state:'PASS',source_ref:'test-only:bounded-portability-fixture'};
  const host=await createTrustedHost({principal:'packaging-test',session:'isolated-test-session',workspaceRoot:root,stateRoot:state,resolveAuthorization:async id=>grants.get(id),resolveGovernance:async()=>governance,resolveCase:async ref=>ref==='case:portability'?{case_ref:ref,provenance_ref:'test-only:explicit-synthetic-case'}:null,resolveCandidate:async ref=>candidates.get(ref),resolveProfile:async()=>null});
  let n=0;
  async function request(operation,input,caseRef=null){n++;const output=path.join(root,'output-'+n);await fs.mkdir(output);return{schema_version:'1.0.0',context_kind:'OPERATION_RUN_CONTEXT_V1',request_id:'request-'+n,run_id:'run-'+n,authorization_id:'test-grant-'+n,operation_id:operation,case_ref:caseRef,profile_ref:null,input,output_root:output};}
  async function authorize(r){const p=await prepareOperation(r,host);grants.set(r.authorization_id,{authorization_id:r.authorization_id,human_approval_ref:'TEST_ONLY_CURRENT_PACKAGING_SMOKE_SCOPE',principal:'packaging-test',session:'isolated-test-session',run_id:r.run_id,operation_id:r.operation_id,binding_sha256:p.binding_sha256,production_path:'LEGACY',expires_at:new Date(Date.now()+600000).toISOString(),execution_budget:1,retry:false});return p;}
  return{root,state,host,grants,candidates,governance,request,authorize};
}
