/**
 * pnpm content:schema
 *
 * Generates content/schema/*.schema.json from the Zod schemas so editors can
 * autocomplete and lint content files. Generated, never hand-edited: the Zod
 * definitions in src/core/content/schema.ts are the single source of truth.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { courseSchema, itemsFileSchema } from '../src/core/content/schema.js';
import { CONTENT_DIR, rel } from './lib/paths.js';

const TARGETS = [
  { file: 'course.schema.json', schema: courseSchema, id: 'https://hyperling.app/schema/course.json' },
  { file: 'items.schema.json', schema: itemsFileSchema, id: 'https://hyperling.app/schema/items.json' },
] as const;

function main(): number {
  const dir = join(CONTENT_DIR, 'schema');

  for (const target of TARGETS) {
    const jsonSchema = z.toJSONSchema(target.schema, { io: 'input', unrepresentable: 'any' });
    const document = { $schema: 'https://json-schema.org/draft/2020-12/schema', $id: target.id, ...jsonSchema };
    const path = join(dir, target.file);
    writeFileSync(path, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
    console.log(`✓ ${rel(path)}`);
  }

  console.log('\nThêm vào đầu file nội dung để editor gợi ý:');
  console.log('  "$schema": "../../schema/items.schema.json"');
  return 0;
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
