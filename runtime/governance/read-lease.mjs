import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {deny} from './primitives.mjs';
export async function acquireReadLease(paths) {
  if(process.platform!=='win32')deny('STABLE_INPUT_LEASE_UNAVAILABLE','This release requires Windows deny-write read leases; no advisory-lock fallback');
  const child=spawn('pwsh.exe',['-NoLogo','-NoProfile','-NonInteractive','-File',fileURLToPath(new URL('./windows-read-lease.ps1',import.meta.url))],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  let live=true;
  child.on('exit',()=>{live=false;});
  await new Promise((resolve,reject)=>{let text='';const timer=setTimeout(()=>{child.kill();reject(Error('STABLE_INPUT_LEASE_UNAVAILABLE'));},15000);child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('exit',()=>{clearTimeout(timer);reject(Error('STABLE_INPUT_LEASE_LOST'));});child.stdout.on('data',b=>{text+=b;if(text.includes('LEASE_READY')){clearTimeout(timer);resolve();}});child.stdin.write(JSON.stringify([...new Set(paths)])+'\n');});
  return {assert(){if(!live)deny('STABLE_INPUT_LEASE_LOST');}, async release(){if(live){await new Promise(resolve=>{child.once('exit',resolve);child.stdin.end('\n');});}}};
}
