# Plan 0075: Porch Minimal Redesign (Build-Verify Cycles)

## Overview

Redesign porch to orchestrate **build-verify cycles** where porch runs 3-way consultations automatically, feeds back failures to Claude, and manages iteration/commit/push.

## Dependencies

- Existing porch code (run.ts, repl.ts, claude.ts, etc.)
- consult CLI tool
- git for commit/push

## Implementation Phases

```json
{
  "phases": [
    {
      "id": "phase_1",
      "title": "Protocol Format and Types",
      "description": "Update protocol.json format and types for build_verify phases"
    },
    {
      "id": "phase_2",
      "title": "Build-Verify Loop",
      "description": "Implement the core build-verify cycle in run.ts"
    },
    {
      "id": "phase_3",
      "title": "Consultation Integration",
      "description": "Integrate consult CLI, parse verdicts, synthesize feedback"
    },
    {
      "id": "phase_4",
      "title": "Commit and Push",
      "description": "Add automatic commit/push after successful verification"
    }
  ]
}
```

### Phase 1: Protocol Format and Types

**Goal:** Update protocol.json format to express build_verify phases.

**Files to modify:**

| File | Action |
|------|--------|
| `codev/resources/protocol-format.md` | Update: Document build_verify phase type |
| `packages/codev/src/commands/porch/types.ts` | Update: Add build_verify types |
| `packages/codev/src/commands/porch/protocol.ts` | Update: Parse build_verify config |
| `codev-skeleton/protocols/spider/protocol.json` | Update: Convert to build_verify format |

**New types:**

```typescript
interface BuildConfig {
  prompt: string;           // Prompt file (e.g., "specify.md")
  artifact: string;         // Artifact path pattern (e.g., "codev/specs/${PROJECT_ID}-*.md")
}

interface VerifyConfig {
  type: string;             // Review type (e.g., "spec-review")
  models: string[];         // ["gemini", "codex", "claude"]
  parallel: boolean;        // Run consultations in parallel
}

interface PhaseConfig {
  id: string;
  name: string;
  type: 'build_verify' | 'once' | 'per_plan_phase';
  build?: BuildConfig;
  verify?: VerifyConfig;
  max_iterations?: number;  // Default: 3
  on_complete?: {
    commit: boolean;
    push: boolean;
  };
  gate?: string;
}
```

**Updated spider protocol.json structure:**

```json
{
  "phases": [
    {
      "id": "specify",
      "type": "build_verify",
      "build": { "prompt": "specify.md", "artifact": "codev/specs/${PROJECT_ID}-*.md" },
      "verify": { "type": "spec-review", "models": ["gemini", "codex", "claude"] },
      "max_iterations": 3,
      "on_complete": { "commit": true, "push": true },
      "gate": "spec-approval"
    }
  ]
}
```

### Phase 2: Build-Verify Loop

**Goal:** Implement the core build-verify cycle.

**Files to modify:**

| File | Action |
|------|--------|
| `packages/codev/src/commands/porch/run.ts` | Update: Implement build-verify loop |
| `packages/codev/src/commands/porch/state.ts` | Update: Add iteration tracking |
| `packages/codev/src/commands/porch/types.ts` | Update: Add feedback types |

**State additions:**

```typescript
interface ProjectState {
  // ... existing
  iteration: number;           // Current iteration (1-based)
  build_complete: boolean;     // Has build finished this iteration?
  last_feedback: FeedbackSet;  // Feedback from last verify
}

interface FeedbackSet {
  gemini?: { verdict: 'APPROVE' | 'REQUEST_CHANGES'; summary: string };
  codex?: { verdict: 'APPROVE' | 'REQUEST_CHANGES'; summary: string };
  claude?: { verdict: 'APPROVE' | 'REQUEST_CHANGES'; summary: string };
}
```

**Run loop pseudocode:**

```typescript
async function runBuildVerifyCycle(state, phaseConfig) {
  while (state.iteration <= phaseConfig.max_iterations) {
    // BUILD phase
    const prompt = buildPrompt(state, phaseConfig);
    if (state.iteration > 1) {
      prompt = prependFeedback(prompt, state.last_feedback);
    }

    await runClaude(prompt);  // Wait for PHASE_COMPLETE

    // VERIFY phase
    const feedback = await runVerification(phaseConfig.verify);
    state.last_feedback = feedback;

    if (allApprove(feedback)) {
      // Success - commit, push, proceed to gate
      await commitAndPush(phaseConfig);
      return 'gate';
    }

    // Failure - increment and retry
    state.iteration++;
    saveState(state);
  }

  // Max iterations - proceed to gate anyway
  console.log('Max iterations reached, proceeding to gate');
  return 'gate';
}
```

### Phase 3: Consultation Integration

**Goal:** Run consult CLI, parse verdicts, synthesize feedback.

**Files to create/modify:**

| File | Action |
|------|--------|
| `packages/codev/src/commands/porch/verify.ts` | Create: Verification logic |
| `packages/codev/src/commands/porch/feedback.ts` | Create: Feedback synthesis |

**Verification flow:**

```typescript
async function runVerification(verifyConfig, artifact) {
  const results = await Promise.all(
    verifyConfig.models.map(model =>
      runConsult(model, verifyConfig.type, artifact)
    )
  );

  return parseResults(results);
}

async function runConsult(model, type, artifact) {
  const proc = spawn('consult', [
    '--model', model,
    '--type', type,
    'spec',  // or 'plan', 'pr' based on artifact type
    projectId
  ]);

  const output = await captureOutput(proc);
  return { model, output, verdict: parseVerdict(output) };
}

function parseVerdict(output) {
  // Look for APPROVE or REQUEST_CHANGES in output
  if (output.includes('APPROVE')) return 'APPROVE';
  if (output.includes('REQUEST_CHANGES')) return 'REQUEST_CHANGES';
  return 'REQUEST_CHANGES';  // Default to changes needed
}
```

**Feedback synthesis:**

```typescript
function synthesizeFeedback(feedback: FeedbackSet): string {
  let md = '# Previous Review Feedback\n\n';

  for (const [model, result] of Object.entries(feedback)) {
    md += `## ${model} (${result.verdict})\n`;
    md += result.summary + '\n\n';
  }

  md += '---\n\n';
  md += 'Please address the above feedback and signal PHASE_COMPLETE when done.\n';

  return md;
}
```

### Phase 4: Commit and Push

**Goal:** Automatic commit/push after successful verification.

**Files to modify:**

| File | Action |
|------|--------|
| `packages/codev/src/commands/porch/git.ts` | Create: Git operations |
| `packages/codev/src/commands/porch/run.ts` | Update: Call git after verify |

**Git operations:**

```typescript
async function commitAndPush(state, phaseConfig) {
  const artifact = resolveArtifact(phaseConfig.build.artifact, state);

  // Stage the artifact
  await exec(`git add ${artifact}`);

  // Commit with phase info
  const message = `[Spec ${state.id}] ${phaseConfig.name}: ${state.title}

Iteration ${state.iteration}/${phaseConfig.max_iterations}
3-way review: ${formatVerdicts(state.last_feedback)}`;

  await exec(`git commit -m "${message}"`);

  // Push
  if (phaseConfig.on_complete?.push) {
    await exec(`git push`);
  }
}
```

## REPL Updates

Update status display for build-verify:

```
[0075] SPECIFY - Iteration 2/3
  BUILD: complete (Claude finished)
  VERIFY: running...
    gemini: APPROVE
    codex:  running (45s)
    claude: REQUEST_CHANGES

> _
```

## Success Criteria

1. Protocol.json supports `type: "build_verify"` phases
2. Porch runs consultations automatically after Claude completes
3. Verdicts parsed from consultation output
4. Failed verifications feed back to next Claude iteration
5. Successful verification triggers commit + push
6. Human gates come after build-verify cycle completes
7. Max iteration cap prevents infinite loops
8. Status display shows build/verify progress

## Estimated Scope

| Metric | Value |
|--------|-------|
| New files | 3 (verify.ts, feedback.ts, git.ts) |
| Modified files | 5 (run.ts, types.ts, protocol.ts, state.ts, protocol-format.md) |
| Lines of code | ~400 |

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| consult CLI output format changes | Low | Medium | Abstract parsing, easy to update |
| Consultation takes too long | Medium | Low | Parallel execution, timeouts |
| Verdict parsing unreliable | Medium | Medium | Clear format requirements, fallback to REQUEST_CHANGES |
