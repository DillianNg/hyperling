/**
 * pnpm content:import [course-id] [--dry-run]
 *
 * Validates, then upserts course content into Postgres. Runs with the service
 * role, which is the only way content tables can be written (see 0003_rls_policies.sql).
 *
 * Safe to run repeatedly: items are keyed on (course_id, stable_key), so item ids
 * never change and learner progress is untouched. Items that disappear from the
 * content files are reported, never deleted.
 */
import postgres from 'postgres';
import { parseCourse, validateItemsFile } from '../src/core/content/validate.js';
import { itemsFileSchema, type ContentItem } from '../src/core/content/schema.js';
import { importCourse, type SqlExecutor } from '../src/core/content/import.js';
import { discoverCourses, readJson, rel } from './lib/paths.js';

const MISSING_URL_HELP = `
Thiếu biến môi trường DATABASE_URL.

Đây phải là connection string tới Postgres của Supabase với quyền service role
(không phải anon key). Lấy ở: Supabase Dashboard > Project Settings > Database >
Connection string > URI, rồi đặt vào .env.local:

  DATABASE_URL="postgresql://postgres.<ref>:<password>@<host>:5432/postgres"

Xem docs/ADDING_A_LANGUAGE.md và README.md để biết các bước đầy đủ.
`.trim();

function parseArgs(): { courseId?: string; dryRun: boolean } {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const courseId = args.find((a) => !a.startsWith('--'));
  return courseId === undefined ? { dryRun } : { courseId, dryRun };
}

async function main(): Promise<number> {
  const { courseId, dryRun } = parseArgs();
  const locations = discoverCourses().filter((c) => !courseId || c.courseId === courseId);

  if (locations.length === 0) {
    console.error(courseId ? `Không tìm thấy khóa "${courseId}".` : 'Không tìm thấy khóa nào trong content/.');
    return 1;
  }

  // Validate everything before opening a connection: a bad file should never
  // reach the database, not even partially.
  const prepared: Array<{ courseId: string; course: ReturnType<typeof requireCourse>; items: ContentItem[] }> = [];

  function requireCourse(raw: unknown, where: string) {
    const parsed = parseCourse(raw);
    if (!('course' in parsed)) {
      for (const issue of parsed.issues) console.error(`  ${issue.path}: ${issue.message}`);
      throw new Error(`course.json không hợp lệ: ${where}`);
    }
    return parsed.course;
  }

  for (const location of locations) {
    const course = requireCourse(readJson(location.coursePath), rel(location.coursePath));
    const items: ContentItem[] = [];

    for (const itemsPath of location.itemFilePaths) {
      const raw = readJson(itemsPath);
      const report = validateItemsFile(course, raw);
      if (!report.ok) {
        console.error(`\n✗ ${rel(itemsPath)} có ${report.errorCount} lỗi. Chạy "pnpm content:validate" để xem chi tiết.`);
        return 1;
      }
      items.push(...itemsFileSchema.parse(raw).items);
    }

    if (items.length === 0) {
      console.error(`✗ Khóa ${location.courseId} không có mục nào để import.`);
      return 1;
    }
    prepared.push({ courseId: location.courseId, course, items });
  }

  console.log('✓ Toàn bộ nội dung hợp lệ.');
  for (const p of prepared) {
    console.log(`  ${p.courseId}: ${p.items.length} mục`);
  }

  if (dryRun) {
    console.log('\n--dry-run: không ghi vào database.');
    return 0;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error(`\n${MISSING_URL_HELP}`);
    return 1;
  }

  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  const executor: SqlExecutor = {
    query: async <T>(text: string, params?: unknown[]) =>
      // postgres.js needs `unsafe` for $n-style text with a separate params array.
      (await sql.unsafe(text, params as never[])) as unknown as T[],
  };

  try {
    for (const { course, items } of prepared) {
      console.log(`\nĐang import ${course.id} ...`);
      const result = await sql.begin(async () => importCourse(executor, course, items));

      console.log(`  Mục thêm mới     : ${result.itemsInserted}`);
      console.log(`  Mục cập nhật     : ${result.itemsUpdated}`);
      console.log(`  Từ vựng          : ${result.glossaryTermsUpserted} từ, ${result.glossaryLinks} liên kết`);

      if (result.orphanStableKeys.length > 0) {
        const shown = result.orphanStableKeys.slice(0, 10).join(', ');
        const more = result.orphanStableKeys.length > 10 ? ` (và ${result.orphanStableKeys.length - 10} mục nữa)` : '';
        console.log(
          `\n  ⚠ ${result.orphanStableKeys.length} mục còn trong DB nhưng không còn trong file nội dung: ${shown}${more}`,
        );
        console.log('    Không tự xoá, vì có thể người học đã có tiến độ trên các mục này.');
      }
      console.log('  ✓ Xong.');
    }
    return 0;
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    console.error(`\n✗ Import thất bại (đã rollback): ${reason}`);
    return 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  },
);
