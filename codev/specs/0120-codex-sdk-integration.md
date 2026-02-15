---
approved: 2026-02-15
validated: [architect]
---

# Specification: Codex SDK Integration

## Metadata
- **ID**: 0120
- **Status**: approved
- **Created**: 2026-02-15

## Problem Statement

Codex consultations currently spawn the `codex` CLI as a raw subprocess, capturing JSONL output from stdout and attempting to parse it after the fact. This approach has caused repeated bugs:

1. **JSONL extraction failure** (bugfix #297, #298): `extractReviewText()` looked for `event.type === 'message'` but Codex outputs `event.type === 'item.completed'` with `item.type === 'agent_message'`. Reviews fell back to raw 184KB JSONL, which porch's verdict parser couldn't parse, defaulting to REQUEST_CHANGES on every iteration.

2. **No streaming visibility**: Unlike Claude (which streams text via the Agent SDK), Codex output is fully buffered. The architect sees nothing until the process completes after 2-4 minutes.

3. **Brittle format coupling**: Any change to Codex's JSONL output format breaks extraction silently. The fallback to raw output means bugs hide until porch rejects the review.

4. **No structured usage data**: Token counts and cost are extracted by scanning JSONL for `turn.completed` events — fragile and incomplete.

## Solution

Replace the Codex CLI subprocess with the `@openai/codex-sdk` npm package. This is the same pattern we already use for Claude via `@anthropic-ai/claude-agent-sdk`.

### Existing Claude SDK Pattern (model this on)

```typescript
// consult/index.ts — Claude uses the Agent SDK
import { query as claudeQuery } from '@anthropic-ai/claude-agent-sdk';

const session = claudeQuery({
  prompt: queryText,
  options: {
    systemPrompt: role,
    allowedTools: ['Read', 'Glob', 'Grep'],
    permissionMode: 'bypassPermissions',
    model: 'claude-opus-4-6',
    maxTurns: CLAUDE_MAX_TURNS,
    cwd: workspaceRoot,
    env,
  },
});

for await (const message of session) {
  if (message.type === 'assistant' && message.message?.content) {
    for (const block of message.message.content) {
      if ('text' in block) {
        process.stdout.write(block.text);  // Real-time streaming
        chunks.push(block.text);
      }
    }
  }
  if (message.type === 'result') {
    sdkResult = message;  // Structured usage data
  }
}
```

### Target: Codex SDK Pattern

```typescript
import { Codex, Thread } from '@openai/codex-sdk';

const codex = new Codex();
const thread = codex.startThread();

// Use runStreamed() for real-time event access
for await (const event of thread.runStreamed(queryText)) {
  if (event.type === 'item.completed' && event.item?.type === 'agent_message') {
    process.stdout.write(event.item.text);  // Real-time streaming
    chunks.push(event.item.text);
  }
  if (event.type === 'turn.completed') {
    // Structured usage data directly from event
  }
}
```

## Current Code to Replace

All in `packages/codev/src/commands/consult/index.ts`:

1. **Lines 493-507**: Codex subprocess command construction (`codex exec --full-auto --json`)
2. **Lines 528-575** (approx): Generic subprocess spawning for Codex (shared with Gemini)
3. **`usage-extractor.ts` lines 94-153**: `extractCodexUsage()` — JSONL parsing for usage
4. **`usage-extractor.ts` lines 152-180**: `extractReviewText()` codex branch — JSONL parsing for review text

Replace with a dedicated `runCodexConsultation()` function that mirrors `runClaudeConsultation()`.

## Success Criteria

- [ ] Codex consultations use `@openai/codex-sdk` instead of subprocess
- [ ] Real-time text streaming to stdout (like Claude SDK does)
- [ ] Review text captured directly from SDK events — no JSONL file extraction
- [ ] Usage data (tokens, cost) extracted from SDK structured events
- [ ] Metrics recording works correctly (duration, tokens, cost, exit code)
- [ ] System prompt / role passed via SDK options (not temp file)
- [ ] Read-only sandbox mode preserved
- [ ] Existing `consult -m codex` CLI interface unchanged
- [ ] `extractReviewText()` codex branch removed (no longer needed)
- [ ] `extractCodexUsage()` simplified or removed

## Constraints

- Must not change the `consult` CLI interface — same flags, same output behavior
- Gemini remains subprocess-based (no SDK available)
- Claude SDK integration unchanged
- The SDK must be configured for read-only / sandbox mode (consultations don't write code)

## Scope

- ~200 LOC changed in `consult/index.ts` (new `runCodexConsultation()` + remove subprocess path)
- ~80 LOC removed from `usage-extractor.ts` (JSONL parsing no longer needed)
- New dependency: `@openai/codex-sdk`
- Update tests in `consult/__tests__/`
