# Lessons Learned

Consolidated wisdom extracted from review documents. Updated during MAINTAIN protocol runs.

---

## Testing

- [From 0001] Always use XDG sandboxing in tests to avoid touching real $HOME directories
- [From 0001] Never use `|| true` patterns that mask test failures
- [From 0001] Create control tests to verify default behavior before testing modifications
- [From 0009] Verify dependencies actually export what you expect before using them (xterm v5 doesn't export globals)

## Architecture

- [From 0008] Single source of truth beats distributed state - consolidate to one implementation
- [From 0008] File locking is essential for concurrent access to shared state files
- [From 0031] SQLite with WAL mode handles concurrency better than JSON files
- [From 0034] Two-pass rendering needed for format-aware processing (e.g., table alignment)

## Process

- [From 0001] Multi-agent consultation catches issues humans miss - don't skip it
- [From 0001] Get FINAL approval from ALL experts on FIXED versions before presenting to user
- [From 0005] Failing fast with clear errors is better than silent fallbacks
- [From 0009] Check for existing work (PRs, git history) before implementing from scratch

## Documentation

- [From 0001] Update ALL documentation after changes (README, CLAUDE.md, AGENTS.md, specs)
- [From 0008] Keep CLAUDE.md and AGENTS.md in sync (they should be identical)

## Tools

- [From 0009] When shell commands fail, understand the underlying protocol before trying alternatives
- [From 0031] Use atomic database operations instead of read-modify-write patterns on files

---

*Last updated: 2025-12-06*
*Source: codev/reviews/*
