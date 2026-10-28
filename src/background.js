// Classic background script (no ES imports), so the data layer is inlined.

const api = globalThis.browser ?? globalThis.chrome;

async function getInstance() {
  const { instanceUrl } = await api.storage.sync.get('instanceUrl');
  return (instanceUrl || '').replace(/\/+$/, '');
}

async function fetchData() {
  const base = await getInstance();
  if (!base) throw new Error('No instance URL set');
  const [cfg, status] = await Promise.all([
    fetch(`${base}/api/config`).then(r => { if (!r.ok) throw new Error(`config ${r.status}`); return r.json(); }),
    fetch(`${base}/api/status`).then(r => (r.ok ? r.json() : {})).catch(() => ({})),
  ]);
  const hidden = new Set(cfg.hiddenGroups || []);
  const groups = (cfg.groups || []).filter(g => !hidden.has(g.id)).map(g => ({
    id: g.id, name: g.name,
    links: (g.links || []).map(l => ({
      id: l.id, name: l.name, group: g.name,
      url: (status[l.id] && status[l.id].activeUrl) || l.url,
      status: (status[l.id] && status[l.id].status) || null,
      tags: l.tags || [],
    })),
  }));
  return { base, groups, ts: Date.now() };
}

async function refreshCache() {
  const data = await fetchData();
  await api.storage.local.set({ cache: data });
  return data;
}

async function getCache() {
  const { cache } = await api.storage.local.get('cache');
  return cache || null;
}

// Top entry opens the dashboard; groups become submenus of their links.
async function rebuildMenus() {
  await api.contextMenus.removeAll();
  api.contextMenus.create({ id: 'tb-root', title: 'Tailboard', contexts: ['all'] });
  api.contextMenus.create({ id: 'tb-search', parentId: 'tb-root', title: 'Search dashboard', contexts: ['all'] });

  const cache = await getCache();
  if (!cache || !cache.groups.length) {
    api.contextMenus.create({ id: 'tb-setup', parentId: 'tb-root', title: 'Set instance URL…', contexts: ['all'] });
    return;
  }

  api.contextMenus.create({ id: 'tb-sep', parentId: 'tb-root', type: 'separator', contexts: ['all'] });
  cache.groups.forEach((g, gi) => {
    const pid = `tb-g-${gi}`;
    api.contextMenus.create({ id: pid, parentId: 'tb-root', title: g.name, contexts: ['all'] });
    g.links.forEach(l => {
      api.contextMenus.create({ id: `tb-l-${l.id}`, parentId: pid, title: l.name, contexts: ['all'] });
    });
  });
}

async function refreshAndRebuild() {
  try { await refreshCache(); } catch (_) { /* keep stale cache */ }
  try { await rebuildMenus(); } catch (_) {}
}

api.runtime.onInstalled.addListener(refreshAndRebuild);
api.runtime.onStartup.addListener(refreshAndRebuild);

api.alarms.create('tb-refresh', { periodInMinutes: 5 });
api.alarms.onAlarm.addListener(a => { if (a.name === 'tb-refresh') refreshAndRebuild(); });

api.contextMenus.onClicked.addListener(async info => {
  const id = info.menuItemId;
  const base = await getInstance();
  if (id === 'tb-search') { if (base) api.tabs.create({ url: `${base}/` }); return; }
  if (id === 'tb-setup') { api.runtime.openOptionsPage(); return; }
  if (typeof id === 'string' && id.startsWith('tb-l-')) {
    const linkId = id.slice(5);
    const cache = await getCache();
    const link = cache && cache.groups.flatMap(g => g.links).find(l => l.id === linkId);
    if (link) api.tabs.create({ url: link.url });
  }
});

function matchLinks(cache, q) {
  const all = cache ? cache.groups.flatMap(g => g.links) : [];
  q = q.toLowerCase().trim();
  if (!q) return all.slice(0, 8);
  return all.filter(l =>
    l.name.toLowerCase().includes(q) ||
    l.group.toLowerCase().includes(q) ||
    (l.tags || []).some(t => t.includes(q)) ||
    l.url.toLowerCase().includes(q)
  ).slice(0, 8);
}

function escapeXml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
}

if (api.omnibox) {
  api.omnibox.setDefaultSuggestion({ description: 'Search Tailboard links' });
  api.omnibox.onInputChanged.addListener(async (text, suggest) => {
    const cache = await getCache();
    suggest(matchLinks(cache, text).map(l => ({
      content: l.url,
      description: `${escapeXml(l.name)} — ${escapeXml(l.group)}`,
    })));
  });
  api.omnibox.onInputEntered.addListener(async (text, disposition) => {
    let url = text;
    if (!/^https?:\/\//i.test(text)) {
      const cache = await getCache();
      const m = matchLinks(cache, text)[0];
      if (!m) return;
      url = m.url;
    }
    if (disposition === 'currentTab') api.tabs.update({ url });
    else api.tabs.create({ url });
  });
}

api.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'refresh') {
    refreshAndRebuild().then(() => sendResponse({ ok: true }));
    return true;
  }
});
