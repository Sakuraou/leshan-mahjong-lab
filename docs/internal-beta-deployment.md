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

## Render Deployment

The repository owner completed this account-bound step on 2026-07-16:

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

Current deployed endpoints:

```text
HTTPS readiness: https://leshan-mahjong-room-server.onrender.com/health/ready
WebSocket:        wss://leshan-mahjong-room-server.onrender.com/ws
```

## Render Blueprint

`render.yaml` supplies the Dockerfile, Singapore region, readiness path, one
Free instance, and the production server environment. Render injects `PORT`, so
the Blueprint intentionally does not hard-code it.

React Native Android derives a default HTTPS Origin from the WSS endpoint, so
the deployed service origin
`https://leshan-mahjong-room-server.onrender.com` is explicitly included in
`ALLOWED_ORIGINS`. `ALLOW_MISSING_ORIGIN=true` remains enabled for native
clients that omit the header. Other origins are rejected; never use `*`.

The production runtime provides:

| Boundary | Configuration |
| --- | --- |
| WebSocket path | `/ws` |
| Liveness | `/health/live` |
| Readiness | `/health/ready` |
| Maximum message | `65536` bytes |
| Heartbeat interval | `10000` ms |
| Connection timeout | `30000` ms |
| Shutdown grace | `5000` ms in the application; provider uses its Free-tier default |
| Replicas | `1` |

## Remote Server Verification

Run the same strict single-session transport used by the phone App against the
public service:

```powershell
$env:ROOM_SERVER_URL='wss://leshan-mahjong-room-server.onrender.com/ws'
$env:ROOM_SERVER_HEALTH_URL='https://leshan-mahjong-room-server.onrender.com/health/ready'
npm run smoke:server:remote
```

The remote smoke waits for readiness, rejects an untrusted browser Origin,
rejects an oversized payload, observes a healthy connection across heartbeat,
lets one response window close by its authoritative deadline, then drives four
clients through create, join, seats, ready, start, dingque, two discards, one
draw, private passes, disconnect, and `resumeSession`.
Output contains no session token or concealed hand.

The first hosted verification returned readiness `200`, rejected an untrusted
Origin with `403`, closed a 70 KiB message, kept a healthy socket connected, and
completed the four-player flow plus session recovery. Render's public edge
answers WebSocket control-frame pings, so a public client that disables automatic
pong cannot force the backend's native stale timer to expire. That timer remains
covered by the local production smoke; remote acceptance instead covers the
authoritative response deadline and an actual socket close/resume.

A controlled Render redeploy for commit `d226682` was observed with a healthy
public WebSocket held open. The connection opened, closed with code `1006`
during the instance switch, readiness returned `200`, and the complete remote
four-client smoke then passed again. This proves the public client receives a
disconnect and can enter recovery. Because state is in memory, an old room is
still expected to be unavailable after a new instance starts.

## Expo Project Binding

The one-time authorization is complete:

- Owner: `twilight111`
- Project: `@twilight111/leshan-mahjong`
- EAS project id: `f5f69fff-2b00-4a9d-b979-d3d6964b113c`
- Preview environment: public
  `EXPO_PUBLIC_ROOM_SERVER_URL=wss://leshan-mahjong-room-server.onrender.com/ws`

The commands below are retained for reproducing the setup on a new owner
account. They do not need to be rerun for the current project.

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
npx eas-cli env:create --name EXPO_PUBLIC_ROOM_SERVER_URL --value wss://leshan-mahjong-room-server.onrender.com/ws --environment preview --visibility plaintext
```

`EXPO_PUBLIC_*` values are readable in the APK, so this variable may contain
only the public WSS URL. Player `sessionToken` values remain in Expo SecureStore
and never enter EAS variables, logs, screenshots, or error messages.

## Build The APK

First signed preview build:

- Build id: `ac719fc4-730a-4236-8b3c-bdbde3fb5495`
- Build page:
  `https://expo.dev/accounts/twilight111/projects/leshan-mahjong/builds/ac719fc4-730a-4236-8b3c-bdbde3fb5495`
- Version: `0.2.0` (`versionCode` 1)
- Distribution: internal Android APK
- Status: finished successfully at 2026-07-17 00:13 HKT
- Artifact:
  `https://expo.dev/artifacts/eas/RO_ovhmgw0dcbkEypy1Y2fyWB2xsjHXhHoQKWuhc9vg.apk`
- Verified response: `200 OK`, `application/octet-stream`, 69,896,889 bytes
  (approximately 66.7 MiB)
- Availability: EAS Free build artifact through 2026-07-30; keep the build page
  as the durable record after the direct artifact expires

Build the internal Android artifact:

```powershell
npx eas-cli build --platform android --profile preview
```

The `preview` profile also commits this same public WSS endpoint as a profile
environment value, so the beta cannot silently fall back to localhost. EAS may
override it with the matching account environment value. The profile uses
production endpoint rules and `android.buildType=apk`
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

The final 2026-07-17 preflight for build
`ac719fc4-730a-4236-8b3c-bdbde3fb5495` passed all commands above. It included
211 rule/transport/server tests, Expo Doctor 20/20, Android export, the local
production security smoke, and the hosted four-client create/join/seat/ready/
dingque/draw/discard/deadline/resume flow.

## Known Internal-Beta Limits

- Rooms, sessions, and match history disappear on server restart or redeploy.
- The server must stay at one instance and has no account authentication,
  database, moderation, abuse throttling, bots, payment, or store release flow.
- Render Free may cold-start after inactivity; the App should remain in its
  reconnect flow until readiness returns.
- Rare continue-gang and exchange scenarios still require targeted physical
  acceptance using `physical-device-test-checklist.md`.
