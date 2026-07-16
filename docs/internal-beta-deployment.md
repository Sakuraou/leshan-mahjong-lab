# Android Internal Beta Deployment

This runbook publishes the authoritative room server and produces the first
installable Android preview APK. Version `0.2.0` uses Render for the single Node
WebSocket service and Expo EAS internal distribution for the signed APK.

## Why Render For The First Beta

Render supports Docker web services, WebSocket upgrades, managed HTTPS/TLS,
health checks, graceful shutdown, and a Singapore region. The checked-in
`render.yaml` fixes the service to one instance because all room state is still
held in process memory.

The Free plan is suitable only for a small internal test. It may spin down after
inactivity and take roughly a minute to wake; a restart or deploy removes every
active room and session. Do not add replicas until room state is moved to shared
durable storage.

References:

- [Render WebSockets](https://render.com/docs/websocket)
- [Render health checks](https://render.com/docs/health-checks)
- [Render free instances](https://render.com/docs/free)
- [Expo internal distribution](https://docs.expo.dev/build/internal-distribution/)

## One-Time Render Authorization

The repository owner must perform this account-bound step:

1. Push `render.yaml` to GitHub.
2. Open [Deploy to Render](https://render.com/deploy?repo=https://github.com/Sakuraou/leshan-mahjong-lab).
3. Sign in with GitHub and authorize `Sakuraou/leshan-mahjong-lab` if prompted.
4. Confirm the `leshan-mahjong-room-server` Blueprint on the Free plan and click
   **Apply**.
5. Wait until the service says **Live**, then record its public HTTPS hostname.

No paid plan is required for the selected Free service. If Render requests
account or payment-method verification, stop there and let the repository owner
decide; account login and authorization cannot be committed or completed by CI.

The resulting public endpoints have this shape:

```text
HTTPS readiness: https://HOST/health/ready
WebSocket:        wss://HOST/ws
```

Current deployed endpoints: pending the one-time Render authorization above.

## Render Blueprint

`render.yaml` supplies the Dockerfile, Singapore region, readiness path, one
Free instance, and the production server environment. Render injects `PORT`, so
the Blueprint intentionally does not hard-code it.

Native Expo clients normally omit a browser Origin, so
`ALLOW_MISSING_ORIGIN=true` is required. Browser clients that send an Origin are
still rejected unless it exactly matches `ALLOWED_ORIGINS`. Add the deployed Web
debug origin later as a comma-separated HTTPS origin; never use `*`.

The production runtime provides:

| Boundary | Configuration |
| --- | --- |
| WebSocket path | `/ws` |
| Liveness | `/health/live` |
| Readiness | `/health/ready` |
| Maximum message | `65536` bytes |
| Heartbeat interval | `10000` ms |
| Connection timeout | `30000` ms |
| Shutdown grace | `5000` ms application, `15` s provider maximum |
| Replicas | `1` |

## Remote Server Verification

After Render reports Live, run the same strict single-session transport used by
the phone App against the public service:

```powershell
$env:ROOM_SERVER_URL='wss://HOST/ws'
$env:ROOM_SERVER_HEALTH_URL='https://HOST/health/ready'
npm run smoke:server:remote
```

The remote smoke waits for readiness, rejects an untrusted browser Origin,
rejects an oversized payload, observes a healthy connection across heartbeat,
expires a connection that deliberately ignores ping, then drives four clients
through create, join, seats, ready, start, dingque,
two discards, one draw, private passes, disconnect, and `resumeSession`.
Output contains no session token or concealed hand.

Graceful shutdown and stale-connection expiry are deterministic core tests and
also run in the local production smoke. During the physical test, a Render
redeploy verifies the provider sends shutdown and the App enters recovery.

## One-Time Expo Authorization

From `apps/mobile`, the repository owner must sign in and bind the project:

```powershell
npx eas-cli login
npx eas-cli init
```

`eas init` writes the Expo owner/project id binding. That identifier is public
project metadata; an Expo access token, Android keystore, session token, or
other credential must never be committed.

Create the public preview endpoint in the EAS `preview` environment:

```powershell
npx eas-cli env:create --name EXPO_PUBLIC_ROOM_SERVER_URL --value wss://HOST/ws --environment preview --visibility plaintext
```

`EXPO_PUBLIC_*` values are readable in the APK, so this variable may contain
only the public WSS URL. Player `sessionToken` values remain in Expo SecureStore
and never enter EAS variables, logs, screenshots, or error messages.

## Build The APK

Build the internal Android artifact:

```powershell
npx eas-cli build --platform android --profile preview
```

The `preview` profile uses production endpoint rules and `android.buildType=apk`
with internal distribution. On the first build, EAS may ask the owner to create
or upload Android signing credentials; letting EAS generate the keystore is the
recommended internal-beta path. Record the returned build id and APK install
URL in this document and the release notes.

The `lan-internal` profile is only for same-Wi-Fi development and permits
cleartext traffic. Preview and production builds refuse `ws://`, localhost,
`10.0.2.2`, LAN addresses, or a missing endpoint instead of silently falling
back to a developer machine.

## Local Preflight

Run these before deployment and again before documenting an APK:

```powershell
npm run check
npm run mobile:typecheck
npm run mobile:doctor
npm run mobile:export
npm run smoke:server
npm run smoke:server:production
```

Docker is also built by Render from the checked-in `Dockerfile`. A local Docker
build is optional when Docker Desktop is unavailable, but the first successful
Render build must be recorded as the container proof.

## Known Internal-Beta Limits

- Rooms, sessions, and match history disappear on server restart or redeploy.
- The server must stay at one instance and has no account authentication,
  database, moderation, abuse throttling, bots, payment, or store release flow.
- Render Free may cold-start after inactivity; the App should remain in its
  reconnect flow until readiness returns.
- Rare continue-gang and exchange scenarios still require targeted physical
  acceptance using `physical-device-test-checklist.md`.
