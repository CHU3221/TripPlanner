# TripPlanner — Route Cache Pipeline Update

This patch is based on the attached `TripPlanner(1).zip` project (2026-10-25).

## Behavior

- `GOOGLE.ROUTES.RESULT` and `NAVER.DIRECTIONS5.RESULT` use the existing provider-cache SQLite storage.
- Default TTL 0: no persistent route caching. The current browser session can still display a queried route; refresh discards it.
- TTL -1 and retention -1: permanent cache (only where storage is permitted; e.g. independently generated mock route responses).
- Positive TTL: `ttlHours - safetyMarginHours` fresh lifetime; `retentionHours` is physical retention.
- Admin policy save with TTL 0: immediately purge previous route-cache records; new writes are denied.
- Only explicit search may call external route API. Search checks cache first, then writes normalized candidate arrays on miss.
- Saved Trip stores only routeIntent.option (candidate ID). Reload restores full selected route from SQLite without external API request.
- Undo/Redo, changed coordinates/waypoints/mode, and per-Trip isolation remain guarded.

## Apply patch to Git source

From the project root, after backing up / committing your local changes:

    unzip -o TripPlanner-route-cache-patch.zip -d .
    npm ci
    npm run build
    npm run test:route-cache
    git status
    git add README.md package.json server src tests/run-route-cache-pipeline-tests.mjs
    git commit -m "feat(routes): add persistent route cache with zero-TTL purge"
    git push origin main

Do not overwrite `.env.local`, database, or operator cache override settings.

## Enable in Admin UI

Cache settings now list `GOOGLE.ROUTES.RESULT` and `NAVER.DIRECTIONS5.RESULT`.
Leave at `ttlHours=0` and `retentionHours=0` for the old behavior.
For independently generated Google mock routes you may set `ttlHours=-1`, `retentionHours=-1`.
To turn off later, set TTL to `0` and save: the backend purges stored route results on policy update.
Do NOT permanently cache actual Google/NAVER route results unless the applicable provider terms allow it.

## Server upgrade using the FULL archive

Copy the `TripPlanner-route-cache-full.zip` to /home/container/pods on the server.
Run as the rootless Podman account (`container`, not root):

    TP_ZIP=/home/container/pods/TripPlanner-route-cache-full.zip bash /home/container/pods/tripplanner/install.sh upgrade
    bash /home/container/pods/tripplanner/install.sh activate

The existing installer preserves `.env.local`, SQLite data, favicon override and operator policy override when upgrading, then creates new image tags and Quadlet unit definitions.
To apply PATCH files directly on the server instead, rebuild BOTH web and server images and recreate containers using the currently configured Quadlet image tags.

## Verify

1. Set mock route policy TTL=-1 in management page.
2. Explicitly request a transit route, select a candidate, save the Trip.
3. Confirm provider-cache record count grows and the route renders.
4. Reload: chosen geometry and transit steps should restore without another Google route request.
5. Set TTL=0 and save in management; provider-cache records for that policy are purged.
6. Reload: route response disappears, but user route intent persists and the map falls back to straight connection.

## Validation performed here

- `node tests/run-route-cache-pipeline-tests.mjs`: passed (SQLite, HTTP, policy changes, per-Trip isolation, route details).
- `node tests/run-devpack20-presentation-connection-tests.mjs`: passed.
- `node tests/run-release-1.0.0-tests.mjs`: passed.
- TS syntax/transpile checks and typecheck for non-React cache modules: passed.
- Full `npm ci` and Vite build could not be executed in this isolated environment because the npm package archive is not locally available.
- Existing unrelated devpack16 cache tests assert a 720h position legal max, while the supplied source currently declares -1; this pre-existing mismatch was not changed by the patch.
