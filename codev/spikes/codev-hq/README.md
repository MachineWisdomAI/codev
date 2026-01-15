# Spike: CODEV_HQ Minimal Implementation

**Goal**: Build a minimal working implementation of the CODEV_HQ architecture from Spec 0068 to validate the core concepts.

**Time-box**: 4-6 hours
**Status**: IN PROGRESS
**Started**: 2026-01-16

## Hypothesis

A minimal CODEV_HQ implementation can demonstrate:
1. WebSocket connection between local Agent Farm and cloud HQ
2. Status file sync (local → HQ)
3. Mobile-friendly dashboard showing project status
4. Human approval gates triggered from HQ → local

## Scope (Minimal Viable HQ)

### In Scope
- Simple WebSocket server (Node.js)
- Basic authentication (API key)
- Status file sync protocol
- Minimal React dashboard
- Approval flow (HQ → Local)

### Out of Scope (for spike)
- Multi-tenant auth (Clerk/Auth0)
- PostgreSQL persistence (use in-memory)
- Production deployment
- Terminal streaming
- Full mobile PWA

## Architecture (Spike Version)

```
┌─────────────────────────────────────────┐
│         CODEV_HQ (Minimal)               │
│         localhost:4300                   │
│  ┌──────────────┐  ┌─────────────────┐  │
│  │  WebSocket   │  │  React Dashboard │  │
│  │   Server     │  │  (Vite dev)      │  │
│  └──────┬───────┘  └────────┬────────┘  │
│         │                    │           │
│         └────────┬───────────┘           │
│                  │                       │
│           In-Memory State                │
└──────────────────┼───────────────────────┘
                   │
            WebSocket (ws://)
                   │
┌──────────────────┴───────────────────────┐
│        Agent Farm (Existing)              │
│        localhost:4200                     │
│  ┌─────────────────────────────────────┐ │
│  │  HQ Connector (NEW)                  │ │
│  │  - Connect to HQ on startup          │ │
│  │  - Sync status files                 │ │
│  │  - Receive approvals                 │ │
│  └─────────────────────────────────────┘ │
└──────────────────────────────────────────┘
```

## Implementation Plan

### Phase 1: WebSocket Server (2h)
1. Create `packages/codev-hq/` directory
2. Set up Express + ws server
3. Implement message envelope (from spec)
4. Handle `register`, `ping/pong`, `status_update`
5. In-memory store for connected instances

### Phase 2: HQ Connector for Agent Farm (1.5h)
1. Add `hq-connector.ts` to agent-farm package
2. Connect on `af start` if `CODEV_HQ_URL` set
3. Send `register` with project list
4. Watch status files, send `status_update` on change
5. Handle `approval` messages, update status files

### Phase 3: Minimal Dashboard (1.5h)
1. Create `packages/codev-hq/dashboard/` (Vite + React)
2. Show connected instances
3. Show projects and status
4. "Approve" button for pending gates

### Phase 4: Integration Test (1h)
1. Start HQ server
2. Start Agent Farm with `CODEV_HQ_URL`
3. Verify registration
4. Create status file, verify sync
5. Click approve, verify local file updated

## Message Protocol (From Spec 0068)

### Local → HQ
```typescript
// Register on connect
{ type: "register", payload: { instance_id, projects } }

// Status file changed
{ type: "status_update", payload: { project_path, status_file, content } }

// Gate completed locally
{ type: "gate_completed", payload: { project_id, gate } }
```

### HQ → Local
```typescript
// Human approved a gate
{ type: "approval", payload: { project_id, gate, approved_by } }
```

## File Structure

```
packages/
├── codev-hq/                    # NEW
│   ├── src/
│   │   ├── server.ts           # Express + WebSocket
│   │   ├── state.ts            # In-memory state
│   │   └── handlers.ts         # Message handlers
│   ├── dashboard/
│   │   ├── src/
│   │   │   ├── App.tsx
│   │   │   └── main.tsx
│   │   └── vite.config.ts
│   └── package.json
│
├── codev/                       # MODIFY
│   └── src/
│       └── hq-connector.ts     # NEW - connects to HQ
```

## Success Criteria

1. **PASS**: Agent Farm connects to HQ on startup
2. **PASS**: Status files sync to HQ within 1s of change
3. **PASS**: Dashboard shows project status in real-time
4. **PASS**: Clicking "Approve" updates local status file
5. **PASS**: Local git commit created for approval

## Testing Commands

```bash
# Start HQ server
cd packages/codev-hq && npm run dev

# In another terminal - start Agent Farm with HQ
export CODEV_HQ_URL="ws://localhost:4300/ws"
af start

# Open HQ dashboard
open http://localhost:4300

# Create a test status file
mkdir -p codev/status
cat > codev/status/test-project.md << 'EOF'
---
id: "test"
protocol: SPIDER
current_phase: specify
gates:
  specify_to_plan:
    human_approval: { status: pending }
---
## Log
- Started
EOF

# Watch for approval in HQ dashboard
# Click approve
# Verify local file updated
```

## Notes

- Start with ws:// not wss:// for spike simplicity
- Skip auth complexity - single hardcoded API key
- Use Vite's built-in HMR for dashboard development
- Keep state in-memory, restart loses everything (fine for spike)

## References

- [Spec 0068: Codev 2.0](../../specs/0068-codev-2.0.md) - Full HQ protocol
- [ws npm package](https://www.npmjs.com/package/ws) - WebSocket server
