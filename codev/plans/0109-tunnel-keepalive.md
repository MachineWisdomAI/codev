# Plan: Tunnel Keepalive (Heartbeat & Dead Connection Detection)

## Metadata
- **Specification**: codev/specs/0109-tunnel-keepalive.md
- **Created**: 2026-02-14

## Executive Summary

Add WebSocket ping/pong heartbeat to `TunnelClient` to detect silently dead connections and trigger reconnection. The implementation is entirely client-side in `tunnel-client.ts` — three new private properties, two new private methods (`startHeartbeat`, `stopHeartbeat`), and three integration callsites in existing methods.

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
- Constants `PING_INTERVAL_MS` (30000) and `PONG_TIMEOUT_MS` (10000)
- Three new private properties: `pingInterval`, `pongTimeout`, `pongReceived`
- `startHeartbeat(ws)` method with ping interval, pong timeout, and pong listener
- `stopHeartbeat()` method to clear timers
- Integration into `startH2Server()`, `cleanup()`, and `disconnect()`

#### Implementation Details

**File**: `packages/codev/src/agent-farm/lib/tunnel-client.ts`

1. **Add constants** at module level (near existing constants):
   ```typescript
   const PING_INTERVAL_MS = 30_000;
   const PONG_TIMEOUT_MS = 10_000;
   ```

2. **Add private properties** to TunnelClient class (alongside existing properties):
   ```typescript
   private pingInterval: ReturnType<typeof setInterval> | null = null;
   private pongTimeout: ReturnType<typeof setTimeout> | null = null;
   private pongReceived = false;
   ```

3. **Add `startHeartbeat(ws)` method** — implements the ping/pong cycle as specified:
   - Calls `stopHeartbeat()` first (idempotent start)
   - Sets interval to send `ws.ping()` every `PING_INTERVAL_MS`
   - Checks `ws.readyState` before pinging
   - Wraps `ws.ping()` in try/catch
   - Sets pong timeout after each ping — if no pong received and `ws === this.ws`, calls `cleanup()`, sets state to `disconnected`, increments `consecutiveFailures`, and calls `scheduleReconnect()`
   - Registers `ws.on('pong')` listener to set `pongReceived = true` and clear timeout

4. **Add `stopHeartbeat()` method** — clears both timers.

5. **Integration callsites**:
   - In `startH2Server()`: call `this.startHeartbeat(ws)` after `this.setState('connected')`
   - In `cleanup()`: call `this.stopHeartbeat()` at the beginning
   - In `disconnect()`: call `this.stopHeartbeat()` before `this.cleanup()`

#### Acceptance Criteria
- Pings are sent every 30s while connected
- Pong timeout (10s) triggers reconnection
- Heartbeat timers cleaned up on disconnect/cleanup
- `startHeartbeat()` is idempotent
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
- New test file or test section covering all 9 unit test scenarios from the spec

#### Implementation Details

**File**: `packages/codev/tests/unit/tunnel-client.test.ts` (add new describe block)

Tests to add (from spec acceptance criteria #10):

1. **Ping sent at interval**: Verify `ws.ping()` is called after `PING_INTERVAL_MS`
2. **Pong received clears timeout**: Simulate pong, verify timeout is cleared, no reconnect
3. **Pong timeout triggers reconnect**: Simulate no pong, verify `disconnected` state and reconnect scheduled
4. **Cleanup stops timers**: Call `cleanup()`, verify heartbeat timers cleared
5. **Disconnect stops timers**: Call `disconnect()`, verify heartbeat timers cleared
6. **Stale WebSocket guard**: Pong timeout from old WS instance does not trigger reconnect on new connection
7. **Duplicate startHeartbeat calls**: Call twice, verify no duplicate timers
8. **ws.ping() throws**: Mock ping to throw, verify no crash, timeout handles detection
9. **Concurrent close + timeout**: Both fire, verify only one reconnect

Test approach:
- Use Vitest fake timers (`vi.useFakeTimers()`) to control time progression
- Create mock WebSocket with `ping()`, `on()`, `readyState`, and event emission
- Test the TunnelClient heartbeat methods by accessing them through the connection lifecycle
- Export constants `PING_INTERVAL_MS` and `PONG_TIMEOUT_MS` for test use

#### Acceptance Criteria
- All 9 test scenarios pass
- Tests use fake timers (no real delays)
- Tests are deterministic and isolated

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
| `ws` library version doesn't support `ping()`/`pong` events | Very Low | High | `ws` has supported ping/pong since v1.0; verify in package.json |

## Validation Checkpoints
1. **After Phase 1**: Build succeeds, existing tests pass, manual verification that heartbeat starts on connection
2. **After Phase 2**: All new tests pass, full test suite green
