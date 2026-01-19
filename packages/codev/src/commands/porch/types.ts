/**
 * Porch - Protocol Orchestrator
 *
 * Type definitions for protocol definitions and state management.
 */

/**
 * Signal that a phase can emit to trigger state transitions
 */
export interface PhaseSignals {
  [signalName: string]: string; // signal name -> next state
}

/**
 * Backpressure check configuration
 */
export interface BackpressureCheck {
  command: string;
  on_fail: string;
}

/**
 * Phase definition in a protocol
 */
export interface Phase {
  id: string;
  name: string;
  prompt?: string;
  substates?: string[] | null;
  initial_substate?: string;
  signals?: PhaseSignals;
  terminal?: boolean;
  backpressure?: Record<string, BackpressureCheck>;
}

/**
 * Human or automated gate definition
 */
export interface Gate {
  id: string;
  after_state: string;
  next_state: string;
  type: 'human' | 'automated';
  description?: string;
}

/**
 * Transition configuration for a state
 */
export interface TransitionConfig {
  default?: string;
  on_gate_pass?: string;
  wait_for?: string;
  on_backpressure_pass?: string;
  on_backpressure_fail?: string;
}

/**
 * Protocol configuration
 */
export interface ProtocolConfig {
  poll_interval: number;
  max_iterations: number;
  prompts_dir: string;
}

/**
 * Complete protocol definition (loaded from JSON)
 */
export interface Protocol {
  $schema?: string;
  name: string;
  version: string;
  description: string;
  phases: Phase[];
  gates: Gate[];
  transitions: Record<string, TransitionConfig>;
  initial_state: string;
  config: ProtocolConfig;
}

/**
 * Gate status in project state
 */
export interface GateStatus {
  human?: { status: 'pending' | 'passed' | 'failed' };
  automated?: { status: 'pending' | 'passed' | 'failed' };
}

/**
 * Backpressure status in project state
 */
export interface BackpressureStatus {
  tests_pass?: { status: 'pending' | 'passed' | 'failed' };
  build_pass?: { status: 'pending' | 'passed' | 'failed' };
}

/**
 * Project state (stored in status file)
 */
export interface ProjectState {
  id: string;
  title: string;
  protocol: string;
  current_state: string;
  current_phase: string;
  gates: Record<string, GateStatus>;
  backpressure: BackpressureStatus;
  phases: Record<string, unknown>;
  created?: string;
  log?: string[];
}

/**
 * Options for porch commands
 */
export interface PorchRunOptions {
  dryRun?: boolean;
  noClaude?: boolean;
  pollInterval?: number;
}

export interface PorchInitOptions {
  description?: string;
}

export interface PorchApproveOptions {
  // no special options yet
}

export interface PorchStatusOptions {
  // no special options yet
}
