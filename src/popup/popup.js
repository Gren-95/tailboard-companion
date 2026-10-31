import { getCache, refreshCache, getSettings, sortLinks } from '../lib/tailboard.js';

const api = globalThis.browser ?? globalThis.chrome;
const q = document.getElementById('q');
const list = document.getElementById('list');
const empty = document.getElementById('empty');
const home = document.getElementById('home');
let data = null;
let settings = null;

function applyTheme(mode) {
  const r = document.documentElement;
  if (mode === 'auto') { delete r.dataset.theme; r.style.colorScheme = ''; }
  else { r.dataset.theme = mode; r.style.colorScheme = mode; }
}

// Open honouring the configured target; ctrl/cmd forces a background tab.
function open(url, forceBg) {
  if (!settings) return;
  const t = settings.openTarget;
  if (forceBg || t === 'background') api.tabs.create({ url, active: false });
  else if (t === 'current') api.tabs.update({ url });
  else api.tabs.create({ url });
  if (!forceBg && t !== 'background') window.close();
}

function render(filter = '') {
  const f = filter.toLowerCase().trim();
  list.innerHTML = '';
  if (!data || !data.groups.length) {
    empty.textContent = 'No data yet. Set your instance URL in options (⚙).';
    empty.hidden = false;
    return;
  }
  let any = false;
  for (const g of data.groups) {
    const links = sortLinks(g.links, settings.sortMode).filter(l =>
      !f || l.name.toLowerCase().includes(f) || g.name.toLowerCase().includes(f) ||
      (l.tags || []).some(t => t.includes(f)) || l.url.toLowerCase().includes(f)
    );
    if (!links.length) continue;
    any = true;
    const h = document.createElement('div');
    h.className = 'grp';
    h.textContent = g.name;
    list.appendChild(h);
    for (const l of links) {
      const a = document.createElement('button');
      a.className = 'lnk';
      if (settings.showDots) {
        const dot = document.createElement('span');
        dot.className = 'dot ' + (l.status === 'up' ? 'up' : l.status === 'down' ? 'down' : 'unk');
        a.appendChild(dot);
      }
      const nm = document.createElement('span');
      nm.textContent = l.name;
      a.appendChild(nm);
      a.addEventListener('click', e => open(l.url, e.ctrlKey || e.metaKey));
      list.appendChild(a);
    }
  }
  empty.hidden = any;
  if (!any) empty.textContent = 'No matches.';
}

q.addEventListener('input', () => render(q.value));
q.addEventListener('keydown', e => {
  if (e.key === 'Enter') { const first = list.querySelector('.lnk'); if (first) first.click(); }
});
document.getElementById('opts').addEventListener('click', () => api.runtime.openOptionsPage());
home.addEventListener('click', e => { if (settings && settings.base) open(`${settings.base}/`, e.ctrlKey || e.metaKey); });

(async () => {
  settings = await getSettings();
  settings.base = settings.instanceUrl;
  applyTheme(settings.theme);
  data = await getCache();
  render();
  q.focus();
  try {
    data = await refreshCache();
    render(q.value);
  } catch (e) {
    if (!data) { empty.textContent = 'Cannot reach instance. Check options (⚙).'; empty.hidden = false; }
  }
})();
