import test from 'node:test';
import assert from 'node:assert/strict';
import {createTrustedHost,executeGovernedOperation} from '../runtime/index.mjs';
for (const host of [undefined,{}, {caller_class:'CODEX_SKILL_NORMAL_USE'}]) {
  test('unbound host rejects before request normalization or dispatch: '+JSON.stringify(host),async()=>{
    const request=new Proxy({}, {ownKeys(){throw Error('REQUEST_REACHED');}});
    await assert.rejects(executeGovernedOperation(request,host),e=>e.code==='UNAUTHORIZED_OPERATION');
  });
}
for (const missing of ['resolveAuthorization','resolveGovernance','resolveCase','resolveCandidate','resolveProfile']) {
  test('missing trusted callback fails before filesystem/dispatch: '+missing,async()=>{
    const config={principal:'release-test',session:'release-test',workspaceRoot:'NOT_A_PATH',stateRoot:'NOT_A_PATH',resolveAuthorization:()=>null,resolveGovernance:()=>null,resolveCase:()=>null,resolveCandidate:()=>null,resolveProfile:()=>null};
    config[missing]=undefined;
    await assert.rejects(createTrustedHost(config),e=>e.code==='UNAUTHORIZED_OPERATION'&&e.message===missing+' missing');
  });
}
