import { getInstance, setInstance } from '../lib/tailboard.js';

const api = globalThis.browser ?? globalThis.chrome;
const inp = document.getElementById('url');
const status = document.getElementById('status');

(async () => { inp.value = await getInstance(); })();

document.getElementById('save').addEventListener('click', async () => {
  const v = inp.value.trim().replace(/\/+$/, '');
  await setInstance(v);
  status.textContent = 'Saving…';
  try {
    const r = await fetch(`${v}/api/config`);
    status.textContent = r.ok ? 'Saved ✓ — connected to instance.' : `Saved, but /api/config returned ${r.status}.`;
  } catch (e) {
    status.textContent = `Saved, but could not reach the instance: ${e.message}`;
  }
  try { await api.runtime.sendMessage({ type: 'refresh' }); } catch (_) {}
});
