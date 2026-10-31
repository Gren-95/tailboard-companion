import { getSettings, setSettings, setInstance } from '../lib/tailboard.js';

const api = globalThis.browser ?? globalThis.chrome;
const inp = document.getElementById('url');
const status = document.getElementById('status');
const refresh = document.getElementById('refresh');
const showDots = document.getElementById('showDots');
const contextMenu = document.getElementById('contextMenu');

// radiogroup element id -> settings key
const SEGMENTS = { badge: 'badgeMode', openTarget: 'openTarget', sortMode: 'sortMode', theme: 'theme' };

function applyTheme(mode) {
  const r = document.documentElement;
  if (mode === 'auto') { delete r.dataset.theme; r.style.colorScheme = ''; }
  else { r.dataset.theme = mode; r.style.colorScheme = mode; }
}

function paintSeg(groupId, val) {
  document.getElementById(groupId).querySelectorAll('.seg-btn').forEach(b =>
    b.setAttribute('aria-checked', String(b.dataset.val === val)));
}

(async () => {
  const s = await getSettings();
  inp.value = s.instanceUrl;
  refresh.value = s.refreshMinutes;
  showDots.checked = s.showDots;
  contextMenu.checked = s.contextMenu;
  for (const [groupId, key] of Object.entries(SEGMENTS)) paintSeg(groupId, s[key]);
  applyTheme(s.theme);
})();

for (const [groupId, key] of Object.entries(SEGMENTS)) {
  document.getElementById(groupId).addEventListener('click', async e => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    paintSeg(groupId, btn.dataset.val);
    await setSettings({ [key]: btn.dataset.val });
    if (key === 'theme') applyTheme(btn.dataset.val);
  });
}

refresh.addEventListener('change', async () => {
  const n = Math.max(1, Math.round(Number(refresh.value) || 5));
  refresh.value = n;
  await setSettings({ refreshMinutes: n });
});
showDots.addEventListener('change', () => setSettings({ showDots: showDots.checked }));
contextMenu.addEventListener('change', () => setSettings({ contextMenu: contextMenu.checked }));

document.getElementById('save').addEventListener('click', async () => {
  const v = inp.value.trim().replace(/\/+$/, '');
  await setInstance(v);
  status.textContent = 'Saving…';
  try {
    const r = await fetch(`${v}/api/config`, { credentials: 'include' });
    status.textContent = r.ok ? 'Saved ✓ — connected to instance.' : `Saved, but /api/config returned ${r.status}.`;
  } catch (e) {
    status.textContent = `Saved, but could not reach the instance: ${e.message}`;
  }
  try { await api.runtime.sendMessage({ type: 'refresh' }); } catch (_) {}
});
