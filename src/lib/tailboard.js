// Data layer for the extension pages (popup, options, new tab).

const api = globalThis.browser ?? globalThis.chrome;

export async function getInstance() {
  const { instanceUrl } = await api.storage.sync.get('instanceUrl');
  return (instanceUrl || '').replace(/\/+$/, '');
}

export async function setInstance(url) {
  await api.storage.sync.set({ instanceUrl: String(url || '').trim().replace(/\/+$/, '') });
}

// Fetch config + status, flatten into groups. link.url is the resolved
// activeUrl so opening honours the alt-URL fallbacks.
export async function fetchData() {
  const base = await getInstance();
  if (!base) throw new Error('No instance URL set');

  const [cfg, status] = await Promise.all([
    fetch(`${base}/api/config`).then(r => {
      if (!r.ok) throw new Error(`/api/config returned ${r.status}`);
      return r.json();
    }),
    fetch(`${base}/api/status`).then(r => (r.ok ? r.json() : {})).catch(() => ({})),
  ]);

  const hidden = new Set(cfg.hiddenGroups || []);
  const groups = (cfg.groups || [])
    .filter(g => !hidden.has(g.id))
    .map(g => ({
      id: g.id,
      name: g.name,
      links: (g.links || []).map(l => ({
        id: l.id,
        name: l.name,
        group: g.name,
        url: (status[l.id] && status[l.id].activeUrl) || l.url,
        status: (status[l.id] && status[l.id].status) || null,
        tags: l.tags || [],
      })),
    }));

  return { base, groups, ts: Date.now() };
}

export async function refreshCache() {
  const data = await fetchData();
  await api.storage.local.set({ cache: data });
  return data;
}

export async function getCache() {
  const { cache } = await api.storage.local.get('cache');
  return cache || null;
}
