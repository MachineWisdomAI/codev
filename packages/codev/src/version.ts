/**
 * Package version - reads from package.json at build time
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Use require to load JSON (works in both src and dist)
const require = createRequire(import.meta.url);

// Try to load package.json from package root
// From src/version.ts -> ../package.json
// From dist/version.js -> ../package.json
let version = '0.0.0';
try {
  const pkg = require(resolve(__dirname, '../package.json'));
  version = pkg.version;
} catch {
  // Fallback if package.json not found
}

export { version };
