# Hosting on Cloudflare Pages

Prepared in Phase 6; not deployed yet. AxisBuilder is a static site: the build in `app/dist` is all there is, with no
server code. After the first visit the service worker keeps the whole app in the browser, so it works offline.

## 1. Create the Pages project (once, by Sean or IT)

Cloudflare dashboard > Workers & Pages > Create > Pages > Connect to Git > the AxisBuilder repository.

| Setting | Value |
|---|---|
| Production branch | `main` |
| Framework preset | None |
| Root directory | `app` |
| Build command | `npm run build` |
| Build output directory | `dist` (that is `app/dist`, relative to the root directory) |
| Node version | 24, read from `app/.nvmrc` (or set the variable `NODE_VERSION` = `24`) |

Pages installs the packages itself (`npm ci`, from `app/package-lock.json`). The SheetJS package comes from
`cdn.sheetjs.com`, which the build machine reaches like npm. `npm run build` also type-checks the tests, so a build
only goes out when it compiles. CI (`.github/workflows/app-ci.yml`) still runs the tests on every push.

Preview deployments: every other branch and pull request gets its own preview address
(`<branch>.<project>.pages.dev`). Turn them off (Settings > Builds > Branch control) if only `main` should be visible.

## 2. What the repository already has for Pages

- `app/public/_headers` (copied into `dist/`): `index.html`, `/`, `sw.js` and `manifest.webmanifest` are sent with
  `Cache-Control: no-cache`, so a browser asks for them each visit and finds a new version at once. Files in `/assets/`
  have a hash in their names and are cached for a year. Every page also gets `nosniff`, `same-origin` referrer and no
  framing.
- No redirect file is needed: the app is one page at `/`. With no `404.html` in the build, Pages answers any unknown
  path with `index.html` (its single-page app mode), and offline the service worker does the same.
- `app/.nvmrc`: Node 24, the same as CI.

## 3. How updates reach the inspectors

1. Merge a pull request into `main`. Pages builds it and publishes it in a minute or two (Deployments tab shows it).
2. The next time an inspector opens AxisBuilder while online, the browser finds the new `sw.js`, downloads the new
   version in the background and reloads the page once onto it (`registerType: 'autoUpdate'`). Nothing to click.
3. Offline, they keep the version they have until they are next online. Older job files (`.axb`) are brought up to
   date when opened; a file saved by a newer version is refused by an older one with "Update the app and try again"
   (reopen AxisBuilder online to get the update).

To roll back: Deployments > an earlier deployment > Rollback. Browsers move to it on their next online visit, like
any other update.

## 4. Who can open it: Cloudflare Access (Sean or IT)

The app holds no client data on the server (jobs stay on each computer), but it should only be open to Integrity EPC
staff. Cloudflare Zero Trust does this without changes to the app:

1. Zero Trust > Access > Applications > Add an application > Self-hosted.
2. Application domain: the Pages address (`<project>.pages.dev`), and the custom domain if one is added later. Add
   `*.<project>.pages.dev` as well, so the preview addresses are covered too.
3. Policy: Action Allow, Include > Emails ending in `@integrityepc.com`.
4. Login method: One-time PIN (an emailed code; works at once), or the company's Microsoft Entra ID / Azure AD if IT
   connects it (Settings > Authentication), so inspectors sign in with their work account.
5. Session duration: as long as IT allows (1 month is the longest Access offers).

The Pages project's settings also have an option to put its preview deployments behind Access; switch it on.

**One thing to watch (not yet tried with Access):** once installed, the service worker opens the app from the
browser's own copy without asking the server, so an inspector whose Access session has run out never sees the sign-in
page. The app still works, but the update check (`sw.js`) is turned away by Access, so updates wait until they sign in
again. If an inspector is stuck on an old version: open the address in a normal browser tab and press Ctrl+F5, or sign
in at `https://<team>.cloudflareaccess.com` first, then reopen the app. A long session duration makes this rare. (See
"Suggested improvements" in the Phase 6 change log: the app could notice this and show "Sign in again for updates".)

## 5. Checks after the first deployment

- Open the address in Edge or Chrome, sign in, open the sample job.
- Install it (the install icon in the address bar) and check the icon and name.
- Close it, switch Wi-Fi off, open it again from the Start menu: the start screen and the sample job still open.
- Make a small change on a branch, merge it, and check that the version on the start screen changes after reopening.
  (The version is `version` in `app/package.json`; raise it for each release so inspectors can tell.)

## Local check before a release

`npm run build`, then `npm run preview` (serves `dist/` with the service worker on <http://localhost:4173>). Open it
once, stop the preview, reload: the app and a job still open (checked in Phase 6).
