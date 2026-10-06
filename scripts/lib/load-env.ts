import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './paths.js';

/**
 * Load .env.local for the content scripts.
 *
 * Next reads it automatically; a plain tsx process does not. Without this the
 * import script reports a missing DATABASE_URL even though the value is sitting
 * right there in the file, which is a confusing way to fail.
 *
 * Values already set in the real environment win, so CI can override the file.
 */
export function loadEnvLocal(): void {
  for (const name of ['.env.local', '.env']) {
    const path = join(ROOT, name);
    if (!existsSync(path)) continue;

    for (const rawLine of readFileSync(path, 'utf8').split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      const separator = line.indexOf('=');
      if (separator === -1) continue;

      const key = line.slice(0, separator).trim();
      if (!key || key in process.env) continue;

      let value = line.slice(separator + 1).trim();
      // Tolerate quoted values, which people copy in from other tools.
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}
