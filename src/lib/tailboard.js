// Data + settings layer for the extension pages (popup, options, new tab).

const api = globalThis.browser ?? globalThis.chrome;

// All user settings live in storage.sync with these defaults.
export const DEFAULTS = {
  instanceUrl: '',
  badgeMode: 'none',      // 'none' | 'down' | 'up'
  refreshMinutes: 5,      // background refresh period (floor 1)
  openTarget: 'new',      // 'new' | 'current' | 'background'
  showDots: true,         // status dots in the popup
  sortMode: 'group',      // 'group' | 'pinned' | 'alpha'
  theme: 'auto',          // 'auto' | 'light' | 'dark'
  contextMenu: true,      // right-click launcher
};

export const BADGE_MODES   = ['none', 'down', 'up'];
export const OPEN_TARGETS   = ['new', 'current', 'background'];
export const SORT_MODES     = ['group', 'pinned', 'alpha'];
export const THEMES         = ['auto', 'light', 'dark'];

export async function getSettings() {
  const got = await api.storage.sync.get(Object.keys(DEFAULTS));
  const s = { ...DEFAULTS, ...got };
  s.instanceUrl    = String(s.instanceUrl || '').replace(/\/+$/, '');
  s.refreshMinutes = Math.max(1, Number(s.refreshMinutes) || DEFAULTS.refreshMinutes);
  if (!BADGE_MODES.includes(s.badgeMode))  s.badgeMode  = DEFAULTS.badgeMode;
  if (!OPEN_TARGETS.includes(s.openTarget)) s.openTarget = DEFAULTS.openTarget;
  if (!SORT_MODES.includes(s.sortMode))    s.sortMode   = DEFAULTS.sortMode;
  if (!THEMES.includes(s.theme))           s.theme      = DEFAULTS.theme;
  return s;
}

export async function setSettings(patch) {
  await api.storage.sync.set(patch);
}

export async function getInstance() {
  return (await getSettings()).instanceUrl;
}

export async function setInstance(url) {
  await setSettings({ instanceUrl: String(url || '').trim().replace(/\/+$/, '') });
}

// Fetch config + status, flatten into groups. link.url is the resolved
// activeUrl so opening honours the alt-URL fallbacks.
export async function fetchData() {
  const s = await getSettings();
  const base = s.instanceUrl;
  if (!base) throw new Error('No instance URL set');

  // credentials:'include' rides the dashboard's session cookie when auth is on.
  const opts = { credentials: 'include' };
  const [cfg, status] = await Promise.all([
    fetch(`${base}/api/config`, opts).then(r => {
      if (!r.ok) throw new Error(`/api/config returned ${r.status}`);
      return r.json();
    }),
    fetch(`${base}/api/status`, opts).then(r => (r.ok ? r.json() : {})).catch(() => ({})),
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
        pinned: !!l.pinned,
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

// Order a group's links per the chosen sort mode (stable).
export function sortLinks(links, mode) {
  const arr = links.slice();
  if (mode === 'alpha') {
    arr.sort((a, b) => a.name.localeCompare(b.name));
  } else if (mode === 'pinned') {
    arr.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  }
  return arr;
}
