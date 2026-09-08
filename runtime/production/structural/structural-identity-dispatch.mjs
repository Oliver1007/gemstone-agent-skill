import * as v10 from './structural-identity-v1.mjs';
import * as v11 from './structural-identity-v1-1.mjs';
import crypto from 'node:crypto';
import {evaluateGenericInstanceQualityV1,selectBoundedGenericInstanceRealizationV1} from './instance-realization-quality-v1.mjs';
import {resolveRelationalCapability,RELATIONAL_PATH_V1_COMPONENTS,RELATIONAL_PATH_V1_SOURCE_FINGERPRINT} from './relational-capability-registry.mjs';
import {RELATIONAL_FINAL_PRESENTATION_RUNTIME_V1,createRelationalFinalPresentationRuntimeV1,_internalCreateCausalObservationRuntimeV1,CAUSAL_OBSERVATION_EXPORT_V1} from './relational-presentation-v1.mjs';

export const StructuralIdentityError = v10.StructuralIdentityError;
export const GSI_COORDINATE_SPACE = v10.GSI_COORDINATE_SPACE;
export const STRUCTURAL_PRIMITIVE_REGISTRY = v10.STRUCTURAL_PRIMITIVE_REGISTRY;
export const STRUCTURAL_PRIMITIVE_REGISTRY_V11 = v11.STRUCTURAL_PRIMITIVE_REGISTRY_V11;

function versionOf(value) { return value?.version; }
function unsupported(version) {
  throw new StructuralIdentityError('UNSUPPORTED_INTERNAL_STRUCTURE_VERSION', 'internalStructure.version must be explicitly supported', { version, supported: ['1.0.0', '1.1.0'] });
}

export function validateInternalStructure(input) {
  if (versionOf(input) === '1.0.0') return v10.validateInternalStructure(input);
  if (versionOf(input) === '1.1.0') return v11.validateInternalStructureV11(input);
  return unsupported(versionOf(input));
}

function hashJson(value){return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').toUpperCase()}
function createRelationalEvaluatorV11(input,internalOptions,capability){
  const baseline=v11.createStructuralEvaluatorV11(input,internalOptions),roots=baseline.instances.filter(instance=>instance.depth===0),baselineQuality=roots.map(evaluateGenericInstanceQualityV1);
  const candidates=[{id:'IR0',evaluator:baseline,roots}];
  if(baselineQuality.some(quality=>quality.combinedQualityResult!=='PASS'))for(const variant of ['IR1','IR2','IR3']){
    const dominantVariants=baselineQuality.map(quality=>quality.combinedQualityResult==='PASS'?'IR0':variant);
    const evaluator=v11.createStructuralEvaluatorV11(input,{...(internalOptions??{}),instanceRealizationBinding:{dominantVariants}});
    candidates.push({id:variant,evaluator,roots:evaluator.instances.filter(instance=>instance.depth===0)});
  }
  const selection=selectBoundedGenericInstanceRealizationV1(candidates);
  if(selection.status!=='SELECTED')throw new StructuralIdentityError('NO_VALID_REALIZATION','no bounded generic relational instance realization satisfies the quality contract',{action:'ABORT_RELATIONAL_CAPABILITY',candidateCount:candidates.length,capability:capability.id});
  const chosen=candidates[selection.selectedIndex].evaluator,telemetry=Object.freeze({capabilityVersion:capability.version,sourceFingerprint:capability.sourceFingerprint,inputHash:hashJson(input),path:'RELATIONAL_PATH_V1',shadowExecution:capability.mode==='SHADOW',candidateCount:candidates.length,baselineGateResult:selection.evaluated[0].combinedQualityResult,selectedCandidateIndex:selection.selectedIndex,selectedCandidateIdentityHash:hashJson(candidates[selection.selectedIndex].roots),runtimeClosure:RELATIONAL_FINAL_PRESENTATION_RUNTIME_V1.identity,runtimeClosureVersion:RELATIONAL_FINAL_PRESENTATION_RUNTIME_V1.version,productionSemanticOwners:RELATIONAL_FINAL_PRESENTATION_RUNTIME_V1.semanticOwners,hpr1Active:true,u1Active:true,cacheNamespace:capability.cacheNamespace,qualificationScopeId:capability.qualificationScopeId,explicitLegacyFallbackChoice:false});
  chosen._internalRelationalPath=telemetry;
  chosen._internalCreateRelationalFinalPresentationRuntime=samplesPerRay=>createRelationalFinalPresentationRuntimeV1(chosen,samplesPerRay);
  return chosen;
}

export function _internalAcquireCausalObservationV1(input,internalOptions){
  // Reuse the production-selected evaluator without entering capability resolution.
  if(versionOf(input)!=='1.1.0')unsupported(versionOf(input));
  const evaluator=createRelationalEvaluatorV11(input,internalOptions,{id:'TEST_ONLY_DIAGNOSTIC_CONTEXT',version:'1.1.0',mode:'TEST_ONLY_DIAGNOSTIC_CONTEXT',sourceFingerprint:RELATIONAL_PATH_V1_SOURCE_FINGERPRINT,cacheNamespace:null,qualificationScopeId:null});
  return Object.freeze({
    identity:CAUSAL_OBSERVATION_EXPORT_V1,
    getFrozenComponentIdentity:()=>structuredClone({components:RELATIONAL_PATH_V1_COMPONENTS,semanticFingerprint:RELATIONAL_PATH_V1_SOURCE_FINGERPRINT}),
    getFrozenInputs:()=>structuredClone({instances:evaluator.instances,structure:evaluator.structure,selection:evaluator._internalRelationalPath}),
    createRuntime:(samplesPerRay,options)=>_internalCreateCausalObservationRuntimeV1(evaluator,samplesPerRay,options)
  });
}

export function createStructuralEvaluator(input, options=undefined) {
  const capability=resolveRelationalCapability(options?.relationalCapability);
  if (versionOf(input) === '1.0.0') { if(capability.id!=='LEGACY')throw new StructuralIdentityError('RELATIONAL_PATH_VERSION_MISMATCH','RELATIONAL_PATH_V1 requires structural identity v1.1.0'); return v10.createStructuralEvaluator(input); }
  if (versionOf(input) === '1.1.0') {
    const internalOptions=options?.internalEvaluatorOptions;
    if(capability.id==='LEGACY')return v11.createStructuralEvaluatorV11(input,internalOptions);
    const relational=createRelationalEvaluatorV11(input,internalOptions,capability);
    if(capability.mode==='QUALIFICATION')return relational;
    const legacy=v11.createStructuralEvaluatorV11(input,internalOptions);
    legacy._internalRelationalShadow=Object.freeze({authoritativePath:'LEGACY',shadowPath:'RELATIONAL_PATH_V1',authoritativeInstancesHash:hashJson(legacy.instances),shadowInstancesHash:hashJson(relational.instances),shadowTelemetry:relational._internalRelationalPath,fullProductionRuntimeClosureAvailable:true,sideEffects:0});
    legacy._internalCreateRelationalShadowRuntime=samplesPerRay=>relational._internalCreateRelationalFinalPresentationRuntime(samplesPerRay);
    return legacy;
  }
  return unsupported(versionOf(input));
}

export function structuralFieldFingerprint(input, points) {
  if (versionOf(input) === '1.0.0') return v10.structuralFieldFingerprint(input, points);
  if (versionOf(input) === '1.1.0') return v11.structuralFieldFingerprintV11(input, points);
  return unsupported(versionOf(input));
}

export async function renderStructuralProof(args) {
  const version = versionOf(args?.materialSpec?.internalStructure);
  if (version === '1.0.0') return v10.renderStructuralProof(args);
  if (version === '1.1.0') return v11.renderStructuralProofV11(args);
  return unsupported(version);
}

export const diagnoseBlueLaceAgateStructure = v10.diagnoseBlueLaceAgateStructure;
export const diagnoseSakuraAgateStructure = v10.diagnoseSakuraAgateStructure;
export const diagnoseGenericClusterSystem = v11.diagnoseGenericClusterSystem;
export const GSI_V11_RUNTIME_BEHAVIOR_IDENTITY = v11.GSI_V11_RUNTIME_BEHAVIOR_IDENTITY;
export const GSI_V11_LIMITS = v11.GSI_V11_LIMITS;
