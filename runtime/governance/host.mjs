import {exact,deny,safePath,inside} from './primitives.mjs';
const hosts=new WeakMap();
// Trusted embedding boundary. Never construct this object from asset/request JSON.
export async function createTrustedHost(config) {
  exact(config,['principal','session','workspaceRoot','stateRoot','resolveAuthorization','resolveGovernance','resolveCase','resolveCandidate','resolveProfile'],'host config');
  if(!config.principal || !config.session)deny('UNAUTHORIZED_OPERATION');
  for(const k of ['resolveAuthorization','resolveGovernance','resolveCase','resolveCandidate','resolveProfile'])if(typeof config[k]!=='function')deny('UNAUTHORIZED_OPERATION',k+' missing');
  await safePath(config.workspaceRoot,'directory');await safePath(config.stateRoot,'directory');
  if(!inside(config.workspaceRoot,config.stateRoot))deny('UNAUTHORIZED_OPERATION','Host state root must be within approved workspace');
  const host=Object.freeze({caller_class:'CODEX_SKILL_NORMAL_USE'});hosts.set(host,Object.freeze({...config}));return host;
}
export function hostConfig(host){const c=hosts.get(host);if(!c)deny('UNAUTHORIZED_OPERATION','A trusted host binding is required; no direct adapter fallback');return c;}
