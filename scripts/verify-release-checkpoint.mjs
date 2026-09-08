import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const manifest=JSON.parse(fs.readFileSync(path.join(root,'audit/gemstone-skill-private-github-release-preflight-r1/private-distribution-checkpoint-manifest.json'),'utf8'));
const seen=new Set();
for(const row of manifest.files){
  if(seen.has(row.path)||row.path.includes('\\')||row.path.split('/').includes('..')||path.isAbsolute(row.path))throw Error('INVALID_MANIFEST_PATH');
  seen.add(row.path);const bytes=fs.readFileSync(path.join(root,row.path));
  if(bytes.length!==row.bytes||crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase()!==row.sha256)throw Error('CHECKPOINT_MISMATCH: '+row.path);
}
console.log(JSON.stringify({status:'PASS',files:seen.size,manifestSelfHash:'VERIFY_VIA_OWNER_COMMIT_ID',extraLocalFiles:'NOT_SCANNED; Git tree checked at release'}));
