# Terminal + tmux: Architecture, Constraints, and Known Issues

This document captures everything learned about the dashboard terminal's interaction with tmux, including failed approaches and the reasoning behind current decisions.

## Architecture

```
Browser (xterm.js) ←→ WebSocket ←→ Tower (node-pty) ←→ tmux session ←→ shell/claude
```

- **xterm.js** renders the terminal in the browser. It supports mouse reporting, text selection, clipboard (Cmd+C/Cmd+V), and native scrollback in normal screen buffer.
- **node-pty** spawns a shell inside a tmux session for persistence across Tower restarts.
- **tmux** uses the **alternate screen buffer**, which means xterm.js has no native scrollback for tmux content — all scrollback lives inside tmux.

## The Fundamental Tension

tmux's alternate screen buffer creates an irreconcilable conflict:

| Feature | Requires | Conflicts with |
|---------|----------|----------------|
| Text selection + Cmd+C/Cmd+V | tmux mouse OFF | Scroll wheel support |
| Native scroll wheel | tmux mouse ON | Text selection (auto-copy) |
| Scroll via key sequences | Custom wheel handler | Every key sequence has side effects |

**There is no configuration of tmux + xterm.js that gives both smooth scrolling AND normal text selection in the alternate screen buffer.** This is a fundamental limitation of the terminal protocol, not a bug in our code.

## Current State (as of 2026-02-13)

- **tmux mouse: OFF** (`tower-server.ts` line ~572, `architect.ts` per-session)
- **tmux alternate-screen: OFF** (`tower-server.ts` — both creation and reconnection paths)
- **Custom wheel handler: NONE** (removed from `Terminal.tsx`)
- **Text selection: WORKS** (xterm.js handles natively)
- **Cmd+C/Cmd+V: WORKS** (browser clipboard)
- **Scroll wheel: WORKS** — xterm.js handles it natively when no one intercepts the events

### Root Cause of Intermittent Failures (2026-02-13)

The scroll issue kept reappearing because `architect.ts:106` was running:
```typescript
await run(`tmux set-option -t "${sessionName}" -g mouse on`);
```
The `-g` flag made this **GLOBAL** — every time an architect session started, it set `mouse on` for ALL tmux sessions on the machine. This poisoned sessions that tower-server.ts had correctly set to `mouse off`. The intermittent behavior (works after reload, breaks later) was caused by architect sessions being created at unpredictable times.

**Fix**: Removed `-g` flag and all mouse/clipboard config from `architect.ts`. Replaced with per-session `mouse off`.

## The Key Lesson

**xterm.js handles scroll natively when nothing intercepts wheel events.** With tmux mouse OFF and no custom wheel handler, wheel events reach xterm.js, which scrolls its own viewport — even in alternate buffer mode. Every custom intervention we attempted (arrow keys, Page Up/Down, tmux mouse ON) actively broke things that worked out of the box. The correct solution was to do nothing.

## Failed Approaches (Chronological)

### Approach 1: Arrow key translation (PR #229)

**What**: Custom wheel handler in `Terminal.tsx` translates wheel events to `\x1b[A` (up arrow) / `\x1b[B` (down arrow) escape sequences sent to the PTY.

**Why it failed**: Arrow keys reach Claude Code's readline prompt, which interprets them as **command history navigation** (previous/next command). The user sees their command history cycling instead of terminal output scrolling.

**Lesson**: Arrow keys are application-level input, not scroll commands. They mean different things to different programs.

### Approach 2: Page Up/Down translation

**What**: Changed the escape sequences to `\x1b[5~` (Page Up) / `\x1b[6~` (Page Down).

**Why it failed**: In tmux, Page Up enters **copy mode** — a modal state with a visible yellow indicator bar. The user must press `q` to exit. This is jarring and confusing for users who just want to scroll.

**Lesson**: Page Up/Down in tmux is not equivalent to "scroll the viewport." It's "enter a completely different interaction mode."

### Approach 3: tmux mouse ON

**What**: Changed `tmux set-option mouse on` in `tower-server.ts`. Removed the custom wheel handler entirely, letting tmux handle mouse events natively via xterm.js mouse reporting.

**Why it failed**: With mouse ON, tmux intercepts ALL mouse events:
- **Click**: May enter copy mode or trigger tmux pane selection
- **Drag**: tmux enters selection mode (visual highlight)
- **Mouse button release after drag**: tmux **auto-copies** the selection to its paste buffer
- **Text selection**: No longer handled by xterm.js — tmux takes over

This breaks the fundamental clipboard workflow (select text, Cmd+C, paste elsewhere). The "auto-copy" behavior was particularly confusing and undesirable.

**Lesson**: tmux mouse mode is all-or-nothing. You can't enable just wheel events without also enabling click/drag interception. The selection/clipboard tradeoff makes it unsuitable for a web-based terminal.

**Critical operational note**: tmux options persist per-session. Changing the code in `tower-server.ts` only affects NEW sessions. Existing sessions retain their old settings until killed. When toggling mouse mode, you must ALSO update existing sessions:
```bash
# Fix all existing sessions immediately
tmux list-sessions -F '#{session_name}' | while read s; do
  tmux set-option -t "$s" mouse off
done
```

## Why This Is Hard

The root cause is **tmux's alternate screen buffer**:

1. When tmux starts, it tells xterm.js to switch to the alternate screen buffer (`\x1b[?1049h`)
2. The alternate screen buffer has **no scrollback** — it's a fixed-size grid
3. All historical output lives in tmux's internal buffer, inaccessible to xterm.js
4. The only way to access tmux's scrollback is through tmux's own mechanisms (copy mode, mouse mode)
5. Both of those mechanisms conflict with browser-native text selection and clipboard

In a native terminal (iTerm2, Terminal.app), this isn't a problem because:
- The terminal app can intercept mouse events BEFORE they reach the PTY
- Shift+scroll or similar modifiers bypass the application
- The terminal has direct access to its own scrollback buffer

In a web browser with xterm.js, we don't have these luxuries. xterm.js either reports mouse events to the application (tmux) or handles them locally — there's no in-between.

## Debugging Methodology — What Went Wrong

The scroll issue consumed ~8-10 hours across two sessions (Feb 12-13, 2026). The root cause was a single `-g` flag in `architect.ts`. Here's what went wrong and what to do differently next time:

### The pattern that wasted time

1. Symptom observed (scroll broken)
2. AI jumps to quick fix in Terminal.tsx (wheel handler)
3. User pushes back — "read the docs"
4. AI reads docs, tries another quick fix anyway
5. Repeat 3 times

### What should have happened

1. Symptom observed (scroll broken)
2. Note: behavior is **intermittent** (works after reload, breaks later)
3. **Key question**: "What is changing tmux state between reloads?"
4. `grep -r "mouse" packages/codev/src/` → finds `architect.ts` with `-g mouse on`
5. Fix the one line. Done in 5 minutes.

### Rules for future terminal/tmux debugging

1. **Intermittent = external state mutation.** Grep for everything that touches the relevant state. Don't fix the renderer — find who's flipping the switch.
2. **Consult early.** If the first fix doesn't work, consult Gemini/Codex/web search immediately. Don't iterate solo.
3. **Never spawn a builder for a symptom fix.** If you don't understand the root cause, more code won't help.
4. **Read THIS document first.** It exists to prevent repeating failed approaches.
5. **tmux `-g` flag is dangerous.** It sets options GLOBALLY across ALL sessions. Always use `-t <session>` for per-session settings.

## Proper Solutions (Future Work)

### Option A: Server-side scroll buffer

Instead of sending escape sequences through the PTY, maintain a scroll buffer on the Tower server:

1. Tower captures all PTY output in a ring buffer (already exists for session replay)
2. Dashboard sends a `scroll` WebSocket control message (not PTY data)
3. Tower responds with historical output from the ring buffer
4. Dashboard temporarily displays historical content in xterm.js
5. Scrolling back to bottom resumes live output

**Pros**: No tmux interaction, no escape sequences, no mode conflicts.
**Cons**: Significant architectural work. Need to handle ANSI state (colors, cursor position) correctly when showing historical output.

### Option B: Selective tmux mouse mode

Use tmux hooks or custom key bindings to enable wheel-only mouse support:

1. `set mouse on`
2. `unbind -T copy-mode MouseDragEnd1Pane` (prevent auto-copy)
3. `unbind -T root MouseDown1Pane` (prevent click interception)
4. Custom xterm.js event handler that forwards wheel events but handles click/drag locally

**Pros**: Uses tmux's native scroll. Potentially achievable with enough tmux configuration.
**Cons**: Complex tmux configuration. May not fully prevent all click/drag interception. xterm.js mouse reporting mode is controlled by the application (tmux sends DEC private mode sequences), not by our code.

### Option C: Disable alternate screen buffer

Tell tmux to not use the alternate screen buffer:

```bash
tmux set-option -t <session> alternate-screen off
```

This makes tmux write directly to xterm.js's normal screen buffer, which HAS scrollback.

**Pros**: Simplest fix. xterm.js native scroll works immediately.
**Cons**: May cause rendering artifacts. Some programs (vim, less, Claude Code TUI) expect alternate screen behavior. Screen content may not clean up properly when programs exit.

### Option D: `attachCustomWheelEventHandler` (xterm.js API)

Use xterm.js's public API to intercept wheel events in alternate screen buffer:

```typescript
term.attachCustomWheelEventHandler((event: WheelEvent) => {
  if (term.buffer.active.type === 'alternate') {
    return false; // suppress — prevent arrow key translation
  }
  return true; // normal buffer — let xterm.js handle natively
});
```

**Pros**: Clean, uses public API, no tmux changes needed, solves the xterm.js wheel-to-arrow translation directly.
**Cons**: Scroll does nothing in alternate buffer (but that's better than cycling command history). Does not provide actual scroll-through-history.

**Note**: xterm.js translates wheel events to arrow keys when `buffer.hasScrollback` is false (alternate buffer). This is hardcoded in `CoreBrowserTerminal.ts` — there's no config option. `attachCustomWheelEventHandler` is the escape hatch. See also xterm.js Issue #5194 (DECSET 1007 support, tagged `help wanted`).

### Recommended path: Option D now, Option A long-term

Option D (`attachCustomWheelEventHandler`) is the cleanest immediate fix — it uses xterm.js's own API to prevent the wheel-to-arrow translation that causes command history cycling. It doesn't add scroll-in-alternate-buffer, but it eliminates the bad behavior.

Option C (`alternate-screen off`) is currently deployed and works but is fragile — apps like Claude Code send their own alternate screen sequences that can bypass it.

Option A (server-side scroll buffer) is the architecturally correct long-term solution but requires significant engineering.

## Key Files

| File | Role |
|------|------|
| `packages/codev/dashboard/src/components/Terminal.tsx` | xterm.js setup, event handlers |
| `packages/codev/dashboard/__tests__/Terminal.scroll.test.tsx` | Scroll behavior tests |
| `packages/codev/src/agent-farm/servers/tower-server.ts` (~line 572) | tmux session creation, mouse config |
| `packages/codev/src/agent-farm/commands/architect.ts` (~line 104) | Architect tmux session setup — **was the source of `-g mouse on` bug** |
| `packages/codev/src/terminal/pty-manager.ts` | PTY session lifecycle |

## Operational Notes

- **Stale tmux sessions**: Tower reuses existing tmux sessions on restart (line ~1650 of tower-server.ts). Code changes to tmux options only apply to NEW sessions. Kill stale sessions to force recreation.
- **Testing tmux changes**: After changing tmux config in code, you must: (1) rebuild and install, (2) kill affected tmux sessions OR run `tmux set-option` on each, (3) restart Tower, (4) verify in dashboard.
- **Mouse mode is per-session**: Each tmux session has its own mouse setting. Changing the Tower code doesn't retroactively update existing sessions.
- **Do NOT attempt quick fixes to scroll**: Every approach tried so far has broken something else. Any future attempt should be specced, consulted, and tested thoroughly before deployment. Read this entire document first.
