# Internal Beta Deployment

This runbook turns the authoritative multi-round game into a remote mobile
beta. It is platform-neutral: any provider that can run one Dockerized Node
service, expose an HTTP health endpoint, and proxy WebSocket upgrades can host
the first test server.

## Production Room Server

Copy `.env.example` to a private environment configuration and set at least:

```text
HOST=0.0.0.0
PORT=8787
WS_PATH=/ws
ALLOWED_ORIGINS=https://your-web-debug-console.example
ALLOW_MISSING_ORIGIN=true
```

`ALLOW_MISSING_ORIGIN=true` permits native clients that do not send a browser
Origin. Browser connections that do send an Origin still have to match
`ALLOWED_ORIGINS`. Wildcard origins are rejected.

Run directly:

```bash
npm ci
npm run start:server
```

Or run the container:

```bash
docker build -t leshan-mahjong-room-server .
docker run --rm --env-file .env -p 8787:8787 leshan-mahjong-room-server
```

| Provider setting | Value |
| --- | --- |
| Runtime | `Dockerfile` |
| Internal port | `PORT` (default `8787`) |
| WebSocket path | `/ws` |
| Liveness | `/health/live` |
| Readiness | `/health/ready` |
| Replicas | `1` |
| TLS | Terminate at provider proxy |

After deployment, verify `https://HOST/health/ready`, then use
`wss://HOST/ws` as the App endpoint. The current server is intentionally
in-memory and single-instance: a restart removes active rooms and sessions,
and horizontal replicas would split room state.

## Expo Internal Build

From `apps/mobile`, link the Expo project once and create the public endpoint
variable in the preview environment:

```bash
npx eas-cli login
npx eas-cli init
npx eas-cli env:create --name EXPO_PUBLIC_ROOM_SERVER_URL --value wss://HOST/ws --environment preview --visibility plaintext
npx eas-cli build --platform android --profile preview
```

The preview profile creates an internal-distribution Android APK. For an iOS
internal build, register test devices and use the same `preview` profile with
an Apple developer account. The `lan-internal` profile is reserved for same
Wi-Fi testing and enables Android cleartext traffic; `preview` and `production`
use production mode and only accept `wss://`.

`EXPO_PUBLIC_*` values are readable in the client bundle. They may contain the
public server URL, never a session token, API secret, or player credential.
Session recovery data is written only through Expo SecureStore.

## Connection Modes

| App mode | Default or requirement | Intended use |
| --- | --- | --- |
| Development / local | `ws://127.0.0.1:8787` | iOS simulator or same-machine client |
| Development / Android emulator | `ws://10.0.2.2:8787` | Android Studio emulator |
| LAN | Explicit `ws://COMPUTER_IP:8787` | Expo Go or LAN internal APK |
| Production | Explicit remote `wss://.../ws` | Remote internal beta |

The App reports invalid address, insecure production URL, TLS/certificate
failure when the runtime exposes it, device offline, server unavailable,
invalid session, and missing room as separate Chinese states. Some mobile
WebSocket runtimes collapse TLS and network handshake failures; the App uses
network availability plus the safest available classification in that case.

## Preflight

```bash
npm run check
npm run mobile:typecheck
npm run mobile:export
npm run smoke:server
npm run smoke:server:production
```

Do not place `.env`, EAS credentials, signing keys, or production session data
in Git. The committed `.env.example` files contain names and placeholders only.
