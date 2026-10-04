# C-Water Mobile (`cw_pwa`)

The installable phone app for C-Water field engineers. It is a Frappe app that
ERPNext v16 serves at **`/cw`**, and it talks only to the API in
[`cw_visit`](../cw_visit) (`cw_visit.api.v1`). It holds no business rules and no
DocTypes of its own.

This app replaces `cw_field_service_pwa`.

## What changed from the old app

| | `cw_field_service_pwa` | `cw_pwa` |
| --- | --- | --- |
| Stack | Vue 3 + Ionic + frappe-ui 0.1 | Vue 3 + Vite 7 + Tailwind 3, own mobile shell. No Ionic, no frappe-ui. |
| First load | Ionic and frappe-ui bundles | about 59 KB gzipped for the first screen |
| Where it calls the API | `onespace.cw-eg.com` directly, from another origin | same origin only |
| Signing in | fell back to built-in demo accounts when the server refused | real ERPNext session only |
| Offline | a queue whose idempotency keys the server ignored | IndexedDB working copies, an ordered outbox, and keys the server enforces |
| Service worker | took over mid-session on every deploy | waits; the engineer taps **Update** |

The same-origin point is the important one. The old app's cross-origin calls lost
the session cookie, which is why the old API had been opened to guests. The new
API requires a signed-in user, so the app must be served from the same origin as
ERPNext, either by ERPNext itself (recommended) or behind a reverse proxy.

## Screens

Launch screen · Login · Home (greeting, next visit, counts) · Visits (search, tabs) · Visit
(site, directions, call contact, request, check-in result, site history) ·
Visit flow in seven steps (Checklist, Readings, Findings, Photos, Work done,
Requests, Submit) · New on-site visit (customer list, site photo) · Sync queue ·
Alerts · Profile (language, permissions, notifications).

## Install on a bench (recommended)

`cw_visit` must be installed first.

```bash
bench get-app <repo-url-or-path>/cw_pwa
bench --site <site> install-app cw_pwa
bench --site <site> migrate       # creates the push DocTypes
bench build --app cw_pwa          # runs the Vite build through package.json
bench --site <site> clear-cache
bench restart
```

Then open `https://<site>/cw` on a phone and sign in.

`get-app` installs the app's one Python dependency, `pywebpush`. When updating an
existing install, run `bench setup requirements` so it is picked up.

Requirements: Node 20.19 or newer on the bench (ERPNext v16 already needs Node 24)
and HTTPS on the site. Service workers, location and the camera do not work over
plain HTTP, except on `localhost`.

On a small server the Vite build can run out of memory. Either give Node more room
(`NODE_OPTIONS=--max-old-space-size=2048 bench build --app cw_pwa`) or build on
another machine and copy `cw_pwa/public/frontend/` and `cw_pwa/www/cw.html` over.

### Replacing the old PWA app

`cw_field_service_pwa` has no DocTypes, so it can simply be uninstalled:

```bash
bench --site <site> uninstall-app cw_field_service_pwa
bench remove-app cw_field_service_pwa
```

Engineers who installed the old app on their home screen should remove it and
install the new one from `/cw`. The old app's queued, unsent work is not carried
over, so have them sync it first.

### How it is served

| URL | Served by |
| --- | --- |
| `/cw`, `/cw/<anything>` | `cw_pwa/www/cw.py` + the built `cw.html`. One page; the app's router does the rest. |
| `/cw/sw.js` | `cw_pwa.renderers.ServiceWorkerPage`, with `Service-Worker-Allowed: /cw`. |
| `/assets/cw_pwa/frontend/*` | Frappe's static assets (content-hashed bundles). |
| `/assets/cw_pwa/manifest/*` | App icons. |
| `/api/method/cw_pwa.api.boot` | Who is signed in, plus the CSRF token. |

Serving the worker from `/cw/sw.js` means no nginx change is needed for it to
control the app. If a proxy cache sits in front of ERPNext, exclude `/cw` and
`/cw/*` from it: the page carries the visitor's own CSRF token.

Two paths are build output and are not committed: `cw_pwa/public/frontend/` and
`cw_pwa/www/cw.html`.

## Standalone hosting (optional)

`npm run build:standalone` writes a static bundle to `dist/` for a separate host
such as `app.cw-eg.com`. That host **must reverse-proxy** `/api`, `/files` and
`/private` to ERPNext so the browser still sees one origin. `vercel.json` in this
folder does that for Vercel; change the ERPNext address in it if the site moves.
This path has not been tested against the live site.

## Development

```bash
cd frontend
npm install

# against a local bench (proxies /api to the bench; open http://<site>:8080/cw)
npm run dev

# without any ERPNext: a mock server with sample data
npm run build:standalone && npm run mock     # http://localhost:8090
                                             # engineer@example.com / demo
npm test                                     # rule unit tests
```

The mock server (`frontend/scripts/mock-server.mjs`) answers the same endpoints as
`cw_visit.api.v1` with in-memory data. It is a development aid, not a
specification: `cw_visit` is the source of truth.

## How offline works

Shipped, and what the engineer can rely on:

- **The app opens offline** once it has been opened online on that phone.
- **Visits already opened on the phone** stay available, with everything typed
  into them. The visit list is the last one downloaded.
- **Every change is queued** on the phone and sent in order when a connection
  returns: starting a visit, the captured data, photos, submitting for review, and
  a new on-site visit. Each has an idempotency key, so a retry cannot act twice.
- **Nothing is dropped silently.** The header shows how many changes are waiting.
  A change the server rejects is taken out of the queue, the visit is put back as
  it was, and the server's reason is shown on the visit.
- **Signing out wipes the phone**: local visits, the queue, cached photos. The app
  warns first if anything is unsent.

Not offline, by design:

- Signing in.
- Opening a visit that was never opened on this phone.
- Looking up a stock item, and the site list of a customer. The customer list itself
  falls back to the customers this phone last loaded.
- Site history from previous visits.

The server is always the authority. The phone estimates the geofence result and
reading status for guidance; the server recomputes both and its values replace the
estimates. If two devices edit the same visit, the server's stored status decides
what is still allowed. There is no merge of concurrent edits.

On iPhone, Safari clears offline storage after about seven days without use unless
the app is installed to the Home Screen (Profile > Install on this phone).

## Language

English and Arabic. Arabic switches the whole app to right-to-left. The app starts
in the engineer's ERPNext language; they can change it on the sign-in screen or in
Profile, and the choice is remembered on that phone.

- All text is translated in `frontend/src/locales/ar.js`. English is the key.
- Text in templates is routed through the translator automatically at build time
  (`frontend/scripts/i18n-plugin.mjs`). Only sentences with a value inside them need
  an explicit `t("... {name} ...", { name })`.
- `npm run build && npm run i18n:check` lists any text without an Arabic
  translation.
- Not translated: anything that is data in ERPNext (customer, site and service-type
  names, parameters, checklist items), the text of alerts, and error messages that
  come from the server.

## Permissions

After the first sign-in the app shows one sheet asking for **location**, **camera**
and **notifications**, with the reason for each. The same list is in Profile and
shows the real state. A permission that was refused cannot be asked for again from
the app; the engineer has to allow it in the phone's settings, and the app says so.

## Notifications

The app receives a push notification, even when closed, for every alert about a
visit or a service request: a visit assigned, a service request assigned, a visit
sent back for correction, approved, rejected or cancelled.

How it works:

- Standard Web Push (VAPID), sent from the site directly to Google's, Apple's and
  Mozilla's push services. No Firebase project and no relay server.
- The key pair is generated the first time it is needed and stored in **CW PWA
  Settings**. *Send Push Notifications* there turns the feature off for the site.
- Each phone that allows notifications is stored as a **CW Push Subscription**.
  Signing out removes that phone.
- Notifications are sent by a background job, so the bench workers must be running,
  and the server must be able to make outbound HTTPS requests.

Limits to know:

- **iPhone:** web notifications only work for an app added to the Home Screen
  (iOS 16.4 or later). In Safari itself there are none; the app explains this.
- **Android:** works in Chrome, installed or not.
- The notification text is whatever the server wrote, in English.
- Profile has **Send a test notification** to check a phone end to end.

## Launch screen

An animated launch screen (the pin drops and ripples, then the name fades in) is
part of the first HTML response, so it appears before any JavaScript loads and
stays until the app is ready. On iPhone a matching still image is shown first by
iOS for the common screen sizes. It honours the phone's reduced-motion setting.

## Not included

- Attaching a photo to a specific finding or expense row. Photos are visit-level
  evidence with a category (for example "Expense Receipt").
- Landscape launch images, and launch images for iPads.

## License

MIT. Copyright (c) 2026 Nest Software Development & C-Water.
