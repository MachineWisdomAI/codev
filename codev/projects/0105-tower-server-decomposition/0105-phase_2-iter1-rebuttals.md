# Phase 2 Iteration 1 Rebuttals

## Addressed: Startup race on POST /api/tunnel/connect (Codex)

Fixed in iteration 2. Added a `_deps` null guard in `handleTunnelEndpoint` POST connect path that returns 503 "Tower is still starting up" instead of letting `connectTunnel()` throw and produce an unhandled 500. Added test covering this case.

Note: In the original code this was a non-issue because `connectTunnel()` accessed module-scope state that was always initialized. The 503 response is more informative than the original behavior (which would have connected with empty metadata before startup was complete).

## Addressed: Missing config-watcher debounce test (Codex)

Fixed in iteration 2. Added 4 tests covering config watcher behavior:
- Starts watching config directory on `initTunnel`
- Stops watcher on `shutdownTunnel`
- Debounces rapid config changes via setTimeout (3 rapid events → 1 reconnection)
- Ignores events for non-config files

## Disputed: Out-of-scope changes (Claude)

Claude noted `waitForReplay()` → `getReplayData()` changes and the `pty-session.test.ts` assertion fix as out-of-scope behavioral changes. These are **pre-existing on the branch** — they come from Spec 0104 (Custom Session Manager) which was merged to main before this builder was spawned. Already explained in Phase 1 rebuttals.

## Disputed: TowerContext.tunnelClient field unused (Claude)

Claude noted that `TowerContext.tunnelClient` is defined but never populated since the tunnel module uses `TunnelDeps` instead. This is intentional — the field will be revisited in Phase 6 (route extraction) when TowerContext becomes the actual shared context. For now it exists as a type-level placeholder. No action needed.
