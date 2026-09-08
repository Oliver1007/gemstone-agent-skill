import {localizeIntegratedMatrixResult} from './relational-depth-localization-v1.mjs';
import {extractCompactRelationalHierarchyDescriptor,createRelationalMorphologyRayCarrier,consumeRelationalChannels} from './relational-transport-v1.mjs';
import {bindRootLocalPresentation} from './relational-presentation-binding-v1.mjs';
import {mapHierarchySupportReconstructionA1,mapRootRelationalChannelsThroughOptics,applyRelationalLuminanceHierarchyResponse,composeRefinedBoundedRelationalMaterialColor} from './relational-material-runtime-v1.mjs';

const clamp01=value=>Math.max(0,Math.min(1,Number(value)||0));
const luma=rgb=>.2126*clamp01(rgb[0])+.7152*clamp01(rgb[1])+.0722*clamp01(rgb[2]);
const boundedUnion=values=>clamp01(1-values.reduce((remaining,value)=>remaining*(1-clamp01(value)),1));
const geometricAgreement=values=>values.length?Math.pow(values.reduce((product,value)=>product*clamp01(value),1),1/values.length):0;

function rgb(value,label){if(!Array.isArray(value)||value.length!==3||value.some(channel=>!Number.isFinite(Number(channel))))throw new TypeError(`${label} must be finite RGB`);return Object.freeze(value.map(clamp01))}
function support(packet){return clamp01(Math.max(clamp01(packet.hierarchySupport),clamp01(packet.coreSupport),...(packet.lobeSupports??[]).map(clamp01)))}

export function createHierarchyPreservingPacketsV1(opticalBundle){
  if(!opticalBundle||!Array.isArray(opticalBundle.rootChannels)||!Array.isArray(opticalBundle.zeroSignalColor))throw new TypeError('optical rootChannels and zeroSignalColor required');
  const inputs=opticalBundle.rootChannels.map(root=>{
    const hierarchySupport=clamp01(root.hierarchyBearingResponse),coreSupport=clamp01(root.coreResponse),lobeSupports=Object.freeze((root.subordinateLobeResponses??[]).map(clamp01));
    const existingMaterialContribution=rgb(root.normalizedOpticalDelta,'root normalizedOpticalDelta');
    const luminanceOrganization=clamp01(luma(existingMaterialContribution)),materialCoverageContext=clamp01(root.densityContribution);
    const cueAgreement=clamp01(geometricAgreement([hierarchySupport,luminanceOrganization,materialCoverageContext]));
    return{root,hierarchySupport,coreSupport,lobeSupports,existingMaterialContribution,luminanceOrganization,materialCoverageContext,cueAgreement};
  });
  const agreementMean=inputs.length?inputs.reduce((sum,input)=>sum+input.cueAgreement,0)/inputs.length:0;
  const packets=inputs.map(input=>{
    const relativeAgreement=agreementMean>0?input.cueAgreement/agreementMean:1,agreementOrganizationSupport=Math.max(0,relativeAgreement-1);
    const agreementModulation=Object.freeze(input.existingMaterialContribution.map(value=>clamp01(value*agreementOrganizationSupport)));
    const presentationResidual=Object.freeze(input.existingMaterialContribution.map((value,channel)=>boundedUnion([value,agreementModulation[channel]])));
    return Object.freeze({bookkeepingKey:input.root.rootKey??null,hierarchySupport:input.hierarchySupport,coreSupport:input.coreSupport,lobeSupports:input.lobeSupports,luminanceOrganization:input.luminanceOrganization,materialCoverageContext:input.materialCoverageContext,existingMaterialContribution:input.existingMaterialContribution,cueAgreement:input.cueAgreement,baseHierarchyResponse:input.existingMaterialContribution,agreementOrganizationSupport,agreementModulation,presentationResidual,responseMapping:'H1_BASE_PRESERVING_ADDITIVE_AGREEMENT_RESIDUAL',producerChanged:false});
  });
  return Object.freeze({architecture:'HPR1_H1_BASE_PRESERVING_ADDITIVE_AGREEMENT_RESIDUAL',packets:Object.freeze(packets),sharedContext:Object.freeze({zeroSignalColor:rgb(opticalBundle.zeroSignalColor,'zeroSignalColor')}),agreementMean,confidenceEnergySeparated:true,baseCanBeExtinguishedByAgreement:false,explicitRootIdAffectsVisibleResponse:false,newSignalGeneration:false,newRandomStreams:0,caseSpecificImplementationTokens:0});
}

export function assembleRelationalSupportAwareBoundedUnionV1(packets){
  if(!Array.isArray(packets))throw new TypeError('packets must be an array');
  const inputs=packets.map((packet,index)=>({residual:rgb(packet?.presentationResidual,`packet ${index} presentationResidual`),support:support(packet)}));
  const channelTrace=[0,1,2].map(channel=>{
    const raw=inputs.map(input=>input.residual[channel]),supported=inputs.map(input=>clamp01(input.residual[channel]*input.support));
    const strongestResponse=Math.max(0,...raw),strongestSupportedResponse=Math.max(0,...supported),supportedUnion=boundedUnion([...supported].sort((a,b)=>a-b)),boundedSecondaryExcess=clamp01(Math.max(0,supportedUnion-strongestSupportedResponse));
    const output=clamp01(strongestResponse+(1-strongestResponse)*boundedSecondaryExcess);
    return Object.freeze({channel,strongestResponse,strongestSupportedResponse,supportedUnion,boundedSecondaryExcess,output});
  });
  const combinedResidual=Object.freeze(channelTrace.map(trace=>trace.output));
  return Object.freeze({architecture:'U4_LOCAL_SUPPORT_AWARE_STRONGEST_PLUS_BOUNDED_SECONDARY_UNION',combinedResidual,channelTrace:Object.freeze(channelTrace),rootOrderInvariant:true,outputBounded:combinedResidual.every(value=>Number.isFinite(value)&&value>=0&&value<=1),newCues:0,tunableWeights:0});
}

export function assembleRelationalPresentationV1(packetBundle,baselineResidual){
  if(!packetBundle||!Array.isArray(packetBundle.packets)||!packetBundle.sharedContext)throw new TypeError('presentation packet bundle required');
  const baseline=rgb(baselineResidual,'baselineResidual'),sharedBase=rgb(packetBundle.sharedContext.zeroSignalColor,'shared base');
  const union=assembleRelationalSupportAwareBoundedUnionV1(packetBundle.packets);
  const addedLuminance=residual=>luma(residual.map((value,channel)=>(1-sharedBase[channel])*value));
  const baselineAddedLuminanceBudget=addedLuminance(baseline),unionEnergy=addedLuminance(union.combinedResidual),energyScale=unionEnergy>0?Math.min(1,baselineAddedLuminanceBudget/unionEnergy):0;
  const finalResidual=Object.freeze(union.combinedResidual.map(value=>clamp01(value*energyScale)));
  const finalColor=Object.freeze(finalResidual.map((value,channel)=>clamp01(sharedBase[channel]+(1-sharedBase[channel])*value)));
  return Object.freeze({architecture:'RELATIONAL_PATH_V1_FA2_U1_WITH_FROZEN_FA3_FA7_P1',union,coherentResidual:union.combinedResidual,finalResidual,sharedBase,finalColor,baselineAddedLuminanceBudget,coherentAddedLuminanceBeforeCap:unionEnergy,finalAddedLuminance:addedLuminance(finalResidual),energyScale,sharedContextDoubleCounting:false,rootOrderInvariant:true,finalRelationalCollapse:'AFTER_COHERENT_FINAL_PRESENTATION_ASSEMBLY',finite:finalColor.every(Number.isFinite),bounded:finalColor.every(value=>value>=0&&value<=1),specularDirection:'NORMALIZED',specularExponent:52});
}

export const PACKET_RESPONSE_HPR1=Object.freeze({identity:'PACKET_RESPONSE_HPR1',version:'1.0.0',confidenceEnergySeparated:true,baseSuppression:false});
export const RELATIONAL_UNION_U1=Object.freeze({identity:'RELATIONAL_UNION_U1',version:'1.0.0',nRootGeneric:true,rootOrderInvariant:true,n1ExactPassThrough:true,newCues:0,tunableWeights:0});

export const RELATIONAL_FINAL_PRESENTATION_RUNTIME_V1=Object.freeze({
  identity:'RELATIONAL_FINAL_PRESENTATION_RUNTIME_V1',
  version:'1.0.0',
  semanticOwners:Object.freeze(['DEPTH_LOCALIZATION','RELATIONAL_DESCRIPTOR','RAY_CARRIER','RELATIONAL_CONSUMER','PRESENTATION_BINDING','A1_RECONSTRUCTION','RELATIONAL_OPTICAL','LUMINANCE_HIERARCHY','COL2_COLOR','HPR1_PACKET_RESPONSE','U1_FINAL_ASSEMBLY']),
  stagingImports:0,
  harnessOwnedSemanticStages:0
});

export function createRelationalFinalPresentationRuntimeV1(evaluator,samplesPerRay){
  return createPresentationRuntime(evaluator,samplesPerRay,null);
}

export const CAUSAL_OBSERVATION_EXPORT_V1=Object.freeze({identity:'CAUSAL_OBSERVATION_EXPORT_V1',version:'1.0.0',testOnly:true,cache:'NO_CACHE'});

export function _internalCreateCausalObservationRuntimeV1(evaluator,samplesPerRay,options={}){
  if(!options||Object.keys(options).some(key=>!['activeRootIndex','observe'].includes(key)))throw new TypeError('unsupported causal access option');
  const activeRootIndex=options.activeRootIndex??null,observe=options.observe;
  if(activeRootIndex!==null&&(!Number.isInteger(activeRootIndex)||activeRootIndex<0||activeRootIndex>=evaluator._internalRootLocalFields.length))throw new TypeError('invalid active root');
  if(observe!==undefined&&typeof observe!=='function')throw new TypeError('observer must be a function');
  const access={activeRootIndex,capture(stage,value){if(observe)observe(stage,structuredClone(value));}};
  return createPresentationRuntime(evaluator,samplesPerRay,access);
}

function createPresentationRuntime(evaluator,samplesPerRay,access){
  if(!evaluator||typeof evaluator._internalCreatePremultipliedRootMatrixAdapter!=='function'||typeof evaluator._internalSampleMatrixPoint!=='function')throw new TypeError('RELATIONAL_PATH_V1 evaluator required');
  if(!Number.isInteger(samplesPerRay)||samplesPerRay<1)throw new TypeError('samplesPerRay must be a positive integer');
  const descriptor=extractCompactRelationalHierarchyDescriptor(evaluator);
  const matrix=evaluator._internalCreatePremultipliedRootMatrixAdapter(samplesPerRay);
  const carrier=createRelationalMorphologyRayCarrier(descriptor);
  access?.capture('T3_DESCRIPTOR',descriptor);
  let sampleCount=0,cloud=0,supportDensity=0,supportVisible=0,densityWeight=0,systemWeight=0;
  return Object.freeze({
    descriptorIdentity:descriptor.identity,
    resetRay(){matrix.reset();carrier.reset();sampleCount=0;cloud=0;supportDensity=0;supportVisible=0;densityWeight=0;systemWeight=0},
    accumulate(objectPoint,depth){
      if(!Array.isArray(objectPoint)||objectPoint.length!==3||objectPoint.some(value=>!Number.isFinite(value))||!Number.isFinite(depth))throw new TypeError('finite objectPoint and depth required');
      const state=evaluator._internalSampleMatrixPoint(objectPoint);
      access?.capture('T0_INSTANCE_PACKET',state);
      const inputs=access?.activeRootIndex!=null?state.packets.map((packet,index)=>index===access.activeRootIndex?packet:{...packet,localDensity:0,localOccupancy:0,coreContribution:0,primaryContribution:0,secondaryContribution:0,microContribution:0}):state.packets;
      access?.capture('T1_PRE_SHARED_DENSITY_ACCUMULATION',inputs);
      matrix.accumulate(inputs,depth);carrier.accumulate(objectPoint);cloud+=state.cloudDensity;supportDensity+=state.supportDensity;supportVisible=Math.max(supportVisible,state.supportVisible);densityWeight=state.densityWeight;systemWeight=state.systemWeight;sampleCount++;
    },
    finalize(opticalSurface){
      if(sampleCount!==samplesPerRay)throw new TypeError('ray sample count mismatch');
      const matrixResult=matrix.finalize();
      access?.capture('PRE_DEPTH_MATRIX',matrixResult);
      const localized=localizeIntegratedMatrixResult(matrixResult),carrierResult=carrier.finalize();
      const integrated=access?.activeRootIndex!=null?{...localized,rootContributions:[localized.rootContributions[access.activeRootIndex]]}:localized;
      const carried=access?.activeRootIndex!=null?{...carrierResult,rootRelations:[carrierResult.rootRelations[access.activeRootIndex]]}:carrierResult;
      access?.capture('T2_POST_DEPTH_LOCALIZATION',integrated);
      access?.capture('T4_RAY_CARRIER',carried);
      const selected=consumeRelationalChannels(integrated,carried,{localityRemap:'SQUARED'});
      access?.capture('T5_PER_ROOT_CONSUMER',selected);
      const binding=bindRootLocalPresentation(selected);
      access?.capture('T6_PRESENTATION_BINDING',binding);
      const a1=mapHierarchySupportReconstructionA1(binding);
      access?.capture('T7_A1',a1);
      const optical=mapRootRelationalChannelsThroughOptics(a1,{cloud:cloud/samplesPerRay,density:clamp01(supportDensity/samplesPerRay+selected.totalBoundedContribution*densityWeight),visible:clamp01(supportVisible+selected.totalBoundedContribution*systemWeight),diffuse:opticalSurface?.diffuse,specular:opticalSurface?.specular});
      const luminance=applyRelationalLuminanceHierarchyResponse(optical);
      access?.capture('T8_ROOT_LOCAL_OPTICAL_PRE_LUMINANCE',optical);
      access?.capture('T9_LUMINANCE_RESPONSE',luminance);
      const col2=composeRefinedBoundedRelationalMaterialColor(luminance.rootChannels),baselineResidual=col2.combinedResidual;
      access?.capture('T10_COL2_OUTPUT',col2);
      access?.capture('T11_HPR1_INPUT',luminance);
      const packets=createHierarchyPreservingPacketsV1(luminance);
      access?.capture('T12_HPR1_OUTPUT',packets);
      access?.capture('T13_PRE_U1_ROOT_PACKET',packets.packets);
      const presentation=assembleRelationalPresentationV1(packets,baselineResidual);
      access?.capture('T14_POST_U1_COMBINED',presentation.union);
      access?.capture('T15_POST_FA3',presentation.finalResidual);
      access?.capture('T16_POST_FA5',presentation);
      access?.capture('FINAL_RGB_FLOAT',presentation.finalColor);
      return Object.freeze({finalColor:presentation.finalColor,presentation,rootCount:luminance.rootChannels.length,descriptorIdentity:descriptor.identity,semanticRuntimeIdentity:RELATIONAL_FINAL_PRESENTATION_RUNTIME_V1.identity});
    }
  });
}
