import { getCache, refreshCache } from '../lib/tailboard.js';

const api = globalThis.browser ?? globalThis.chrome;
const q = document.getElementById('q');
const list = document.getElementById('list');
const empty = document.getElementById('empty');
let data = null;

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
    const links = g.links.filter(l =>
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
      const dot = document.createElement('span');
      dot.className = 'dot ' + (l.status === 'up' ? 'up' : l.status === 'down' ? 'down' : 'unk');
      const nm = document.createElement('span');
      nm.textContent = l.name;
      a.append(dot, nm);
      a.addEventListener('click', e => {
        api.tabs.create({ url: l.url });
        if (!(e.ctrlKey || e.metaKey)) window.close();
      });
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

(async () => {
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
