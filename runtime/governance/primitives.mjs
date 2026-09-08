import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
export class GovernanceError extends Error {
  constructor(code, detail) { super(detail ?? code); this.code = code; this.name = 'GovernanceError'; }
}
export const deny = (code, detail) => { throw new GovernanceError(code, detail); };
export function exact(value, keys, label) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).length !== keys.length || keys.some(k => !Object.hasOwn(value,k))) deny('INVALID_REQUEST', label);
}
export function canonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && Object.getPrototypeOf(value) === Object.prototype) return '{' + Object.keys(value).sort().map(k => JSON.stringify(k)+':'+canonical(value[k])).join(',') + '}';
  deny('INVALID_REQUEST', 'Only finite JSON values are allowed');
}
export const hash = value => crypto.createHash('sha256').update(Buffer.isBuffer(value) ? value : canonical(value)).digest('hex').toUpperCase();
export const token = value => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,79}$/.test(value) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(value);
export const inside = (root,p) => {const rel=path.relative(root,p);return rel!=='' && rel!=='..' && !rel.startsWith('..'+path.sep) && !path.isAbsolute(rel);};
export async function safePath(p, type='file') {
  if (typeof p!=='string' || !path.isAbsolute(p) || path.normalize(p)!==p) deny('IDENTITY_MISMATCH','Explicit normalized absolute path required');
  let part=path.parse(p).root;
  for(const name of p.slice(part.length).split(path.sep).filter(Boolean)){part=path.join(part,name);const s=await fs.lstat(part);if(s.isSymbolicLink())deny('IDENTITY_MISMATCH','Links/reparse paths denied');}
  const stat=await fs.stat(p);if(type==='file'?!stat.isFile():!stat.isDirectory())deny('IDENTITY_MISMATCH','Wrong path type');
  const real=await fs.realpath(p);if(real.toLowerCase()!==p.toLowerCase())deny('IDENTITY_MISMATCH','Resolved path differs');
  return p;
}
export async function fileIdentity(p) {await safePath(p);const b=await fs.readFile(p);return{locator:p,sha256:hash(b),bytes:b.length};}
export async function writeNew(p,value){const h=await fs.open(p,'wx');try{await h.writeFile(JSON.stringify(value,null,2)+'\n');await h.sync();}finally{await h.close();}}
