# Specification: ASPIR Protocol — Autonomous SPIR

## Metadata
- **ID**: spec-438-aspir-protocol
- **Status**: draft
- **Created**: 2026-02-18

## Clarifying Questions Asked

The architect provided clear direction in the issue and spawn message:

1. **Q: What exactly should differ from SPIR?** A: Only the `spec-approval` and `plan-approval` gates are removed (auto-approved). Everything else — phases, consultations, checks, PR flow — remains identical.
2. **Q: Should the PR gate also be removed?** A: No. The PR gate stays. Only spec-approval and plan-approval are removed.
3. **Q: Is this a new protocol directory or a configuration flag on SPIR?** A: New protocol directory. ASPIR is a standalone protocol that copies the full SPIR structure.

## Problem Statement

SPIR has two human approval gates — `spec-approval` (after the Specify phase) and `plan-approval` (after the Plan phase). These gates require a human to explicitly run `porch approve` before the builder can proceed to the next phase.

For trusted or low-risk work, these gates add latency without proportional value. The builder must stop, notify the architect, and wait — sometimes for hours — before resuming. This is especially costly for:

- Well-understood features with clear specs pre-written by the architect
- Internal tooling improvements with low blast radius
- Protocol/template additions where the scope is self-contained
- Work where the architect trusts the builder to proceed autonomously

There is no way to run SPIR without these gates today. Builders must either use SPIR with mandatory gates or use a different protocol (TICK, BUGFIX) that lacks SPIR's full discipline (consultations, phased implementation, review).

## Current State

- **SPIR** provides full discipline (Specify → Plan → Implement → Review) with 3-way consultations at every phase, but requires human approval at two gates before the builder can proceed
- **TICK** is lightweight (amend existing specs) but cannot be used for greenfield work
- **BUGFIX** is minimal (investigate → fix → PR) with no consultations
- **EXPERIMENT** is for research spikes, not feature implementation
- There is no protocol that combines SPIR's full discipline with autonomous execution

## Desired State

A new protocol called **ASPIR** (Autonomous SPIR) that:

1. Follows the exact same phases as SPIR: Specify → Plan → Implement → Review
2. Runs the same 3-way consultations (Gemini, Codex, Claude) at every phase
3. Enforces the same checks (build, tests, PR exists, review sections)
4. Uses the same prompts, templates, and consult-types
5. **Removes** the `spec-approval` and `plan-approval` gates, allowing the builder to proceed automatically after the verify step
6. **Keeps** the `pr` gate — the PR still requires human review before merge
7. Is invocable via `af spawn N --protocol aspir`

## Stakeholders
- **Primary Users**: Architects spawning builders for trusted work
- **Secondary Users**: Builders executing the protocol
- **Technical Team**: Codev maintainers (this project)

## Success Criteria

- [ ] `af spawn N --protocol aspir` spawns a builder that follows the ASPIR protocol
- [ ] Builder proceeds from Specify → Plan without stopping at a `spec-approval` gate
- [ ] Builder proceeds from Plan → Implement without stopping at a `plan-approval` gate
- [ ] Builder still stops at the `pr` gate after the Review phase
- [ ] All 3-way consultations still run at every phase (spec, plan, impl, pr)
- [ ] All checks still run (build, tests, PR exists, review sections)
- [ ] Protocol appears in `codev/protocols/aspir/` directory
- [ ] ASPIR documented in CLAUDE.md/AGENTS.md protocol selection guide
- [ ] No changes to SPIR protocol files (ASPIR is additive only)
- [ ] No changes to porch source code (protocol definition drives behavior)

## Constraints

### Technical Constraints
- Porch discovers protocols by filesystem: `codev/protocols/{name}/protocol.json` — no code changes needed
- The `gate` property on a phase is what creates a human approval gate. Removing the property means the phase auto-transitions to the next phase after verification
- Both `codev-skeleton/protocols/` (template for other projects) and `codev/protocols/` (our instance) must be updated
- ASPIR must use the same `protocol-schema.json` as SPIR (no schema changes)

### Design Constraints
- ASPIR must be a complete copy, not a "mode" or flag on SPIR. This keeps protocols self-contained and avoids conditional logic in protocol definitions
- Prompt files, consult-type files, and template files should be identical to SPIR's. They can either be copied or symlinked (copy is simpler and avoids cross-platform symlink issues)
- The `pr` gate must be preserved — autonomous spec/plan does not mean autonomous merge

## Assumptions
- Porch correctly auto-transitions phases when no `gate` property is present (this is the existing behavior for phases without gates, e.g., `implement` → `review`)
- The `consult` CLI and consultation models remain available
- The protocol directory structure and discovery mechanism remain unchanged

## Solution Approaches

### Approach 1: Full Copy with Gate Removal (Recommended)
**Description**: Copy the entire SPIR directory to `aspir/`, then modify only `protocol.json` (remove the two gates) and `protocol.md` (update documentation). All other files (prompts, templates, consult-types, builder-prompt) are identical copies.

**Pros**:
- Self-contained — no dependencies between protocol directories
- Easy to understand — each protocol is a complete unit
- Can evolve independently if ASPIR needs future customization
- Follows the pattern of existing protocols (TICK, BUGFIX, etc.)

**Cons**:
- File duplication between SPIR and ASPIR
- Changes to SPIR prompts/templates must be manually propagated to ASPIR

**Estimated Complexity**: Low
**Risk Level**: Low

### Approach 2: Symlinks to SPIR Files
**Description**: Create the `aspir/` directory with its own `protocol.json` and `protocol.md`, but symlink `prompts/`, `templates/`, and `consult-types/` to SPIR's copies.

**Pros**:
- No file duplication
- Changes to SPIR prompts auto-propagate

**Cons**:
- Symlinks can break on Windows or in git operations
- Less transparent — "where does this file come from?"
- Harder to evolve independently
- No existing protocol uses symlinks (breaks convention)

**Estimated Complexity**: Low
**Risk Level**: Medium (cross-platform concerns)

### Approach 3: Protocol Inheritance / `extends` Field
**Description**: Add an `extends` field to `protocol-schema.json` that lets ASPIR say `"extends": "spir"` and only override the gate fields.

**Pros**:
- Minimal duplication
- Elegant conceptually

**Cons**:
- Requires porch source code changes to support inheritance
- Adds complexity to protocol loading
- Over-engineered for a single use case
- Violates the "no code changes" constraint

**Estimated Complexity**: High
**Risk Level**: High (porch changes, schema changes)

**Recommended**: Approach 1 (Full Copy). The duplication is manageable (the files are small) and avoids all risk.

## Open Questions

### Critical (Blocks Progress)
- None. The architect's direction is clear.

### Important (Affects Design)
- [x] Should ASPIR have a different `alias` field? → No alias needed; `aspir` is already short
- [x] Should the `version` start at `1.0.0` or match SPIR's `2.2.0`? → `1.0.0` (new protocol, own versioning)

### Nice-to-Know (Optimization)
- [ ] Should we add a `MAINTAIN` task to keep ASPIR prompts in sync with SPIR? → Out of scope for this spec; can be addressed later

## Performance Requirements
- Not applicable. This is a protocol definition, not runtime code.

## Security Considerations
- ASPIR removes human gates, so it should only be used for trusted work. This is a usage guideline, not a technical enforcement — the architect decides which protocol to use when spawning.
- The `pr` gate remains, ensuring a human reviews all code before merge.

## Test Scenarios

### Functional Tests
1. **Happy path**: `af spawn N --protocol aspir` succeeds and builder runs through Specify → Plan → Implement → Review without stopping at spec-approval or plan-approval gates
2. **PR gate preserved**: Builder stops at the `pr` gate after Review phase and waits for human approval
3. **Consultations run**: All four 3-way consultations (spec, plan, impl, pr) execute during the protocol
4. **Checks enforced**: Build checks, test checks, and PR existence checks all run
5. **Protocol discovery**: `porch status` shows "aspir" as the protocol name

### Non-Functional Tests
1. **No SPIR regression**: SPIR protocol continues to work with all gates intact
2. **Schema validation**: ASPIR `protocol.json` passes validation against `protocol-schema.json`

## Dependencies
- **SPIR protocol**: Source material for ASPIR (copy, not modify)
- **Porch**: Must already support gateless phase transitions (it does — `implement` has no gate)
- **Protocol schema**: Must support omitted `gate` field (it does — `gate` is optional in schema)

## Risks and Mitigation
| Risk | Probability | Impact | Mitigation Strategy |
|------|------------|--------|-------------------|
| ASPIR prompts drift from SPIR over time | Medium | Low | Document in review; consider MAINTAIN task |
| Architect uses ASPIR for high-risk work inappropriately | Low | Medium | Document usage guidelines clearly in protocol.md |
| Porch has undocumented behavior requiring gates | Low | High | Test thoroughly; the `implement` phase already has no gate |

## Notes

- ASPIR is intentionally a "dumb copy" with minimal changes. The value is in providing the right default (no gates) for trusted work, not in adding new capabilities.
- The name "ASPIR" follows the convention of prefixing with "A" for "Autonomous" — it's memorable and clearly signals the difference from SPIR.
- Future work could add a `--autonomous` flag to `af spawn` that selects ASPIR automatically, but that is out of scope for this spec.
