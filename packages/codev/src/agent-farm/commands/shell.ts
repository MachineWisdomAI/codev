/**
 * Shell command - creates a utility shell terminal tab in the dashboard.
 *
 * Spec 0090: All terminals go through Tower on port 4100.
 * The dashboard picks up new tabs via state polling — no browser open needed.
 */

import { getConfig } from '../utils/index.js';
import { logger, fatal } from '../utils/logger.js';

// Tower port is fixed at 4100
const TOWER_PORT = 4100;

interface UtilOptions {
  name?: string;
}

/**
 * Encode project path for Tower URL (base64url)
 */
function encodeProjectPath(projectPath: string): string {
  return Buffer.from(projectPath).toString('base64url');
}

/**
 * Try to create a shell tab via the Tower API
 * Returns true if successful, false if Tower not available
 */
async function tryTowerApi(projectPath: string, name?: string): Promise<boolean> {
  const encodedPath = encodeProjectPath(projectPath);

  try {
    const response = await fetch(`http://localhost:${TOWER_PORT}/project/${encodedPath}/api/tabs/shell`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });

    if (response.ok) {
      const result = await response.json() as { id: string; name: string; terminalId: string };
      logger.success('Shell opened in dashboard tab');
      logger.kv('Name', result.name);
      return true;
    }

    // Tower returned an error
    const error = await response.text();
    logger.error(`Tower API error: ${error}`);
    return false;
  } catch {
    // Tower not available
    return false;
  }
}

/**
 * Spawn a utility shell terminal
 */
export async function shell(options: UtilOptions = {}): Promise<void> {
  const config = getConfig();

  // Create shell tab via Tower API
  const opened = await tryTowerApi(config.projectRoot, options.name);
  if (opened) {
    return;
  }

  // Tower not available - tell user to start it
  logger.error('Tower is not running.');
  logger.info('Start it with: af tower start');
  logger.info('Then try again: af shell');
  process.exit(1);
}
