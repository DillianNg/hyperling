import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, '..', '..');
export const CONTENT_DIR = join(ROOT, 'content');

export interface CourseLocation {
  courseId: string;
  languageCode: string;
  dir: string;
  coursePath: string;
  itemFilePaths: string[];
}

/** Walk content/<lang>/<course-id>/ and return every course found. */
export function discoverCourses(): CourseLocation[] {
  if (!existsSync(CONTENT_DIR)) return [];
  const found: CourseLocation[] = [];

  for (const lang of readdirSync(CONTENT_DIR, { withFileTypes: true })) {
    if (!lang.isDirectory() || lang.name === 'schema') continue;
    const langDir = join(CONTENT_DIR, lang.name);

    for (const course of readdirSync(langDir, { withFileTypes: true })) {
      if (!course.isDirectory()) continue;
      const dir = join(langDir, course.name);
      const coursePath = join(dir, 'course.json');
      if (!existsSync(coursePath)) continue;

      const itemFilePaths = readdirSync(dir)
        .filter((f) => f !== 'course.json' && f.endsWith('.json') && f.startsWith('items'))
        .sort()
        .map((f) => join(dir, f));

      found.push({ courseId: course.name, languageCode: lang.name, dir, coursePath, itemFilePaths });
    }
  }
  return found.sort((a, b) => a.courseId.localeCompare(b.courseId));
}

export function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`Không đọc được JSON từ ${path}: ${reason}`);
  }
}

/** Path shown to the user: relative to the repo root. */
export function rel(path: string): string {
  return path.startsWith(ROOT) ? path.slice(ROOT.length + 1) : path;
}
