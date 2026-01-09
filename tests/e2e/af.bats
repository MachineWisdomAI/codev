#!/usr/bin/env bats
# TC-005: af (agent-farm) Command Tests
#
# Tests that verify the af CLI works correctly.

load '../lib/bats-support/load'
load '../lib/bats-assert/load'
load '../lib/bats-file/load'
load 'helpers.bash'

setup() {
  setup_e2e_env
  cd "$TEST_DIR"
  install_codev
}

teardown() {
  teardown_e2e_env
}

# === Help and Version ===

@test "af --help shows available commands" {
  run ./node_modules/.bin/af --help
  assert_success
  assert_output --partial "start"
  assert_output --partial "spawn"
  assert_output --partial "status"
}

@test "af --version returns a version string" {
  run ./node_modules/.bin/af --version
  assert_success
  # Version should be a semantic version (e.g., 1.0.0, 1.1.0)
  [[ "$output" =~ [0-9]+\.[0-9]+\.[0-9]+ ]]
}

@test "af help shows usage information" {
  run ./node_modules/.bin/af help
  # Should show help or error gracefully
  [[ "$status" -eq 0 ]] || [[ "$status" -eq 1 ]]
}

# === Status Command ===

@test "af status works in a codev project" {
  # Initialize a codev project first
  ./node_modules/.bin/codev init test-project --yes
  cd test-project

  run ../node_modules/.bin/af status
  # Should work even without running dashboard
  # May show "no builders" or similar
  [[ "$status" -eq 0 ]] || [[ "$status" -eq 1 ]]
}

@test "af status shows Architect section" {
  ./node_modules/.bin/codev init test-project --yes
  cd test-project

  run ../node_modules/.bin/af status
  assert_output --partial "Architect"
}

# === Subcommand Help ===

@test "af start --help shows options" {
  run ./node_modules/.bin/af start --help
  assert_success
}

@test "af spawn --help shows options" {
  run ./node_modules/.bin/af spawn --help
  assert_success
  assert_output --partial "project"
}

@test "af cleanup --help shows options" {
  run ./node_modules/.bin/af cleanup --help
  assert_success
}

# === Error Cases ===

@test "af fails gracefully with unknown command" {
  run ./node_modules/.bin/af unknown-command-xyz
  assert_failure
}

@test "af spawn without project ID shows error" {
  ./node_modules/.bin/codev init test-project --yes
  cd test-project

  run ../node_modules/.bin/af spawn
  # Should fail and show help or error message
  assert_failure
}

@test "af status outside codev project handles gracefully" {
  # In TEST_DIR without codev structure
  run ./node_modules/.bin/af status
  # Should fail gracefully with helpful message
  [[ "$status" -eq 0 ]] || [[ "$status" -eq 1 ]]
}

# === Stale State Recovery (Issue #148) ===

@test "af status shows stopped for dead PID" {
  # Issue #148: When architect process dies but state.db retains the record,
  # af status should correctly identify the process as stopped

  # Initialize a codev project
  ./node_modules/.bin/codev init test-project --yes
  cd test-project

  # Create stale architect state with a definitely-dead PID
  # PID 999999 is very unlikely to exist on any system
  mkdir -p .agent-farm
  sqlite3 .agent-farm/state.db "
    CREATE TABLE IF NOT EXISTS _migrations (version INTEGER PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS architect (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      pid INTEGER NOT NULL,
      port INTEGER NOT NULL,
      cmd TEXT NOT NULL,
      started_at TEXT NOT NULL,
      tmux_session TEXT
    );
    INSERT OR REPLACE INTO _migrations (version) VALUES (1);
    INSERT OR REPLACE INTO architect (id, pid, port, cmd, started_at, tmux_session)
    VALUES (1, 999999, 4501, 'claude', '2024-01-01T00:00:00Z', 'af-architect-4501');
  "

  # Verify stale state exists
  run sqlite3 .agent-farm/state.db "SELECT pid FROM architect WHERE id = 1"
  assert_success
  assert_output "999999"

  # af status should show the architect as "stopped" (not "running")
  run ../node_modules/.bin/af status
  assert_success

  # The output should show the architect as stopped
  assert_output --partial "stopped"
  # Should still show the PID for reference
  assert_output --partial "999999"
}

@test "af status shows running for live PID" {
  # This test verifies that when a valid architect IS running,
  # af status correctly shows it as running

  # Initialize a codev project
  ./node_modules/.bin/codev init test-project --yes
  cd test-project

  # Create architect state with current shell's PID (which IS alive)
  mkdir -p .agent-farm
  sqlite3 .agent-farm/state.db "
    CREATE TABLE IF NOT EXISTS _migrations (version INTEGER PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS architect (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      pid INTEGER NOT NULL,
      port INTEGER NOT NULL,
      cmd TEXT NOT NULL,
      started_at TEXT NOT NULL,
      tmux_session TEXT
    );
    INSERT OR REPLACE INTO _migrations (version) VALUES (1);
    INSERT OR REPLACE INTO architect (id, pid, port, cmd, started_at, tmux_session)
    VALUES (1, $$, 4501, 'claude', '2024-01-01T00:00:00Z', 'af-architect-4501');
  "

  # af status should show this architect as running
  run ../node_modules/.bin/af status
  assert_success
  # Should show "running" since the PID is alive
  assert_output --partial "running"
}
