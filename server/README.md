# TripPlanner backend (devpack15)

Trip persistence, authentication, user approval, user permissions, per-Trip ACL, runtime map-key gating and management APIs.

## Run

```bash
npm run server
```

Default backend: `127.0.0.1:8787`, database `.tripplanner/tripplanner.sqlite`.
Use `npm run dev:full` to start backend + Vite. Vite proxies Trip/auth/admin/runtime-config APIs to the backend.

## Authentication model

- Ordinary users are stored in SQLite (`users`) with `scrypt` password hashes.
- New registrations start as `PENDING` and cannot log in until an administrator approves them.
- Sessions are random 256-bit tokens. Only SHA-256 token hashes are stored in SQLite; the browser receives an HttpOnly, SameSite=Lax cookie.
- Disabled users and password resets invalidate their active sessions.
- A reset user is forced to change the temporary password after the next login.

### Administrator

The administrator account is intentionally **not stored in SQLite**.

`ADMIN_ID` and `ADMIN_PASSWORD_HASH` live in server-private `.env.local`. If and only if **both fields are absent**, the server enters bootstrap mode:

- ID: `admin`
- Password: `admin`
- successful login immediately forces administrator credential setup
- the setup page writes a `scrypt` hash to `.env.local`

If only one of `ADMIN_ID` / `ADMIN_PASSWORD_HASH` exists, admin login fails closed until the configuration is repaired.

SSH recovery: stop the server, remove **both** admin fields from `.env.local`, restart, log in with `admin/admin`, then set a new administrator credential.

## User permissions

Authorization flags are stored separately from account status in `user_permissions`.

Current flag:

- `can_create_trips`: whether an ordinary user may create a new Trip.

Existing users default to allowed. Management changes this flag without disabling login. The server enforces it on `POST /api/trips`.

## Per-Trip access control

Trip ACL is server-owned and deliberately **not stored in the Trip Snapshot**.

- `OPEN`: every active authenticated user may access the Trip.
- `RESTRICTED`: only explicitly selected ordinary users may access it.
- Administrator access bypasses the ACL.
- A legacy Trip with no ACL row is treated as `OPEN`.

The ACL is enforced when listing Trips, loading a Trip directly, and saving a Trip. Client-side hiding alone is never considered authorization.

## Map API gating

`GET /api/runtime-config` requires a valid session. The frontend does not read a Vite-embedded Google Maps key. It asks for runtime map configuration only after authentication succeeds, and the map editor is not mounted before then. Therefore an unauthenticated page view does not load the Google Maps JavaScript SDK and does not consume Dynamic Maps SKU through TripPlanner.

The browser-visible map key is still visible to an authorized user's browser. Keep Google HTTP-referrer/API restrictions and quotas enabled.

## Server configuration

See `.env.local.example`. Important values:

- `GOOGLE_MAPS_API_KEY`
- `GOOGLE_MAP_ID`
- `VITE_NAVER_MAP_CLIENT_ID` (browser-visible NAVER SDK client id)
- `NAVER_API_HUB_CLIENT_ID`, `NAVER_API_HUB_CLIENT_SECRET`
- `NAVER_MAP_CLIENT_ID`, `NAVER_MAP_CLIENT_SECRET`
- `TRIPPLANNER_SERVER_HOST`
- `TRIPPLANNER_SERVER_PORT`
- `TRIPPLANNER_DB_PATH`

## API summary

Public:

- `GET /api/health`
- `GET /api/auth/status`
- `POST /api/auth/login`
- `POST /api/auth/signup`

Authenticated:

- `POST /api/auth/logout`
- `PUT /api/auth/password`
- `GET /api/runtime-config`
- `GET/POST /api/trips`
- `GET/PUT /api/trips/:id`

Administrator:

- `PUT /api/auth/admin-credentials`
- `GET /api/admin/users`
- `POST /api/admin/users/:id/approve`
- `PUT /api/admin/users/:id/status`
- `PUT /api/admin/users/:id/reset-password`
- `PUT /api/admin/users/:id/permissions`
- `GET /api/admin/trips/access`
- `GET /api/admin/trips/:tripId/access`
- `PUT /api/admin/trips/:tripId/access`
- `GET /api/admin/system`

`/api/admin/system` reports provider configuration and live cache-policy status. In devpack16 the authenticated provider-cache endpoints and Google place-position hydration are wired to the SQLite cache. Management can edit only operator TTLs within the immutable developer maximums.


### Provider cache runtime

- `PUT /api/admin/cache-policy` validates and writes the server-private operator override file. Values above the developer maximum, illegal `-1`, unknown keys, or invalid safety-margin combinations are rejected.
- `GET|PUT /api/trips/:tripId/provider-cache` requires Trip access and is used by the Google place hydration adapter.
- Cache timestamps come from the backend clock. Reads re-check the current policy synchronously, and a cleanup poller deletes entries that are no longer readable.
- Current cross-Trip reuse remains disabled by the developer catalog even if the operator opt-in is set.

### Trip image attachments (devpack23)

- `POST /api/trips/:tripId/attachments` accepts an authenticated raw JPEG/PNG/WebP body (8 MiB max) and returns attachment metadata.
- `GET /api/trips/:tripId/attachments/:attachmentId` streams the private attachment after Trip ACL validation.
- File signatures are checked server-side; the client-provided MIME header alone is not trusted.
- Binary files are stored under an `attachments/` directory next to the SQLite database. TripSnapshot stores metadata/reference only.
- Newly uploaded files are initially uncommitted so another collaborator's save cannot delete an image still being edited. A successful Trip save marks referenced uploads committed and deletes committed files removed from the saved Snapshot.
- Abandoned uncommitted uploads have a 24-hour grace and are cleaned hourly by the backend. Administrator Trip deletion removes all Trip attachment files.
- Current database schema version is **5** (`trip_attachments`).

Additional authenticated/admin routes:

- `DELETE /api/trips/:id` — administrator-only Trip deletion.
