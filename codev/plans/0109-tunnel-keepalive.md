# Plan: Tunnel Keepalive (Heartbeat & Dead Connection Detection)

## Metadata
- **Specification**: codev/specs/0109-tunnel-keepalive.md
- **Created**: 2026-02-14

## Executive Summary

Add WebSocket ping/pong heartbeat to `TunnelClient` to detect silently dead connections and trigger reconnection. The implementation is entirely client-side in `tunnel-client.ts` — four new private properties, two new private methods (`startHeartbeat`, `stopHeartbeat`), and three integration callsites in existing methods.

## Phases (Machine Readable)

```json
{
  "phases": [
    {"id": "phase_1", "title": "Heartbeat implementation and lifecycle integration"},
    {"id": "phase_2", "title": "Unit tests for heartbeat logic"}
  ]
}
```

## Phase Breakdown

### Phase 1: Heartbeat implementation and lifecycle integration
**Dependencies**: None

#### Objectives
- Add ping/pong heartbeat mechanism to TunnelClient
- Integrate heartbeat into existing connection lifecycle

#### Deliverables
- Exported constants `PING_INTERVAL_MS` (30000) and `PONG_TIMEOUT_MS` (10000)
- Four new private properties: `pingInterval`, `pongTimeout`, `pongReceived`, `heartbeatWs` (tracks ws to prevent duplicate listeners)
- `startHeartbeat(ws)` method with ping interval, pong timeout, pong listener, and listener idempotency
- `stopHeartbeat()` method to clear timers
- Integration into `startH2Server()`, `cleanup()`, and `disconnect()`

#### Implementation Details

**File**: `packages/codev/src/agent-farm/lib/tunnel-client.ts`

1. **Add exported constants** at module level (near existing constants):
   ```typescript
   export const PING_INTERVAL_MS = 30_000;
   export const PONG_TIMEOUT_MS = 10_000;
   ```

2. **Add private properties** to TunnelClient class (alongside existing properties):
   ```typescript
   private pingInterval: ReturnType<typeof setInterval> | null = null;
   private pongTimeout: ReturnType<typeof setTimeout> | null = null;
   private pongReceived = false;
   private heartbeatWs: WebSocket | null = null;
   ```

3. **Add `startHeartbeat(ws)` method** — implements the ping/pong cycle as specified:
   - Calls `stopHeartbeat()` first (idempotent start — clears timers AND removes pong listener from previous ws)
   - Stores `this.heartbeatWs = ws` for listener cleanup tracking
   - Sets interval to send `ws.ping()` every `PING_INTERVAL_MS`
   - Checks `ws.readyState` before pinging
   - Wraps `ws.ping()` in try/catch (error → skip that cycle, pong timeout handles detection)
   - Sets pong timeout after each ping — if no pong received and `ws === this.ws`, calls `cleanup()`, sets state to `disconnected`, increments `consecutiveFailures`, and calls `scheduleReconnect()`
   - Registers `ws.on('pong')` listener to set `pongReceived = true` and clear timeout
   - **Logging**: Uses `console.warn('Tunnel heartbeat: pong timeout, reconnecting')` on timeout (matching existing `console.error` pattern in the file — no logger module exists)
   - **Silent success**: Normal pong receipt generates no log output

4. **Add `stopHeartbeat()` method** — clears both timers AND removes pong listener from `this.heartbeatWs` (via `ws.removeAllListeners('pong')`), then nulls `this.heartbeatWs`.

5. **Integration callsites**:
   - In `startH2Server()`: call `this.startHeartbeat(ws)` after `this.setState('connected')` (line ~405, inside `h2Server.on('session')` callback)
   - In `cleanup()`: call `this.stopHeartbeat()` at the beginning (line ~275)
   - In `disconnect()`: call `this.stopHeartbeat()` before `this.cleanup()` (line ~186, belt-and-suspenders)

#### Acceptance Criteria
- Pings are sent every 30s while connected
- Pong timeout (10s) triggers reconnection with `console.warn` log
- Normal pong receipt is silent (no log noise)
- Heartbeat timers AND listeners cleaned up on disconnect/cleanup
- `startHeartbeat()` is idempotent — no duplicate timers or listeners on repeated calls
- Stale WebSocket guard prevents cross-connection interference
- `ws.ping()` errors are caught

#### Rollback Strategy
Revert the single commit. No database, config, or API changes.

---

### Phase 2: Unit tests for heartbeat logic
**Dependencies**: Phase 1

#### Objectives
- Add comprehensive unit tests covering all heartbeat behavior and edge cases

#### Deliverables
- New `describe('heartbeat')` block in the existing test file covering all 9 unit test scenarios from the spec

#### Implementation Details

**File**: `packages/codev/src/agent-farm/__tests__/tunnel-client.test.ts` (add new `describe` block to existing test file)

Tests to add (from spec acceptance criteria #10):

1. **Ping sent at interval**: Verify `ws.ping()` is called after `PING_INTERVAL_MS`
2. **Pong received clears timeout**: Simulate pong, verify timeout is cleared, no reconnect
3. **Pong timeout triggers reconnect**: Simulate no pong, verify `disconnected` state and reconnect scheduled, verify `console.warn` called with expected message
4. **Cleanup stops timers**: Call `cleanup()`, verify heartbeat timers cleared
5. **Disconnect stops timers**: Call `disconnect()`, verify heartbeat timers cleared
6. **Stale WebSocket guard**: Pong timeout from old WS instance does not trigger reconnect on new connection
7. **Duplicate startHeartbeat calls**: Call twice on same ws, verify no duplicate timers or listeners
8. **ws.ping() throws**: Mock ping to throw, verify no crash, pong timeout handles detection
9. **Concurrent close + timeout**: Both fire, verify only one reconnect
10. **Silent success**: Normal pong does not produce any log output (verify `console.warn` NOT called)

Test approach:
- Use Vitest fake timers (`vi.useFakeTimers()`) to control time progression
- Create mock WebSocket with `ping()`, `on()`, `removeAllListeners()`, `readyState`, and event emission via `EventEmitter`
- Access private methods via `(client as any).startHeartbeat(mockWs)` for direct unit testing
- Import exported constants `PING_INTERVAL_MS` and `PONG_TIMEOUT_MS` from `tunnel-client.ts`

#### Acceptance Criteria
- All 10 test scenarios pass
- Tests use fake timers (no real delays)
- Tests are deterministic and isolated
- Tests verify logging behavior (warn on timeout, silent on success)

#### Rollback Strategy
Revert the commit. Tests have no production side effects.

## Dependency Map
```
Phase 1 ──→ Phase 2
```

## Risk Analysis

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Pong timeout false-positive on slow networks | Low | Medium | 10s timeout is generous; healthy connections respond in <100ms |
| Timer leak on rapid reconnect cycles | Low | Medium | `stopHeartbeat()` called in `cleanup()` before every reconnect; idempotent start |
| Duplicate pong listener accumulation | Low | Medium | `stopHeartbeat()` calls `removeAllListeners('pong')` on tracked ws; `heartbeatWs` property tracks the ws instance |
| `ws` library version doesn't support `ping()`/`pong` events | Very Low | High | `ws` v8.18.0 fully supports ping/pong; confirmed in package.json |

## Validation Checkpoints
1. **After Phase 1**: Build succeeds (`npm run build`), existing tests pass (`npm test`), manual verification that heartbeat starts on connection
2. **After Phase 2**: All new tests pass, full test suite green
