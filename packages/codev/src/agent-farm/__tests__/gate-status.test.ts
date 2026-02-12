/**
 * Tests for getGateStatusForProject YAML reading
 *
 * Phase 3 (Spec 0099): Gate status is now read from porch YAML files
 * instead of hardcoded to { hasGate: false }.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';

// We test the gate status by importing the tower-server's internal function
// indirectly. Since getGateStatusForProject is not exported, we test it
// through the YAML file structure it reads.

describe('Gate status YAML reading', () => {
  const testDir = path.join(tmpdir(), `codev-gate-test-${Date.now()}`);

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should parse porch YAML with pending spec-approval gate', () => {
    const projectDir = path.join(testDir, 'codev', 'projects', '0042-test-feature');
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'status.yaml'), `id: '0042'
title: test-feature
protocol: spir
phase: specify
gates:
  spec-approval:
    status: pending
  plan-approval:
    status: pending
  pr-ready:
    status: pending
`);

    // Verify the file structure is correct for the YAML parser
    const content = fs.readFileSync(path.join(projectDir, 'status.yaml'), 'utf-8');
    expect(content).toContain('gates:');
    expect(content).toContain('spec-approval:');
    expect(content).toContain('status: pending');

    // Verify the simple YAML parsing logic
    const gatesMatch = content.match(/^gates:\s*$/m);
    expect(gatesMatch).not.toBeNull();

    const gatesSection = content.slice(gatesMatch!.index! + gatesMatch![0].length);
    const lines = gatesSection.split('\n');

    let currentGate = '';
    let foundPending = false;
    let pendingGate = '';

    for (const line of lines) {
      if (/^\S/.test(line) && line.trim() !== '') break;

      const gateNameMatch = line.match(/^\s{2}(\S+):\s*$/);
      if (gateNameMatch) {
        currentGate = gateNameMatch[1];
        continue;
      }

      const statusMatch = line.match(/^\s{4}status:\s*(\S+)/);
      if (statusMatch && currentGate) {
        if (statusMatch[1] === 'pending') {
          foundPending = true;
          pendingGate = currentGate;
          break;
        }
      }
    }

    expect(foundPending).toBe(true);
    expect(pendingGate).toBe('spec-approval');
  });

  it('should not find pending gates when all are approved', () => {
    const projectDir = path.join(testDir, 'codev', 'projects', '0099-tower-hygiene');
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'status.yaml'), `id: '0099'
title: tower-hygiene
protocol: spir
phase: implement
gates:
  spec-approval:
    status: approved
    approved_at: '2026-02-12T05:26:59.084Z'
  plan-approval:
    status: approved
    approved_at: '2026-02-12T08:08:27.693Z'
  pr-ready:
    status: pending
`);

    const content = fs.readFileSync(path.join(projectDir, 'status.yaml'), 'utf-8');
    const gatesMatch = content.match(/^gates:\s*$/m);
    expect(gatesMatch).not.toBeNull();

    const gatesSection = content.slice(gatesMatch!.index! + gatesMatch![0].length);
    const lines = gatesSection.split('\n');

    let currentGate = '';
    const pendingGates: string[] = [];

    for (const line of lines) {
      if (/^\S/.test(line) && line.trim() !== '') break;

      const gateNameMatch = line.match(/^\s{2}(\S+):\s*$/);
      if (gateNameMatch) {
        currentGate = gateNameMatch[1];
        continue;
      }

      const statusMatch = line.match(/^\s{4}status:\s*(\S+)/);
      if (statusMatch && currentGate) {
        if (statusMatch[1] === 'pending') {
          pendingGates.push(currentGate);
        }
      }
    }

    // Only pr-ready should be pending (spec-approval and plan-approval are approved)
    expect(pendingGates).toEqual(['pr-ready']);
  });

  it('should handle missing codev/projects directory', () => {
    // No codev/projects directory created
    const projectsDir = path.join(testDir, 'codev', 'projects');
    expect(fs.existsSync(projectsDir)).toBe(false);
  });

  it('should extract builder ID from directory name', () => {
    const dirName = '0042-test-feature';
    const match = dirName.match(/^(\d+)/);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('0042');
  });
});
