/**
 * Cloud tunnel management for tower server.
 * Spec 0105: Tower Server Decomposition — Phase 2
 *
 * Contains: tunnel client lifecycle, config file watching,
 * metadata refresh, and tunnel API endpoint handling.
 */

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { TunnelClient, type TunnelState, type TowerMetadata } from '../lib/tunnel-client.js';
import { readCloudConfig, getCloudConfigPath, maskApiKey, type CloudConfig } from '../lib/cloud-config.js';
import type { ProjectTerminals, InstanceStatus } from './tower-types.js';
import type { TerminalManager } from '../../terminal/pty-manager.js';

/** Minimal dependencies required by the tunnel module */
export interface TunnelDeps {
  port: number;
  log: (level: 'INFO' | 'ERROR' | 'WARN', message: string) => void;
  projectTerminals: Map<string, ProjectTerminals>;
  terminalManager: TerminalManager | null;
}

// ============================================================================
// Module-private state (lifecycle driven by orchestrator)
// ============================================================================

let tunnelClient: TunnelClient | null = null;
let configWatcher: fs.FSWatcher | null = null;
let configWatchDebounce: ReturnType<typeof setTimeout> | null = null;
let metadataRefreshInterval: ReturnType<typeof setInterval> | null = null;

const METADATA_REFRESH_MS = 30_000;

/** Stored references set by initTunnel() */
let _deps: TunnelDeps | null = null;
let _getInstances: (() => Promise<InstanceStatus[]>) | null = null;

// ============================================================================
// Internal functions
// ============================================================================

/**
 * Gather current tower metadata (projects + terminals) for codevos.ai.
 */
async function gatherMetadata(): Promise<TowerMetadata> {
  if (!_deps || !_getInstances) throw new Error('Tunnel not initialized');

  const instances = await _getInstances();
  const projects = instances.map((i) => ({
    path: i.projectPath,
    name: i.projectName,
  }));

  // Build reverse mapping: terminal ID → project path
  const terminalToProject = new Map<string, string>();
  for (const [projectPath, entry] of _deps.projectTerminals) {
    if (entry.architect) terminalToProject.set(entry.architect, projectPath);
    for (const termId of entry.builders.values()) terminalToProject.set(termId, projectPath);
    for (const termId of entry.shells.values()) terminalToProject.set(termId, projectPath);
  }

  const manager = _deps.terminalManager;
  const terminals: TowerMetadata['terminals'] = [];
  if (manager) {
    for (const session of manager.listSessions()) {
      terminals.push({
        id: session.id,
        projectPath: terminalToProject.get(session.id) ?? '',
      });
    }
  }

  return { projects, terminals };
}

/**
 * Start periodic metadata refresh — re-gathers metadata and pushes to codevos.ai
 * every METADATA_REFRESH_MS while the tunnel is connected.
 */
function startMetadataRefresh(): void {
  stopMetadataRefresh();
  metadataRefreshInterval = setInterval(async () => {
    try {
      if (tunnelClient && tunnelClient.getState() === 'connected') {
        const metadata = await gatherMetadata();
        tunnelClient.sendMetadata(metadata);
      }
    } catch (err) {
      _deps?.log('WARN', `Metadata refresh failed: ${(err as Error).message}`);
    }
  }, METADATA_REFRESH_MS);
}

/**
 * Stop the periodic metadata refresh.
 */
function stopMetadataRefresh(): void {
  if (metadataRefreshInterval) {
    clearInterval(metadataRefreshInterval);
    metadataRefreshInterval = null;
  }
}

/**
 * Create or reconnect the tunnel client using the given config.
 * Sets up state change listeners and sends initial metadata.
 */
async function connectTunnel(config: CloudConfig): Promise<TunnelClient> {
  if (!_deps) throw new Error('Tunnel not initialized');

  // Disconnect existing client if any
  if (tunnelClient) {
    tunnelClient.disconnect();
  }

  const client = new TunnelClient({
    serverUrl: config.server_url,
    apiKey: config.api_key,
    towerId: config.tower_id,
    localPort: _deps.port,
  });

  client.onStateChange((state: TunnelState, prev: TunnelState) => {
    _deps!.log('INFO', `Tunnel: ${prev} → ${state}`);
    if (state === 'connected') {
      startMetadataRefresh();
    } else if (prev === 'connected') {
      stopMetadataRefresh();
    }
    if (state === 'auth_failed') {
      _deps!.log('ERROR', 'Cloud connection failed: API key is invalid or revoked. Run \'af tower register --reauth\' to update credentials.');
    }
  });

  // Gather and set initial metadata before connecting
  const metadata = await gatherMetadata();
  client.sendMetadata(metadata);

  tunnelClient = client;
  client.connect();

  // Ensure config watcher is running — the config directory now exists.
  startConfigWatcher();

  return client;
}

/**
 * Start watching cloud-config.json for changes.
 * On change: reconnect with new credentials.
 * On delete: disconnect tunnel.
 */
function startConfigWatcher(): void {
  stopConfigWatcher();

  const configPath = getCloudConfigPath();
  const configDir = path.dirname(configPath);
  const configFile = path.basename(configPath);

  // Watch the directory (more reliable than watching the file directly)
  try {
    configWatcher = fs.watch(configDir, (eventType, filename) => {
      if (filename !== configFile) return;

      // Debounce: multiple events fire for a single write
      if (configWatchDebounce) clearTimeout(configWatchDebounce);
      configWatchDebounce = setTimeout(async () => {
        configWatchDebounce = null;
        try {
          const config = readCloudConfig();
          if (config) {
            _deps?.log('INFO', `Cloud config changed, reconnecting tunnel (key: ${maskApiKey(config.api_key)})`);
            // Reset circuit breaker in case previous key was invalid
            if (tunnelClient) tunnelClient.resetCircuitBreaker();
            await connectTunnel(config);
          } else {
            // Config deleted or invalid
            _deps?.log('INFO', 'Cloud config removed or invalid, disconnecting tunnel');
            if (tunnelClient) {
              tunnelClient.disconnect();
              tunnelClient = null;
            }
          }
        } catch (err) {
          _deps?.log('WARN', `Error handling config change: ${(err as Error).message}`);
        }
      }, 500);
    });
  } catch {
    // Directory doesn't exist yet — that's fine, user hasn't registered
  }
}

/**
 * Stop watching cloud-config.json.
 */
function stopConfigWatcher(): void {
  if (configWatcher) {
    configWatcher.close();
    configWatcher = null;
  }
  if (configWatchDebounce) {
    clearTimeout(configWatchDebounce);
    configWatchDebounce = null;
  }
}

// ============================================================================
// Public API (called by orchestrator)
// ============================================================================

/**
 * Initialize the tunnel module. Reads cloud config and connects if registered.
 * Starts config file watcher for credential changes.
 */
export async function initTunnel(
  deps: TunnelDeps,
  callbacks: { getInstances: () => Promise<InstanceStatus[]> },
): Promise<void> {
  _deps = deps;
  _getInstances = callbacks.getInstances;

  // Auto-connect tunnel if registered
  try {
    const config = readCloudConfig();
    if (config) {
      deps.log('INFO', `Cloud config found, connecting tunnel (tower: ${config.tower_name}, key: ${maskApiKey(config.api_key)})`);
      await connectTunnel(config);
    } else {
      deps.log('INFO', 'No cloud config found, operating in local-only mode');
    }
  } catch (err) {
    deps.log('WARN', `Failed to read cloud config: ${(err as Error).message}. Operating in local-only mode.`);
  }

  // Start watching cloud-config.json for changes
  startConfigWatcher();
}

/**
 * Shut down the tunnel module. Disconnects client, stops watchers.
 */
export function shutdownTunnel(): void {
  stopMetadataRefresh();
  stopConfigWatcher();
  if (tunnelClient) {
    _deps?.log('INFO', 'Disconnecting tunnel...');
    tunnelClient.disconnect();
    tunnelClient = null;
  }
  _deps = null;
  _getInstances = null;
}

/**
 * Handle tunnel management endpoints (Spec 0097 Phase 4).
 * Dispatches /api/tunnel/{connect,disconnect,status} requests.
 */
export async function handleTunnelEndpoint(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  tunnelSub: string,
): Promise<void> {
  // POST connect
  if (req.method === 'POST' && tunnelSub === 'connect') {
    try {
      const config = readCloudConfig();
      if (!config) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Not registered. Run \'af tower register\' first.' }));
        return;
      }
      if (tunnelClient) tunnelClient.resetCircuitBreaker();
      const client = await connectTunnel(config);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, state: client.getState() }));
    } catch (err) {
      _deps?.log('ERROR', `Tunnel connect failed: ${(err as Error).message}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: (err as Error).message }));
    }
    return;
  }

  // POST disconnect
  if (req.method === 'POST' && tunnelSub === 'disconnect') {
    if (tunnelClient) {
      tunnelClient.disconnect();
      tunnelClient = null;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  // GET status
  if (req.method === 'GET' && tunnelSub === 'status') {
    let config: CloudConfig | null = null;
    try {
      config = readCloudConfig();
    } catch {
      // Config file may be corrupted — treat as unregistered
    }

    const state = tunnelClient?.getState() ?? 'disconnected';
    const uptime = tunnelClient?.getUptime() ?? null;

    const response: Record<string, unknown> = {
      registered: config !== null,
      state,
      uptime,
    };

    if (config) {
      response.towerId = config.tower_id;
      response.towerName = config.tower_name;
      response.serverUrl = config.server_url;
      response.accessUrl = `${config.server_url}/t/${config.tower_name}/`;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(response));
    return;
  }

  // Unknown tunnel endpoint
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
}
