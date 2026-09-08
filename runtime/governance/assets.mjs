import fs from 'node:fs/promises';
import {inspectGlb} from '../engine/render-generic-candidate-v1.mjs';
import {deny} from './primitives.mjs';
export async function admitAsset(locator){
  const b=await fs.readFile(locator);if(b.length<20||b.readUInt32LE(8)!==b.length)deny('ASSET_ERROR','Invalid GLB byte length');
  let at=12,json=null,bin=null,count=0;
  while(at<b.length){if(at+8>b.length)deny('ASSET_ERROR');const n=b.readUInt32LE(at),t=b.readUInt32LE(at+4);if(n%4||at+8+n>b.length)deny('ASSET_ERROR');if(t===0x4e4f534a){if(count!==0||json)deny('ASSET_ERROR');json=JSON.parse(b.subarray(at+8,at+8+n).toString('utf8').trim());}else if(t===0x004e4942){if(bin!==null)deny('ASSET_ERROR');bin=n;}else deny('ASSET_ERROR','Unknown GLB chunk');count++;at+=8+n;}
  const inspect=inspectGlb(b);if(!json||json.buffers?.length!==1||bin===null||json.buffers[0].byteLength>bin||bin-json.buffers[0].byteLength>3)deny('ASSET_ERROR','Embedded single-buffer contract');
  function visit(v){if(!v||typeof v!=='object')return;for(const [k,x]of Object.entries(v)){if(k==='uri'||k==='url')deny('ASSET_ERROR','External and data URIs are denied');if(['KHR_draco_mesh_compression','EXT_meshopt_compression','KHR_texture_basisu','EXT_mesh_gpu_instancing'].includes(k))deny('ASSET_ERROR','Unsupported normal-use dependency/instancing');visit(x);}}
  visit(json);
  for(const v of json.bufferViews??[])if(v.buffer!==0||!Number.isSafeInteger(v.byteLength)||v.byteLength<0||!Number.isSafeInteger(v.byteOffset??0)||(v.byteOffset??0)<0||(v.byteOffset??0)+v.byteLength>json.buffers[0].byteLength)deny('ASSET_ERROR','BufferView out of bounds');
  for(const image of json.images??[])if(!Number.isInteger(image.bufferView)||!json.bufferViews?.[image.bufferView]||!['image/png','image/jpeg'].includes(image.mimeType))deny('ASSET_ERROR','Embedded PNG/JPEG only');
  return {contract:'SELF_CONTAINED_GLB_ONLY',engineAdmission:inspect,qualification:false};
}
