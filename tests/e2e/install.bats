#!/usr/bin/env bats
# TC-001: Package Installation Tests
#
# Tests that verify the npm package installs correctly and
# CLI binaries are accessible and functional.

load '../lib/bats-support/load'
load '../lib/bats-assert/load'
load '../lib/bats-file/load'
load 'helpers.bash'

setup() {
  setup_e2e_env
  cd "$TEST_DIR"
}

teardown() {
  teardown_e2e_env
}

# === Happy Path Tests ===

@test "npm install from tarball creates node_modules" {
  install_codev
  assert_dir_exists "node_modules"
  assert_dir_exists "node_modules/@cluesmith/codev"
}

@test "codev binary is installed" {
  install_codev
  assert_file_exists "node_modules/.bin/codev"
}

@test "af binary is installed" {
  install_codev
  assert_file_exists "node_modules/.bin/af"
}

@test "consult binary is installed" {
  install_codev
  assert_file_exists "node_modules/.bin/consult"
}

@test "codev --version returns a version string" {
  install_codev

  run ./node_modules/.bin/codev --version
  assert_success
  # Version should be a semantic version (e.g., 1.0.0, 1.1.0)
  # TODO: CLI currently reports hardcoded version (1.0.0) instead of reading from package.json (1.1.0)
  #       This should be investigated separately - see packages/codev/src/cli.ts:21
  [[ "$output" =~ [0-9]+\.[0-9]+\.[0-9]+ ]]
}

@test "af --version returns a version string" {
  install_codev

  run ./node_modules/.bin/af --version
  assert_success
  # Version should be a semantic version (e.g., 1.0.0, 1.1.0)
  [[ "$output" =~ [0-9]+\.[0-9]+\.[0-9]+ ]]
}

@test "codev --help shows available commands" {
  install_codev

  run ./node_modules/.bin/codev --help
  assert_success
  assert_output --partial "init"
  assert_output --partial "adopt"
  assert_output --partial "doctor"
}

@test "af --help shows available commands" {
  install_codev

  run ./node_modules/.bin/af --help
  assert_success
  assert_output --partial "start"
  assert_output --partial "spawn"
  assert_output --partial "status"
}

@test "consult --help shows available commands" {
  install_codev

  run ./node_modules/.bin/consult --help
  assert_success
  assert_output --partial "pr"
  assert_output --partial "spec"
  assert_output --partial "plan"
}

@test "skeleton directory is included in package" {
  # Skeleton contains embedded protocols/roles/templates for runtime resolution
  install_codev
  assert_dir_exists "node_modules/@cluesmith/codev/skeleton"
}

# === Error Cases ===

@test "codev fails gracefully with unknown command" {
  install_codev

  run ./node_modules/.bin/codev unknown-command-that-does-not-exist
  assert_failure
}

@test "af fails gracefully with unknown command" {
  install_codev

  run ./node_modules/.bin/af unknown-command-that-does-not-exist
  assert_failure
}
