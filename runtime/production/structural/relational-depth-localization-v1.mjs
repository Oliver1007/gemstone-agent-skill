export const RELATIONAL_DEPTH_LOCALIZATION_V1=Object.freeze({identity:'GSI_V1_DEPTH_LOCALIZATION_PRESERVATION_R1_A_T65_P4_F15',version:'1.0.0',localityThreshold:.65,responseExponent:4,preservationFloor:.15,energyPolicy:'CONTRIBUTION_REDUCING_ONLY'});
const clamp01=value=>Math.max(0,Math.min(1,value));
export function localizeIntegratedRootContribution(rootContribution){
  if(!rootContribution||typeof rootContribution!=='object')throw new TypeError('rootContribution must be an object');
  const {premultipliedContribution,peakDensity,meanDensity}=rootContribution;
  if(![premultipliedContribution,peakDensity,meanDensity].every(Number.isFinite))throw new TypeError('root contribution fields must be finite');
  if(premultipliedContribution<0||peakDensity<0||meanDensity<0)throw new RangeError('root contribution fields must be nonnegative');
  const cue=peakDensity>0?clamp01((peakDensity-meanDensity)/peakDensity):0;
  const shaped=cue>=RELATIONAL_DEPTH_LOCALIZATION_V1.localityThreshold?1:(cue/RELATIONAL_DEPTH_LOCALIZATION_V1.localityThreshold)**RELATIONAL_DEPTH_LOCALIZATION_V1.responseExponent;
  const weight=RELATIONAL_DEPTH_LOCALIZATION_V1.preservationFloor+(1-RELATIONAL_DEPTH_LOCALIZATION_V1.preservationFloor)*shaped;
  const localizedContribution=clamp01(premultipliedContribution*weight);
  if(localizedContribution>premultipliedContribution+1e-15)throw new Error('DEPTH_LOCALIZATION_ENERGY_CREATION');
  return Object.freeze({...rootContribution,premultipliedContribution:localizedContribution,accumulatedContribution:localizedContribution,depthLocalizationCue:cue,depthLocalizationWeight:weight});
}
export function localizeIntegratedMatrixResult(integrated){
  if(!integrated||!Array.isArray(integrated.rootContributions))throw new TypeError('integrated.rootContributions must be an array');
  const rootContributions=integrated.rootContributions.map(localizeIntegratedRootContribution);let composedContribution=0,weightedDepth=0,weight=0;
  for(const root of rootContributions){composedContribution+=root.premultipliedContribution;weightedDepth+=root.depthState*root.premultipliedContribution;weight+=root.premultipliedContribution;}
  return Object.freeze({...integrated,rootContributions:Object.freeze(rootContributions),composedContribution:clamp01(composedContribution),composedDepth:weight>0?weightedDepth/weight:integrated.composedDepth,depthLocalizationIdentity:RELATIONAL_DEPTH_LOCALIZATION_V1.identity});
}
