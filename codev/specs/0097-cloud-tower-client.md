# Specification: Cloud Tower Client (Tunnel & Registration)

<!--
SPEC vs PLAN BOUNDARY:
This spec defines WHAT and WHY. The plan defines HOW and WHEN.

DO NOT include in this spec:
- Implementation phases or steps
- File paths to modify
- Code examples or pseudocode
- "First we will... then we will..."

These belong in codev/plans/0097-*.md
-->

## Metadata
- **ID**: 0097-cloud-tower-client
- **Status**: draft
- **Created**: 2026-02-10
- **Companion Spec**: `codevos.ai/codev/specs/0001-cloud-tower-registration.md` (server side)

## Problem Statement

The tower server (Spec 0090) currently relies on cloudflared for remote access. Users must install cloudflared separately, manually start tunnels, scan QR codes, and deal with ephemeral URLs that change on every restart. There is no centralized way to discover or manage towers remotely.

The codevos.ai service (companion spec 0001) is being built as a centralized hub for tower management with an embedded tunnel server. **This spec defines the tower-side (client) changes** needed to connect to codevos.ai, eliminating the cloudflared dependency entirely.

## Current State

**Remote Access (cloudflared-based):**
- Tower server has built-in cloudflared integration (`startTunnel()` / `stopTunnel()` functions)
- `cloudflared tunnel --url http://localhost:4100` creates an ephemeral trycloudflare.com URL
- API key authentication via `af web keygen` protects tunnel endpoints
- QR code generation for mobile access
- Tunnel is spawned as a child process; managed during graceful shutdown

**Tower Architecture (Spec 0090 — Single Daemon):**
- Single daemon on port 4100, all projects multiplexed
- Terminals multiplexed over WebSocket at `/ws/terminal/<terminal-id>`
- Global state in `~/.agent-farm/global.db` (SQLite)
- React dashboard served from tower

## Desired State

**Tower connects directly to codevos.ai — no cloudflared required:**

1. **Registration CLI**
   - `af tower register` initiates one-time registration with codevos.ai
   - Opens browser for authentication, receives a token, stores credentials locally
   - Tower gets a unique ID tied to the user's account
   - Credentials stored in `~/.agent-farm/cloud-config.json`

2. **Built-in Tunnel Client**
   - On tower startup, if registered, tower connects to codevos.ai using the tunnel library's client
   - Authenticates with stored API key
   - Incoming HTTP/WS requests from codevos.ai are reverse-proxied to localhost:4100
   - The tunnel library handles multiplexing, WebSocket upgrades, SSE, and streaming transparently

3. **Automatic Reconnection**
   - Exponential backoff with jitter (1s → 60s cap) for transient failures
   - Circuit breaker for auth failures (stop retrying, log clear error)
   - No re-registration required for transient failures

4. **Deregistration CLI**
   - `af tower deregister` removes the tower from codevos.ai and deletes local credentials

5. **Status Visibility**
   - Tower reports its project list and active terminals to codevos.ai over the tunnel connection

6. **Removal of cloudflared Integration**
   - Remove `startTunnel()`, `stopTunnel()`, `isCloudflaredInstalled()` from tower-server
   - Remove cloudflared child process management and QR code generation
   - Remove `af web keygen` (API keys are now managed by codevos.ai)

## Stakeholders
- **Primary Users**: Developers using Codev who want remote tower access
- **Secondary Users**: Mobile users accessing dashboards on the go
- **Technical Team**: Codev development team

## Success Criteria
- [ ] `af tower register` successfully registers a tower with codevos.ai
- [ ] Tower automatically connects to codevos.ai on startup (when registered)
- [ ] HTTP requests proxied through the tunnel reach localhost:4100 and return correct responses
- [ ] WebSocket connections (xterm.js terminals) work through the tunnel
- [ ] Tower reconnects automatically after network disruption or machine sleep/wake
- [ ] Tower stops retrying on authentication failures (circuit breaker)
- [ ] `af tower deregister` removes registration and stops connection attempts
- [ ] cloudflared integration code is removed from tower-server
- [ ] Tower operates normally without registration (local-only mode)
- [ ] All existing tests pass; new tests cover tunnel client behavior
- [ ] Documentation updated

## Constraints

### Technical Constraints
- Tower server is a single Node.js process (Spec 0090) — tunnel client must not block the event loop
- Must work behind NAT, corporate firewalls, and proxies (outbound HTTPS only)
- `~/.agent-farm/cloud-config.json` permissions must be owner-only (0600)
- **SSRF Prevention**: Tunnel client ONLY proxies to `localhost:4100`. Target host/port is hardcoded, never derived from incoming tunnel messages.

### Business Constraints
- Tower must remain fully functional without registration (local-only mode is the default)
- No breaking changes to existing `af` CLI commands
- cloudflared support removed entirely (not deprecated)

## Assumptions
- codevos.ai tunnel server is operational
- The tunnel library (pipenet, punchmole, or similar) handles HTTP, WebSocket, and SSE proxying
- Users have internet access for the tunnel (offline use remains local-only)

## Solution Approach

### Tunnel Client

The tunnel client uses an off-the-shelf library (same as codevos.ai server side). The library handles:
- Connection management (persistent outbound connection to codevos.ai)
- Request/response proxying (HTTP, WebSocket, SSE, streaming)
- Multiplexing (multiple concurrent requests over one connection)
- Backpressure (prevents OOM when fast producer overwhelms slow consumer)

The tower's responsibility is:
- Reading credentials from `cloud-config.json` and passing them to the library
- Pointing the tunnel's proxy target at `localhost:4100`
- Reconnection logic (exponential backoff, circuit breaker)
- Sending metadata (project list, terminal list) after connection

### Reconnection Strategy

**Transient failures** (network timeout, connection reset, server 503):
- Exponential backoff with jitter: 1s, 2s, 4s, 8s... capped at 60s
- After 10 consecutive failures, reduce to every 5 minutes
- Retry indefinitely until connection succeeds or tower is stopped

**Authentication failures** (invalid/revoked key):
- **Circuit breaker**: Stop retrying immediately
- Log: `"Cloud connection failed: API key is invalid or revoked. Run 'af tower register --reauth' to update credentials."`
- Do NOT retry until config file changes or tower is restarted

**Rate limited**:
- Wait 60 seconds, then retry
- If rate limited again, back off to 5-minute intervals

### CLI Commands

**`af tower register`**
- Starts a local ephemeral HTTP server on a random port for the callback
- Opens browser to `https://codevos.ai/towers/register?callback=http://localhost:<port>/callback`
- If callback received within 2 minutes → proceed automatically
- If callback fails (headless env, firewall) → prompt: `"Paste registration token from browser:"`
- Exchanges token for API key and tower ID via codevos.ai API
- Stores in `~/.agent-farm/cloud-config.json` (0600 permissions):
  ```
  {
    "tower_id": "uuid",
    "machine_id": "uuid",
    "api_key": "ctk_...",
    "server_url": "wss://codevos.ai"
  }
  ```
- If tower daemon is running, signals it to connect via `POST localhost:4100/api/tunnel/connect`
- If already registered, prompts: `"This tower is already registered as '<name>'. Re-register? (y/N)"`

**`af tower register --reauth`**
- For when the API key has been rotated from the dashboard
- Opens browser to codevos.ai reauth flow
- Updates `cloud-config.json` with new API key (preserves tower_id and machine_id)
- Signals running tower daemon to reconnect

**`af tower deregister`**
- Prompts for confirmation
- Calls codevos.ai API to deregister
- Deletes `cloud-config.json`
- Signals running daemon to disconnect via `POST localhost:4100/api/tunnel/disconnect`

**`af tower status`**
- Shows registration and connection status:
  ```
  Cloud Registration: registered
  Tower Name:        my-macbook
  Tower ID:          a1b2c3d4-...
  Connection:        connected (uptime: 2h 15m)
  Access URL:        https://codevos.ai/t/a1b2c3d4-.../
  ```
- If not registered: `"Cloud Registration: not registered. Run 'af tower register' to connect to codevos.ai."`

### Signaling the Running Daemon

CLI commands communicate with the running tower via existing localhost HTTP API:
- `POST /api/tunnel/connect` — initiate/retry tunnel connection
- `POST /api/tunnel/disconnect` — close tunnel connection
- `GET /api/tunnel/status` — return tunnel state

These are localhost-only endpoints, not proxied through the tunnel.

### Graceful Degradation

- **Not registered** (no `cloud-config.json`): Local-only mode. No tunnel. All local functionality works.
- **Config corrupted/invalid**: Log warning, local-only mode. Fix with `af tower register`.
- **Partial config** (missing fields): Log warning, local-only mode.
- **Registered but offline**: Retry with backoff. Local functionality unaffected.
- **Connected**: Serves both local and remote requests.
- **API key revoked**: Circuit breaker stops retries. Clear error log. User runs `--reauth`.
- **Multiple OS users on same machine**: Each user has their own `~/.agent-farm/cloud-config.json`. No interference.

## Performance Requirements
- **Tunnel overhead**: <100ms added latency per proxied request
- **Connection startup**: <5s from tower start to tunnel online
- **Reconnection**: <10s after transient failure
- **Memory**: <50MB additional for tunnel client
- **CPU**: Negligible impact on tower's primary function

## Security Considerations
- **API Key Storage**: `cloud-config.json` with 0600 permissions. Keys masked in logs (show last 4 chars only).
- **Transport Security**: All tunnel traffic over TLS. Tower validates server certificate.
- **SSRF Prevention**: Proxy target hardcoded to `localhost:4100`. Never derived from tunnel messages.
- **Local Auth Unchanged**: localhost:4100 remains unauthenticated (same as current). Auth handled by codevos.ai.
- **Tunnel Isolation**: No new listening ports opened. Tower only accepts proxied requests from its authenticated tunnel connection.
- **Compromised Config**: Attacker with `cloud-config.json` can impersonate the tower (not the user's account). Mitigation: file permissions, key revocation from dashboard.

## Test Scenarios

### Unit Tests
- Config file parsing: valid, missing fields, corrupted JSON, missing file
- Reconnection backoff calculation: exponential, jitter, cap
- Circuit breaker state transitions: closed → open on auth fail, reset on config change

### Integration Tests (with mock tunnel server)
- Full auth handshake → tunnel live
- HTTP GET/POST proxied correctly
- WebSocket (terminal) bidirectional through tunnel
- Streaming response (SSE, chunked) flows correctly
- Tower reconnects after simulated disconnect
- Auth failure triggers circuit breaker
- `af tower register/deregister/status` CLI flows

### Negative / Edge Case Tests
- Malformed messages from server (drop, log, no crash)
- Connection close mid-request (clean up gracefully)
- Expired registration token → clear error
- Already registered → confirmation prompt
- Config deleted while running → local-only mode on next reconnect
- Config with missing fields → local-only mode with warning

### Non-Functional Tests
- Tunnel latency p50/p95/p99
- Terminal keystroke-to-echo overhead (<50ms p95)
- 50 concurrent proxied connections without degradation
- Memory within bounds under sustained traffic
- Long-lived connection stability (24h, no leaks)

### Test Infrastructure
- **Mock tunnel server**: Lightweight server for integration tests. Does not require real codevos.ai.
- **Network simulation**: Use network link conditioner to test degraded conditions.

## Dependencies
- **External Services**: codevos.ai (tunnel server)
- **Internal Systems**: Tower server (Spec 0090), `af` CLI
- **Libraries**: Tunnel client library (same as codevos.ai server — pipenet, punchmole, or similar)

## References
- Companion spec (server side): `codevos.ai/codev/specs/0001-cloud-tower-registration.md`
- Tower server: `packages/codev/src/agent-farm/servers/tower-server.ts`
- Current cloudflared integration: `tower-server.ts` lines 759-832
- Spec 0090: Tower Single Daemon
- Spec 0062: Secure Remote Access (superseded by this spec)

## Risks and Mitigation

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Tunnel library doesn't meet our needs | Medium | High | Evaluate pipenet + punchmole during planning; fall back to the other |
| Terminal latency through tunnel | Low | High | Profile early; binary data frames minimize overhead |
| codevos.ai outage blocks remote access | Low | Medium | Tower works locally regardless |
| Config permission issues across OSes | Low | Medium | Test on macOS and Linux |
| Reconnection storms after server restart | Medium | Medium | Exponential backoff + jitter; 5-min fallback after 10 failures |

## Notes

**What gets removed:**
- `startTunnel()`, `stopTunnel()`, `isCloudflaredInstalled()`, `getTunnelStatus()`
- cloudflared child process management
- QR code generation
- `af web keygen` command
- `tunnel-setup.md` documentation

**What gets added:**
- Tunnel client (thin wrapper around library — connection, auth, reconnection)
- `af tower register` / `register --reauth` / `deregister` / `status` CLI commands
- Tower HTTP endpoints: `/api/tunnel/connect`, `/api/tunnel/disconnect`, `/api/tunnel/status`
- `cloud-config.json` management with validation
- Mock tunnel server for tests

---

## Amendments

This section tracks all TICK amendments to this specification.

<!-- When adding a TICK amendment, add a new entry below this line in chronological order -->
