import { spawn } from 'node:child_process';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
export async function launchChrome(artifacts) {
  const candidates = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].filter(Boolean);
  let executable;
  for (const path of candidates) { try { await access(path); executable = path; break; } catch {} }
  if (!executable) throw new Error('Chrome/Edge required for REAL_BROWSER_E2E.');
  const profile = await mkdtemp(join(tmpdir(), 'sportbooking-real-'));
  const browserProcess = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  const pause = (ms) => new Promise((r) => setTimeout(r, ms)); let port, failure;
  browserProcess.on('error', (error) => { failure = error; });
  for (let n = 0; n < 100 && !port; n++) { if (failure) throw failure; try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; } catch { await pause(100); } }
  if (!port) throw new Error('Chrome DevTools did not start.');
  const target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page');
  const ws = new WebSocket(target.webSocketDebuggerUrl), pending = new Map(), errors = [], requests = [], loads = [];
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; }); let next = 0;
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++next, timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout ${method}`)); }, 20000);
    pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }));
  });
  ws.onmessage = ({ data }) => {
    const message = JSON.parse(data), task = pending.get(message.id);
    if (message.method === 'Page.loadEventFired') loads.splice(0).forEach((loaded) => loaded());
    if (task) { clearTimeout(task.timer); pending.delete(message.id); message.error ? task.reject(new Error(message.error.message)) : task.resolve(message.result); }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    if (message.method === 'Network.requestWillBeSent') { const r = message.params.request, url = new URL(r.url); if (url.pathname.startsWith('/api')) requests.push({ method: r.method, path: url.pathname + url.search }); }
  };
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value;
  };
  const until = async (expression) => { const end = Date.now() + 20000; do { if (await evaluate(expression)) return; await pause(100); } while (Date.now() < end); throw new Error('UI timeout: ' + expression + '\n' + await evaluate('document.body.innerText')); };
  const click = async (text, scope = 'document') => { await until(`Array.from((${scope}).querySelectorAll('button')).some(b=>b.textContent.trim()===${JSON.stringify(text)})`); await evaluate(`Array.from((${scope}).querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(text)}).click()`); };
  const fill = async (selector, value) => { await until(`!!document.querySelector(${JSON.stringify(selector)})`); return evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});const proto=el.tagName==='SELECT'?HTMLSelectElement.prototype:el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(String(value))});el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));})()`); };
  const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); await writeFile(new URL(`${name}.png`, artifacts), Buffer.from(r.data, 'base64')); };
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  const navigate = async (url) => {
    let timeout;
    const loaded = new Promise((resolve, reject) => { timeout = setTimeout(() => reject(new Error('Page load timed out')), 20000); loads.push(resolve); });
    try { await send('Page.navigate', { url }); await loaded; } finally { clearTimeout(timeout); }
  };
  return { send, navigate, evaluate, until, click, fill, shot, requests, errors, close: async () => {
    if (ws.readyState === WebSocket.OPEN) { await send('Browser.close').catch(() => {}); ws.close(); } browserProcess.kill(); for (const task of pending.values()) clearTimeout(task.timer);
    if (resolve(profile).startsWith(resolve(tmpdir()) + sep + 'sportbooking-real-')) await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => {});
  } };
}
