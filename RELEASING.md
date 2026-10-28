# Releasing

CI (`.github/workflows/`):

- **ci.yml** — runs `web-ext lint` on every push to `main` and on PRs.
- **release.yml** — on a `v*` tag, sets the manifest version from the tag, lints, signs and submits to AMO (listed), and uploads the signed `.xpi` as a build artifact. An optional Chrome job publishes to the Chrome Web Store.

## One-time setup

### Firefox (AMO)
1. Create the listing once by hand at https://addons.mozilla.org (first submission sets name, description, screenshots, category). Later versions go through CI.
2. addons.mozilla.org → Manage API Keys → generate a key/secret.
3. Add repo secrets:
   - `AMO_API_KEY` = the JWT issuer
   - `AMO_API_SECRET` = the JWT secret

### Chrome Web Store (optional)
1. Register at the Chrome Web Store Developer Dashboard (one-time $5 fee) and create the item once by hand to get its ID.
2. Create OAuth credentials and a refresh token (see `chrome-webstore-upload` docs).
3. Add repo variable `ENABLE_CHROME` = `true`, and repo secrets:
   - `CWS_EXTENSION_ID`
   - `CWS_CLIENT_ID`
   - `CWS_CLIENT_SECRET`
   - `CWS_REFRESH_TOKEN`

## Cutting a release

```
git tag v0.1.1
git push origin v0.1.1
```

The tag drives the manifest version, so keep tags ahead of the last published version. AMO and the Chrome Web Store still run their own review before the version goes live.
