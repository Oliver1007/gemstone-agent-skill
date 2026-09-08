import crypto from 'node:crypto';

export const RELATIONAL_PATH_V1_COMPONENTS=Object.freeze({
  instanceRealizationQuality:'1.0.0',
  depthLocalization:'1.0.0',
  relationalDescriptor:'1.0.0',
  rayCarrier:'1.0.0',
  relationalConsumer:'1.0.0',
  presentationBinding:'1.0.0',
  hierarchySupportReconstructionA1:'1.0.0',
  relationalOpticalMapping:'1.0.0',
  luminanceHierarchyResponse:'1.0.0',
  materialColorCompositionCol2:'1.0.0',
  packetResponse:'1.0.0',
  relationalUnion:'1.0.0',
  fa3Fa7Bindings:'1.0.0',
  p1Binding:'1.0.0'
});
export const RELATIONAL_PATH_V1_SOURCE_FINGERPRINT=crypto.createHash('sha256').update(JSON.stringify({capability:'RELATIONAL_PATH_V1',version:'1.1.0',components:RELATIONAL_PATH_V1_COMPONENTS,activation:'ATOMIC',defaultEnabled:false,runtimeClosure:'PRODUCTION_FINAL_PRESENTATION_RUNTIME_V1'})).digest('hex').toUpperCase();
export const QUALIFIED_RELATIONAL_SCOPES=Object.freeze({TARGETED_TRANSFER_REFERENCE_SET_V1:Object.freeze({status:'TARGETED_QUALIFIED',global:false,generic:false})});
export const RELATIONAL_PATH_V1_CONTRACT=Object.freeze({identity:'RELATIONAL_PATH_V1',version:'1.1.0',defaultEnabled:false,authoritativeByDefault:false,shadowCapable:true,atomic:true,runtimeClosure:'PRODUCTION_FINAL_PRESENTATION_RUNTIME_V1',components:RELATIONAL_PATH_V1_COMPONENTS,sourceFingerprint:RELATIONAL_PATH_V1_SOURCE_FINGERPRINT,cacheNamespace:`relational-path-v1:${RELATIONAL_PATH_V1_SOURCE_FINGERPRINT}`,legacyCacheNamespace:'legacy-structural-v1'});

export class RelationalCapabilityError extends Error{constructor(code,message,details={}){super(message);this.name='RelationalCapabilityError';this.code=code;this.details=details}}
const fail=(code,message,details)=>{throw new RelationalCapabilityError(code,message,details)};
const sameComponents=value=>value&&Object.keys(RELATIONAL_PATH_V1_COMPONENTS).every(key=>value[key]===RELATIONAL_PATH_V1_COMPONENTS[key])&&Object.keys(value).length===Object.keys(RELATIONAL_PATH_V1_COMPONENTS).length;

export function resolveRelationalCapability(request=undefined){
  if(request===undefined||request===null||request.id==='LEGACY')return Object.freeze({id:'LEGACY',version:'1.1.0',mode:'AUTHORITATIVE',enabled:false,authoritative:true,cacheNamespace:RELATIONAL_PATH_V1_CONTRACT.legacyCacheNamespace,explicitLegacyChoice:request?.id==='LEGACY'});
  if(!request||typeof request!=='object'||request.id!=='RELATIONAL_PATH_V1')fail('RELATIONAL_PATH_UNSUPPORTED','unsupported relational capability request',{requested:request?.id??null});
  if(request.components!==undefined&&!sameComponents(request.components))fail('RELATIONAL_RUNTIME_CLOSURE_VERSION_MISMATCH','relational capability components must activate as the exact production runtime closure bundle',{expected:RELATIONAL_PATH_V1_COMPONENTS,actual:request.components});
  const mode=request.mode??'SHADOW';
  if(!['SHADOW','QUALIFICATION'].includes(mode))fail('RELATIONAL_PATH_MODE_UNSUPPORTED','relational path supports only SHADOW or QUALIFICATION execution',{mode});
  const scope=QUALIFIED_RELATIONAL_SCOPES[request.qualificationScopeId];
  if(!scope||scope.status!=='TARGETED_QUALIFIED')fail('RELATIONAL_PATH_SCOPE_NOT_QUALIFIED','requested scope is not qualified',{qualificationScopeId:request.qualificationScopeId??null});
  return Object.freeze({...RELATIONAL_PATH_V1_CONTRACT,id:'RELATIONAL_PATH_V1',mode,enabled:true,authoritative:mode==='QUALIFICATION',qualificationScopeId:request.qualificationScopeId,qualificationScopeStatus:scope.status,components:RELATIONAL_PATH_V1_COMPONENTS});
}

export function relationalCacheIdentity(inputHash,capability){
  if(typeof inputHash!=='string'||!inputHash)fail('RELATIONAL_PATH_CACHE_INPUT_INVALID','input hash required');
  const resolved=capability?.id?capability:resolveRelationalCapability(capability);
  return `${resolved.cacheNamespace}:${inputHash}`;
}

export function rollbackRelationalCapability(){return resolveRelationalCapability({id:'LEGACY'})}
export function relationalPathHealth(){return Object.freeze({ready:true,capability:'RELATIONAL_PATH_V1',version:'1.1.0',runtimeClosure:'PRODUCTION_FINAL_PRESENTATION_RUNTIME_V1',components:RELATIONAL_PATH_V1_COMPONENTS,atomic:true,defaultEnabled:false})}
