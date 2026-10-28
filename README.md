# Tailboard Companion

Browser extension (MV3, Firefox + Chrome) for the self-hosted [Tailboard](https://github.com/Gren-95/tailboard) dashboard.

## Features

- New-tab page shows your Tailboard instance.
- Toolbar popup: searchable list of links grouped by group, with status dots. Enter opens the first match; Ctrl/Cmd+click opens in a background tab. Shortcut: `Ctrl+Shift+Space`.
- Omnibox: type `tb` + space in the address bar, then a query.
- Right-click menu: links grouped by group, plus an item to open the dashboard.

Opens each link's resolved `activeUrl` from `/api/status`, so alt-URL fallbacks are respected.

## Setup

Set the instance URL in options (gear icon in the popup). The popup and menus read `GET /api/config` and `GET /api/status`; the cache refreshes every 5 minutes and when the popup opens.

## Load

Firefox: `about:debugging` > This Firefox > Load Temporary Add-on > `manifest.json`. A permanent install needs an AMO-signed `.xpi` (`web-ext sign`), or Developer/Nightly/ESR with `xpinstall.signatures.required=false`.

Chrome: `chrome://extensions` > Developer mode > Load unpacked > this folder.

With `web-ext` (`npm i`): `npm run start:firefox`, `npm run build`.

## Notes

- `host_permissions` is `<all_urls>` so any configured instance can be fetched cross-origin. Narrow it to your instance origin if preferred.
- New-tab iframe needs the instance to allow framing (no `X-Frame-Options: DENY` / restrictive `frame-ancestors`). Tailboard sends neither.
- No icons bundled yet; the browser shows a default.

## Layout

```
manifest.json
src/
  background.js      context menus, omnibox, refresh alarm
  lib/tailboard.js   config + status -> links
  popup/             popup search
  options/           instance URL
  newtab/            new-tab page
```
