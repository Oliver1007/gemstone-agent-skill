import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));const manifest=JSON.parse(await fs.readFile(path.join(root,'runtime/source-manifest.json'),'utf8'));
for(const row of [...manifest.files,...manifest.assets]){const b=await fs.readFile(path.join(root,row.path));const actual=crypto.createHash('sha256').update(b).digest('hex').toUpperCase();if(actual!==row.sha256)throw Error('SOURCE_HASH_MISMATCH: '+row.path);}
console.log(JSON.stringify({status:'PASS',files:manifest.files.length,assets:manifest.assets.length,productionSemantics:'UNCHANGED'}));
