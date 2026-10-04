/**
 * pnpm content:validate [course-id]
 *
 * Checks every content file against its course declaration and reports problems
 * in Vietnamese with the offending item named. Exit code 1 on any error, so CI
 * can gate on it. Warnings do not fail the run.
 */
import { parseCourse, validateItemsFile, type ContentIssue, type ValidationReport } from '../src/core/content/index.js';
import { discoverCourses, readJson, rel } from './lib/paths.js';

const MAX_SHOWN = 40;

function printIssues(issues: ContentIssue[]): void {
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');

  for (const [label, list] of [
    ['LỖI', errors],
    ['CẢNH BÁO', warnings],
  ] as const) {
    if (list.length === 0) continue;
    console.log(`\n  ${label} (${list.length}):`);
    for (const issue of list.slice(0, MAX_SHOWN)) {
      const who = issue.stableKey ? ` [${issue.stableKey}]` : '';
      console.log(`    ${issue.path}${who}: ${issue.message}`);
    }
    if (list.length > MAX_SHOWN) {
      console.log(`    ... và ${list.length - MAX_SHOWN} mục nữa`);
    }
  }
}

function printStats(stats: ValidationReport['stats']): void {
  console.log(`  Số mục          : ${stats.itemCount}`);
  console.log(`  Theo cấp độ     : ${JSON.stringify(stats.byLevel)}`);
  console.log(`  Chủ đề          : ${stats.topicCount}`);
  console.log(`  Liên kết từ vựng: ${stats.glossaryLinks} (${stats.distinctTerms} từ riêng biệt)`);
  if (stats.emptyDeclaredLevels.length > 0) {
    console.log(
      `  Chưa có nội dung: ${stats.emptyDeclaredLevels.join(', ')} — khóa khai báo các cấp này nhưng chưa có mục nào.`,
    );
  }
}

function main(): number {
  const wanted = process.argv[2];
  const courses = discoverCourses().filter((c) => !wanted || c.courseId === wanted);

  if (courses.length === 0) {
    console.error(wanted ? `Không tìm thấy khóa "${wanted}" trong content/.` : 'Không tìm thấy khóa nào trong content/.');
    return 1;
  }

  let totalErrors = 0;
  let totalWarnings = 0;

  for (const location of courses) {
    console.log(`\n${'='.repeat(72)}\nKHÓA: ${location.courseId}  (${rel(location.dir)})`);

    const courseResult = parseCourse(readJson(location.coursePath));
    if (!('course' in courseResult)) {
      console.log(`\n  course.json KHÔNG HỢP LỆ:`);
      printIssues(courseResult.issues);
      totalErrors += courseResult.issues.length;
      continue;
    }
    const { course } = courseResult;
    console.log(`  ${course.title.vi}`);
    console.log(`  ${course.targetLanguage} → ${course.sourceLanguage} · ${course.levelFrom}–${course.levelTo} · v${course.version}`);

    if (location.itemFilePaths.length === 0) {
      console.log('\n  LỖI: khóa không có file items*.json nào.');
      totalErrors += 1;
      continue;
    }

    const seenKeysAcrossFiles = new Map<string, string>();

    for (const itemsPath of location.itemFilePaths) {
      console.log(`\n  ── ${rel(itemsPath)}`);
      const report = validateItemsFile(course, readJson(itemsPath));
      printStats(report.stats);
      printIssues(report.issues);
      totalErrors += report.errorCount;
      totalWarnings += report.warningCount;

      // stableKey must be unique across every file of the course, not just within one.
      const raw = readJson(itemsPath) as { items?: Array<{ stableKey?: string }> };
      for (const item of raw.items ?? []) {
        const key = item.stableKey;
        if (!key) continue;
        const owner = seenKeysAcrossFiles.get(key);
        if (owner && owner !== itemsPath) {
          console.log(`    LỖI: stableKey "${key}" xuất hiện ở cả ${rel(owner)} và ${rel(itemsPath)}.`);
          totalErrors += 1;
        }
        seenKeysAcrossFiles.set(key, itemsPath);
      }

      if (report.ok) console.log(report.warningCount === 0 ? '  ✓ Hợp lệ.' : '  ✓ Hợp lệ (có cảnh báo).');
    }
  }

  console.log(`\n${'='.repeat(72)}`);
  if (totalErrors === 0) {
    console.log(`✓ TẤT CẢ HỢP LỆ — ${totalWarnings} cảnh báo, 0 lỗi.`);
    console.log('  Bước tiếp: pnpm content:import');
    return 0;
  }
  console.log(`✗ ${totalErrors} LỖI, ${totalWarnings} cảnh báo. Sửa hết lỗi rồi chạy lại.`);
  return 1;
}

process.exitCode = main();
