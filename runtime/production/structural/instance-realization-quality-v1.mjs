const clamp=(value,low=-1,high=1)=>Math.max(low,Math.min(high,value));
const normalize=vector=>{const length=Math.hypot(...vector);return length>1e-12?vector.map(value=>value/length):vector.map(()=>0)};
const dot=(a,b)=>a.reduce((sum,value,index)=>sum+value*b[index],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const rotate=(vector,quaternion)=>{const[x,y,z,w]=quaternion,[vx,vy,vz]=vector,tx=2*(y*vz-z*vy),ty=2*(z*vx-x*vz),tz=2*(x*vy-y*vx);return[vx+w*tx+(y*tz-z*ty),vy+w*ty+(z*tx-x*tz),vz+w*tz+(x*ty-y*tx)]};
const VIEW_FORWARD=Object.freeze({front:[0,0,1],right:[1,0,0],back:[0,0,-1],left:[-1,0,0]});
const STRONG_OPPOSING_COSINE=-Math.sqrt(3)/2;
const INDEPENDENT_AXIS_COSINE=.5;

function bestDisjointPairs(pairs,lobeCount){
  let best=[];
  function visit(index,used,chosen){
    if(index===pairs.length){if(chosen.length>best.length)best=[...chosen];return}
    visit(index+1,used,chosen);
    const pair=pairs[index];
    if(!used.has(pair.a)&&!used.has(pair.b)){used.add(pair.a);used.add(pair.b);chosen.push(pair);visit(index+1,used,chosen);chosen.pop();used.delete(pair.a);used.delete(pair.b)}
  }
  visit(0,new Set(),[]);
  return{pairs:best,coveredLobes:best.length*2,coverageRatio:lobeCount?best.length*2/lobeCount:0};
}

function opposingPairs(axes){
  const pairs=[];
  for(let a=0;a<axes.length;a++)for(let b=a+1;b<axes.length;b++){
    const cosine=dot(normalize(axes[a]),normalize(axes[b]));
    if(cosine<=STRONG_OPPOSING_COSINE)pairs.push({a,b,cosine,angleDegrees:Math.acos(clamp(cosine))*180/Math.PI});
  }
  return pairs;
}

function compoundAxisRisk(axes,lobeCount){
  const pairs=opposingPairs(axes),matching=bestDisjointPairs(pairs,lobeCount);
  let independentDominantAxes=false,lineAngleDegrees=null;
  if(matching.pairs.length>=2){
    const first=normalize(axes[matching.pairs[0].a]),second=normalize(axes[matching.pairs[1].a]),cosine=Math.abs(dot(first,second));
    independentDominantAxes=cosine<=INDEPENDENT_AXIS_COSINE;
    lineAngleDegrees=Math.acos(clamp(cosine))*180/Math.PI;
  }
  const degenerate=matching.pairs.length>=2&&matching.coveredLobes===lobeCount&&independentDominantAxes;
  return{status:degenerate?'DEGENERATE':'VALID',strongPairs:pairs,matching,independentDominantAxes,lineAngleDegrees,degenerate};
}

function projectRoot(root,view){
  const forward=VIEW_FORWARD[view],right=normalize(cross([0,1,0],forward)),up=normalize(cross(forward,right));
  const axes=root.lobes.map(lobe=>{
    const local=lobe.axis.map((value,index)=>value*root.aspectRatio[index]);
    const world=normalize(rotate(local,root.orientation));
    const projected=[dot(world,right),dot(world,up)];
    return Math.hypot(...projected)<.12?[0,0]:projected;
  });
  const visible=axes.map((axis,index)=>({axis,index})).filter(item=>Math.hypot(...item.axis)>=.12);
  const risk=compoundAxisRisk(visible.map(item=>item.axis),root.lobes.length);
  return{view,...risk};
}

export function evaluateGenericInstanceQualityV1(root){
  if(!root||!Array.isArray(root.lobes)||!Array.isArray(root.aspectRatio)||!Array.isArray(root.orientation))throw new TypeError('root with lobes, aspectRatio, and orientation required');
  const risk=compoundAxisRisk(root.lobes.map(lobe=>lobe.axis),root.lobes.length);
  const attachment=root.lobes.map((lobe,index)=>{const radial=normalize(lobe.origin),axis=normalize(lobe.axis),radialComponent=Math.abs(dot(radial,axis));return{index,radialComponent,tangentialComponent:Math.sqrt(Math.max(0,1-radialComponent*radialComponent)),class:radialComponent>=.9?'RADIAL':radialComponent<=.65?'OBLIQUE_OR_TANGENTIAL':'MIXED'}});
  const classCounts=Object.fromEntries(['RADIAL','MIXED','OBLIQUE_OR_TANGENTIAL'].map(name=>[name,attachment.filter(item=>item.class===name).length]));
  const views=Object.keys(VIEW_FORWARD).map(view=>projectRoot(root,view));
  const degenerateViews=views.filter(view=>view.degenerate).map(view=>view.view);
  const attachmentStatus=risk.degenerate&&classCounts.RADIAL>0&&classCounts.OBLIQUE_OR_TANGENTIAL>0?'DEGENERATE':'COHERENT';
  const angularStatus=risk.degenerate?'DEGENERATE':'VALID';
  const crossViewStatus=risk.degenerate||degenerateViews.length>=2?'FAIL':'PASS';
  const pass=!risk.degenerate&&attachmentStatus!=='DEGENERATE'&&angularStatus==='VALID'&&crossViewStatus==='PASS';
  return Object.freeze({contract:'RELATIONAL_IDENTITY_PRESERVATION',lobeCount:root.lobes.length,opposingAxisRisk:risk,attachmentOrganization:{status:attachmentStatus,components:attachment,classCounts},angularOrganization:{status:angularStatus,simpleSectorQuotaUsed:false},crossViewStability:{status:crossViewStatus,degenerateViews,views},descriptorSemanticsPreserved:true,genericNonFloralSafe:true,combinedQualityResult:pass?'PASS':'FAIL'});
}

export function selectBoundedGenericInstanceRealizationV1(candidates){
  if(!Array.isArray(candidates)||candidates.length<1||candidates.length>4)throw new RangeError('candidate count must be within 1..4');
  const evaluated=candidates.map((candidate,index)=>{
    const roots=candidate.roots??[candidate.root];
    if(!Array.isArray(roots)||roots.some(root=>!root))throw new TypeError('candidate root set required');
    const qualities=roots.map(evaluateGenericInstanceQualityV1);
    return Object.freeze({id:candidate.id,index,baseline:index===0,roots,qualities,combinedQualityResult:qualities.every(quality=>quality.combinedQualityResult==='PASS')?'PASS':'FAIL'});
  });
  if(evaluated[0].combinedQualityResult==='PASS')return Object.freeze({status:'SELECTED',selectedId:evaluated[0].id,selectedIndex:0,passThrough:true,evaluated:Object.freeze(evaluated)});
  const selected=evaluated.slice(1).find(candidate=>candidate.combinedQualityResult==='PASS');
  if(!selected)return Object.freeze({status:'NO_VALID_REALIZATION',selectedId:null,selectedIndex:null,passThrough:false,evaluated:Object.freeze(evaluated)});
  return Object.freeze({status:'SELECTED',selectedId:selected.id,selectedIndex:selected.index,passThrough:false,evaluated:Object.freeze(evaluated)});
}

export const INSTANCE_REALIZATION_QUALITY_V1=Object.freeze({
  identity:'INSTANCE_REALIZATION_QUALITY_V1',version:'1.0.0',maximumCandidates:4,
  selection:'BASELINE_FIRST_THEN_FIRST_VALID_FIXED_ORDER_ELSE_FAIL_CLOSED',newRandomStreams:0,broadSearch:false,
  semantics:'COMPOUND_RELATIONAL_IDENTITY_PRESERVATION_WITHOUT_MORPHOLOGY_TARGETING'
});
