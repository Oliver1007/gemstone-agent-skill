import crypto from 'node:crypto';

export const RELATIONAL_TRANSPORT_V1=Object.freeze({
  identity:'RELATIONAL_DESCRIPTOR_CARRIER_CONSUMER_V1',
  version:'1.0.0',
  energyNeutralCarrier:true
});

const clamp01=value=>Math.max(0,Math.min(1,value));
const length3=value=>Math.hypot(value[0],value[1],value[2]);
const dot3=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross3=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const normalize3=value=>{const n=length3(value);if(!(n>0))throw new TypeError('direction must be non-zero');return value.map(item=>item/n)};
const frozenVector=(value,size,name)=>{if(!Array.isArray(value)||value.length!==size||value.some(item=>!Number.isFinite(item)))throw new TypeError(`${name} must be finite vec${size}`);return Object.freeze([...value])};

function inverseQuaternionRotate(vector,quaternion){
  const [x,y,z,w]=[-quaternion[0],-quaternion[1],-quaternion[2],quaternion[3]],[vx,vy,vz]=vector;
  const tx=2*(y*vz-z*vy),ty=2*(z*vx-x*vz),tz=2*(x*vy-y*vx);
  return[vx+w*tx+(y*tz-z*ty),vy+w*ty+(z*tx-x*tz),vz+w*tz+(x*ty-y*tx)];
}

function inverseSystemTransform(point,transform,scalarScale){
  const result=point.map((value,index)=>(value-transform.translation[index])/(transform.scale[index]*scalarScale));
  const rotation=transform.rotationDegrees.map(value=>-value*Math.PI/180);
  const rotate=(a,b,angle)=>{const c=Math.cos(angle),s=Math.sin(angle),va=result[a],vb=result[b];result[a]=va*c-vb*s;result[b]=va*s+vb*c};
  rotate(0,1,rotation[2]);rotate(0,2,rotation[1]);rotate(1,2,rotation[0]);return result;
}

export function extractCompactRelationalHierarchyDescriptor(evaluator){
  if(!evaluator||!Array.isArray(evaluator.instances)||!evaluator.structure)throw new TypeError('qualified structural evaluator required');
  const system=evaluator.structure.primitives.find(item=>item.type==='GENERIC_IRREGULAR_CLUSTER_SYSTEM');
  if(!system)throw new TypeError('generic cluster system required');
  const roots=evaluator.instances.filter(item=>item.depth===0).map(root=>{
    const coreCenter=frozenVector(root.center,3,'root center'),orientation=frozenVector(root.orientation,4,'root orientation');
    const primaryLobes=root.lobes.map(lobe=>{
      const origin=frozenVector(lobe.origin,3,'lobe origin'),axis=frozenVector(normalize3(lobe.axis),3,'lobe axis');
      const lateral=lobe.lateralAxis?frozenVector(normalize3(lobe.lateralAxis),3,'lobe lateral axis'):frozenVector(normalize3(cross3(Math.abs(axis[1])<.9?[0,1,0]:[1,0,0],axis)),3,'derived lateral axis');
      const thickness=lobe.thicknessAxis?frozenVector(normalize3(lobe.thicknessAxis),3,'lobe thickness axis'):frozenVector(normalize3(cross3(axis,lateral)),3,'derived thickness axis');
      return Object.freeze({lobeId:lobe.lobeId,origin,axis,radialDistance:length3(origin),halfLength:lobe.halfLength,lateralAxis:lateral,thicknessAxis:thickness,lateralSupport:lobe.widthExtent??lobe.baseThickness,thicknessSupport:lobe.thicknessExtent??lobe.baseThickness,tipThicknessScale:lobe.tipThicknessScale,hierarchyLevel:1});
    });
    return Object.freeze({rootId:root.stableId,coreCenter,orientation,baseRadius:root.baseRadius,aspectRatio:frozenVector(root.aspectRatio,3,'root aspect ratio'),coreSupportRadius:root.centerSupportRadius,primaryLobes:Object.freeze(primaryLobes),hierarchyProfile:Object.freeze({core:1,primary:.82,secondaryDecay:.72})});
  });
  const descriptor={version:'RELATIONAL_MORPHOLOGY_DESCRIPTOR_R1',representation:'COMPACT_RELATIONAL_HIERARCHY_DESCRIPTOR',energy:0,systemTransform:Object.freeze({translation:frozenVector(system.spatialTransform.translation,3,'system translation'),rotationDegrees:frozenVector(system.spatialTransform.rotationDegrees,3,'system rotation'),scale:frozenVector(system.spatialTransform.scale,3,'system scale')}),systemScale:system.scale,roots:Object.freeze(roots)};
  return Object.freeze({...descriptor,identity:crypto.createHash('sha256').update(JSON.stringify(descriptor)).digest('hex').toUpperCase()});
}

function relationalSupportAtObjectPoint(descriptor,root,objectPoint){
  const systemLocal=inverseSystemTransform(objectPoint,descriptor.systemTransform,descriptor.systemScale);
  const delta=systemLocal.map((value,index)=>(value-root.coreCenter[index])/root.baseRadius);
  const rotated=inverseQuaternionRotate(delta,root.orientation),local=rotated.map((value,index)=>value/root.aspectRatio[index]);
  const core=clamp01(1-length3(local)/root.coreSupportRadius);
  const lobes=root.primaryLobes.map(lobe=>{
    const relative=local.map((value,index)=>value-lobe.origin[index]),axial=dot3(relative,lobe.axis)/lobe.halfLength;
    const position=clamp01((axial+1)*.5),taper=1-(1-lobe.tipThicknessScale)*position;
    const lateral=dot3(relative,lobe.lateralAxis)/(lobe.lateralSupport*taper),thickness=dot3(relative,lobe.thicknessAxis)/(lobe.thicknessSupport*taper);
    return clamp01(1-Math.hypot(axial,lateral,thickness));
  });
  return{core,lobes};
}

export function createRelationalMorphologyRayCarrier(descriptor){
  if(!descriptor||descriptor.representation!=='COMPACT_RELATIONAL_HIERARCHY_DESCRIPTOR'||descriptor.energy!==0)throw new TypeError('zero-energy relational descriptor required');
  const corePeaks=new Float64Array(descriptor.roots.length),lobePeaks=descriptor.roots.map(root=>new Float64Array(root.primaryLobes.length));let sampleCount=0;
  return Object.freeze({
    reset(){corePeaks.fill(0);for(const values of lobePeaks)values.fill(0);sampleCount=0},
    accumulate(objectPoint){
      if(!Array.isArray(objectPoint)||objectPoint.length!==3||objectPoint.some(value=>!Number.isFinite(value)))throw new TypeError('objectPoint must be finite vec3');
      descriptor.roots.forEach((root,index)=>{const support=relationalSupportAtObjectPoint(descriptor,root,objectPoint);corePeaks[index]=Math.max(corePeaks[index],support.core);support.lobes.forEach((value,lobe)=>{lobePeaks[index][lobe]=Math.max(lobePeaks[index][lobe],value)})});sampleCount++;
    },
    finalize(){if(sampleCount===0)throw new TypeError('relational carrier requires samples');return Object.freeze({descriptorIdentity:descriptor.identity,energy:0,rootRelations:Object.freeze(descriptor.roots.map((root,index)=>Object.freeze({rootId:root.rootId,coreSupport:clamp01(corePeaks[index]),primaryLobeSupports:Object.freeze([...lobePeaks[index]].map(clamp01)),hierarchyProfile:root.hierarchyProfile})))})}
  });
}

function boundedUnion(values){let complement=1;for(const value of values)complement*=1-clamp01(value);return clamp01(1-complement)}

export function consumeRelationalChannels(packet,carrier,options={}){
  if(!packet||!Number.isFinite(packet.composedContribution)||!Array.isArray(packet.rootContributions))throw new TypeError('integrated packet required');
  if(!carrier||carrier.energy!==0||!Array.isArray(carrier.rootRelations)||carrier.rootRelations.length!==packet.rootContributions.length)throw new TypeError('matching zero-energy relational carrier required');
  const localityRemap=options.localityRemap??'LINEAR';if(!['LINEAR','SQUARED'].includes(localityRemap))throw new TypeError('unsupported locality remap');
  const map=localityRemap==='SQUARED'?value=>clamp01(value)**2:clamp01,rootChannels=[];let structuralContribution=0;
  for(let index=0;index<packet.rootContributions.length;index++){
    const energyPacket=packet.rootContributions[index],relation=carrier.rootRelations[index];if(energyPacket.rootId!==relation.rootId)throw new TypeError('root identity/order mismatch');
    const coreChannel=map(relation.coreSupport),primaryLobeChannels=relation.primaryLobeSupports.map(value=>map(value)*relation.hierarchyProfile.primary),primaryLobeUnion=boundedUnion(primaryLobeChannels),relationalField=boundedUnion([coreChannel,primaryLobeUnion]),energy=clamp01(energyPacket.premultipliedContribution),contribution=energy*relationalField;
    structuralContribution+=contribution;rootChannels.push(Object.freeze({rootId:relation.rootId,coreChannel,primaryLobeChannels:Object.freeze(primaryLobeChannels),primaryLobeUnion,relationalField,premultipliedContribution:energy,contribution}));
  }
  const legacy=clamp01(packet.composedContribution);structuralContribution=Math.min(legacy,clamp01(structuralContribution));
  return Object.freeze({strategy:'PER_ROOT_PER_LOBE_CHANNEL_SOFT_UNION',localityRemap,rootChannels:Object.freeze(rootChannels),lobeIdentitySurvival:rootChannels.reduce((sum,root)=>sum+root.primaryLobeChannels.length,0),scalarCollapseStage:'FINAL_COMPOSITION_AFTER_LOCALITY_SENSITIVE_ROOT_LOBE_FIELD',structuralContribution,residualVolumetricContribution:Math.max(0,legacy-structuralContribution),totalBoundedContribution:legacy,relationalMorphologyConsumed:true});
}
