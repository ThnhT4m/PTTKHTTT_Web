import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { openSync, closeSync } from 'node:fs';
import { readFile, writeFile, unlink, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const privateDir=new URL('../../.local/',import.meta.url), root=fileURLToPath(new URL('../../../',import.meta.url));
const runner=fileURLToPath(new URL('run.mjs',import.meta.url)),envFile=fileURLToPath(new URL('operations.env',privateDir));
const command=process.argv[2]||'status';
assert.ok(['start','stop','status','restart-backend','restart-frontend','stop-backend','start-backend'].includes(command));
async function processInfo(kind) {
  let pid;try{pid=Number((await readFile(new URL(kind+'.pid',privateDir),'utf8')).trim());}catch(error){if(error.code==='ENOENT')return null;throw error;}
  assert.ok(Number.isSafeInteger(pid)&&pid>0);
  const output=execFileSync('powershell.exe',['-NoProfile','-Command',`[Console]::OutputEncoding=[Text.UTF8Encoding]::new(); Get-CimInstance Win32_Process -Filter "ProcessId=${pid}" | Select-Object Name,ProcessId,CommandLine | ConvertTo-Json -Compress`],{encoding:'utf8',windowsHide:true}).trim();
  if(!output)return null;
  const info=JSON.parse(output),line=info.CommandLine?.replaceAll('\\','/');
  assert.equal(info.Name.toLowerCase(),'node.exe','PID reused by another application; refusing to stop.');
  assert.ok(line?.includes(runner.replaceAll('\\','/'))&&line.trim().endsWith(kind),'PID does not belong to this operational worker.');
  return {pid,kind};
}
async function healthy(kind){try{return (await fetch(kind==='backend'?'http://127.0.0.1:4006/api/health':'http://127.0.0.1:5176',{signal:AbortSignal.timeout(1500)})).ok;}catch{return false;}}
async function stop(kind){const info=await processInfo(kind);if(info){process.kill(info.pid);for(let n=0;n<40&&await healthy(kind);n++)await new Promise(r=>setTimeout(r,100));}await unlink(new URL(kind+'.pid',privateDir)).catch(e=>{if(e.code!=='ENOENT')throw e;});}
async function start(kind){if(await processInfo(kind)){assert.ok(await healthy(kind),'Worker is running but not healthy.');return;}assert.equal(await healthy(kind),false,`Port occupied by an unmanaged ${kind}; refusing to replace it.`);await mkdir(privateDir,{recursive:true});const log=openSync(new URL(kind+'.log',privateDir),'a');const child=spawn(process.execPath,['--env-file='+envFile,runner,kind],{cwd:root,windowsHide:true,detached:true,stdio:['ignore',log,log]});child.unref();closeSync(log);await writeFile(new URL(kind+'.pid',privateDir),String(child.pid));for(let n=0;n<80;n++){if(await healthy(kind))return;await new Promise(r=>setTimeout(r,250));}throw Error(`${kind} failed to start; inspect client/.local/${kind}.log`);}
if(command==='start'){await start('backend');await start('frontend');}
else if(command==='stop'){await stop('frontend');await stop('backend');}
else if(command.startsWith('restart-')){const kind=command.slice(8);await stop(kind);await start(kind);}
else if(command==='stop-backend')await stop('backend');
else if(command==='start-backend')await start('backend');
console.log(JSON.stringify({website:'http://127.0.0.1:5176',backend:!!await processInfo('backend')&&await healthy('backend'),frontend:!!await processInfo('frontend')&&await healthy('frontend'),database:'sportbooking',mode:'api',seedOnStart:false}));
