// Classic background script (no ES imports), so the data + settings layer is inlined.

const api = globalThis.browser ?? globalThis.chrome;
const action = api.action ?? api.browserAction;

const DEFAULTS = {
  instanceUrl: '',
  badgeMode: 'none',
  refreshMinutes: 5,
  openTarget: 'new',
  showDots: true,
  sortMode: 'group',
  theme: 'auto',
  contextMenu: true,
};

async function getSettings() {
  const got = await api.storage.sync.get(Object.keys(DEFAULTS));
  const s = { ...DEFAULTS, ...got };
  s.instanceUrl    = String(s.instanceUrl || '').replace(/\/+$/, '');
  s.refreshMinutes = Math.max(1, Number(s.refreshMinutes) || DEFAULTS.refreshMinutes);
  return s;
}

async function getInstance() {
  return (await getSettings()).instanceUrl;
}

async function fetchData() {
  const base = await getInstance();
  if (!base) throw new Error('No instance URL set');
  const opts = { credentials: 'include' };
  const [cfg, status] = await Promise.all([
    fetch(`${base}/api/config`, opts).then(r => { if (!r.ok) throw new Error(`config ${r.status}`); return r.json(); }),
    fetch(`${base}/api/status`, opts).then(r => (r.ok ? r.json() : {})).catch(() => ({})),
  ]);
  const hidden = new Set(cfg.hiddenGroups || []);
  const groups = (cfg.groups || []).filter(g => !hidden.has(g.id)).map(g => ({
    id: g.id, name: g.name,
    links: (g.links || []).map(l => ({
      id: l.id, name: l.name, group: g.name,
      url: (status[l.id] && status[l.id].activeUrl) || l.url,
      status: (status[l.id] && status[l.id].status) || null,
      pinned: !!l.pinned,
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

// Open a URL honouring the chosen target; forceBg overrides to a background tab.
function openUrl(url, target, forceBg) {
  if (forceBg || target === 'background') return api.tabs.create({ url, active: false });
  if (target === 'current') return api.tabs.update({ url });
  return api.tabs.create({ url });
}

// ─── Toolbar badge ──────────────────────────────────────────────────────────
async function updateBadge(cache, settings) {
  if (!action) return;
  const s = settings || await getSettings();
  if (s.badgeMode === 'none') { action.setBadgeText({ text: '' }); return; }
  const links = cache ? cache.groups.flatMap(g => g.links) : [];
  const n = links.filter(l => l.status === s.badgeMode).length;
  action.setBadgeText({ text: n ? String(n) : '' });
  action.setBadgeBackgroundColor?.({ color: s.badgeMode === 'up' ? '#16a34a' : '#dc2626' });
  action.setBadgeTextColor?.({ color: '#ffffff' });
}

// ─── Context menus ────────────────────────────────────────────────────────────
// Top entry opens the dashboard; groups become submenus of their links.
async function rebuildMenus(settings) {
  await api.contextMenus.removeAll();
  const s = settings || await getSettings();
  if (!s.contextMenu) return;

  api.contextMenus.create({ id: 'tb-root', title: 'Tailboard', contexts: ['all'] });
  api.contextMenus.create({ id: 'tb-search', parentId: 'tb-root', title: 'Open dashboard', contexts: ['all'] });

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
  const s = await getSettings();
  let data = null;
  try { data = await refreshCache(); } catch (_) { /* keep stale cache */ }
  if (!data) data = await getCache();
  try { await rebuildMenus(s); } catch (_) {}
  try { await updateBadge(data, s); } catch (_) {}
}

api.runtime.onInstalled.addListener(refreshAndRebuild);
api.runtime.onStartup.addListener(refreshAndRebuild);

// ─── Refresh alarm (period from settings) ──────────────────────────────────────
async function scheduleRefresh() {
  const s = await getSettings();
  api.alarms.create('tb-refresh', { periodInMinutes: s.refreshMinutes });
}
scheduleRefresh();
api.alarms.onAlarm.addListener(a => { if (a.name === 'tb-refresh') refreshAndRebuild(); });

// React to setting changes and popup cache writes without a restart.
api.storage.onChanged.addListener(async (changes, area) => {
  if (area === 'local' && changes.cache) {
    try { await updateBadge(await getCache()); } catch (_) {}
    return;
  }
  if (area !== 'sync') return;
  if (changes.refreshMinutes) scheduleRefresh();
  if (changes.contextMenu || changes.instanceUrl) { try { await rebuildMenus(); } catch (_) {} }
  if (changes.badgeMode) { try { await updateBadge(await getCache()); } catch (_) {} }
});

api.contextMenus.onClicked.addListener(async info => {
  const id = info.menuItemId;
  const s = await getSettings();
  if (id === 'tb-search') { if (s.instanceUrl) openUrl(`${s.instanceUrl}/`, s.openTarget); return; }
  if (id === 'tb-setup') { api.runtime.openOptionsPage(); return; }
  if (typeof id === 'string' && id.startsWith('tb-l-')) {
    const linkId = id.slice(5);
    const cache = await getCache();
    const link = cache && cache.groups.flatMap(g => g.links).find(l => l.id === linkId);
    if (link) openUrl(link.url, s.openTarget);
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
    const s = await getSettings();
    let url = text;
    if (!/^https?:\/\//i.test(text)) {
      const cache = await getCache();
      const m = matchLinks(cache, text)[0];
      if (!m) return;
      url = m.url;
    }
    // Omnibox gives its own disposition; fall back to the configured target.
    if (disposition === 'currentTab') api.tabs.update({ url });
    else if (disposition === 'newForegroundTab') api.tabs.create({ url });
    else if (disposition === 'newBackgroundTab') api.tabs.create({ url, active: false });
    else openUrl(url, s.openTarget);
  });
}

api.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'refresh') {
    refreshAndRebuild().then(() => sendResponse({ ok: true }));
    return true;
  }
});
