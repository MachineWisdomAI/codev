# Specification: CODEV_HQ Minimal Implementation Spike

## Metadata
- **ID**: 0070
- **Status**: conceived
- **Created**: 2026-01-16
- **Protocol**: SPIKE (time-boxed exploration)
- **Time-box**: 4-6 hours

## Executive Summary

Build a minimal working implementation of the CODEV_HQ architecture from Spec 0068 to validate the core concepts: WebSocket connection, status file sync, and remote approval gates.

## Problem Statement

Spec 0068 describes a cloud control plane (CODEV_HQ) for multi-device access to Agent Farm. Before committing to the full implementation, we need to validate the core architecture works.

## Goal

Create a minimal HQ that demonstrates:
1. WebSocket connection between local Agent Farm and HQ server
2. Status file sync (local → HQ)
3. Simple dashboard showing connected instances and project status
4. Human approval flow (click in HQ → updates local status file)

## Detailed Design

See spike README: `codev/spikes/codev-hq/README.md`

### Architecture (Spike Version)

```
CODEV_HQ (localhost:4300)
├── WebSocket Server (Express + ws)
├── React Dashboard (Vite)
└── In-Memory State

        ↕ WebSocket

Agent Farm (localhost:4200)
└── HQ Connector (NEW)
    ├── Connect on startup
    ├── Sync status files
    └── Handle approvals
```

### Key Components

1. **HQ Server** (`packages/codev-hq/`)
   - Express + ws WebSocket server
   - In-memory state (no database for spike)
   - React dashboard with Vite

2. **HQ Connector** (`packages/codev/src/hq-connector.ts`)
   - Connect to HQ if `CODEV_HQ_URL` env var set
   - Watch status files, sync on change
   - Receive approvals, update local files

### Message Protocol

From Spec 0068:
- `register` - Initial connection with project list
- `status_update` - Status file changed locally
- `approval` - Human approved gate in HQ

## Success Criteria

1. Agent Farm connects to HQ on startup
2. Status files sync to HQ within 1s of change
3. Dashboard shows project status in real-time
4. Clicking "Approve" updates local status file
5. Local git commit created for approval

## Out of Scope (for spike)

- Multi-tenant auth (Clerk/Auth0)
- PostgreSQL persistence
- Production deployment
- Terminal streaming
- Full mobile PWA
- TLS/wss://

## References

- Spike README: `codev/spikes/codev-hq/README.md`
- Full HQ Spec: `codev/specs/0068-codev-2.0.md`
