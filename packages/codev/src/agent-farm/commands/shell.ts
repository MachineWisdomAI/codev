/**
 * Shell command - creates a utility shell terminal tab in the dashboard.
 *
 * Spec 0090: All terminals go through Tower on port 4100.
 * The dashboard picks up new tabs via state polling — no browser open needed.
 */

import { getConfig } from '../utils/index.js';
import { logger } from '../utils/logger.js';
import { TowerClient, encodeProjectPath } from '../lib/tower-client.js';

interface UtilOptions {
  name?: string;
}

/**
 * Try to create a shell tab via the Tower API
 * Returns true if successful, false if Tower not available
 */
async function tryTowerApi(client: TowerClient, projectPath: string, name?: string): Promise<boolean> {
  const encodedPath = encodeProjectPath(projectPath);

  const result = await client.request<{ id: string; name: string; terminalId: string }>(
    `/project/${encodedPath}/api/tabs/shell`,
    {
      method: 'POST',
      body: JSON.stringify({ name }),
    }
  );

  if (result.ok && result.data) {
    logger.success('Shell opened in dashboard tab');
    logger.kv('Name', result.data.name);
    return true;
  }

  if (result.error) {
    logger.error(`Tower API error: ${result.error}`);
  }

  return false;
}

/**
 * Spawn a utility shell terminal
 */
export async function shell(options: UtilOptions = {}): Promise<void> {
  const config = getConfig();

  // Create shell tab via Tower API
  const client = new TowerClient();
  const opened = await tryTowerApi(client, config.projectRoot, options.name);
  if (opened) {
    return;
  }

  // Tower not available - tell user to start it
  logger.error('Tower is not running.');
  logger.info('Start it with: af tower start');
  logger.info('Then try again: af shell');
  process.exit(1);
}
