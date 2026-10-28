import { getInstance } from '../lib/tailboard.js';

const api = globalThis.browser ?? globalThis.chrome;

(async () => {
  const base = await getInstance();
  if (base) {
    const f = document.getElementById('frame');
    f.src = `${base}/`;
    f.hidden = false;
  } else {
    document.getElementById('setup').hidden = false;
  }
})();

document.getElementById('open').addEventListener('click', () => api.runtime.openOptionsPage());
