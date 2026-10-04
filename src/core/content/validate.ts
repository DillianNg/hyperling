import { CEFR_LEVELS } from '@/config/app.config';
import { courseSchema, itemsFileSchema, type ContentItem, type Course, type FieldSpec } from './schema';

/**
 * Validation beyond what the Zod schemas can express on their own: an items file
 * is only valid *relative to its course*. Messages are Vietnamese and always
 * name the offending item, because the person fixing them is the content author.
 */

export type Severity = 'error' | 'warning';

export interface ContentIssue {
  severity: Severity;
  /** Dotted path into the file, e.g. `items[41].fields.meaning`. */
  path: string;
  /** stableKey of the offending item, when the issue belongs to one. */
  stableKey?: string;
  message: string;
}

export interface ValidationReport {
  issues: ContentIssue[];
  errorCount: number;
  warningCount: number;
  ok: boolean;
  stats: {
    itemCount: number;
    byLevel: Record<string, number>;
    topicCount: number;
    glossaryLinks: number;
    distinctTerms: number;
    /** Levels the course declares but has no content for yet. */
    emptyDeclaredLevels: string[];
  };
}

const err = (path: string, message: string, stableKey?: string): ContentIssue =>
  stableKey === undefined ? { severity: 'error', path, message } : { severity: 'error', path, message, stableKey };
const warn = (path: string, message: string, stableKey?: string): ContentIssue =>
  stableKey === undefined ? { severity: 'warning', path, message } : { severity: 'warning', path, message, stableKey };

export function parseCourse(raw: unknown): { course: Course; issues: ContentIssue[] } | { issues: ContentIssue[] } {
  const parsed = courseSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      issues: parsed.error.issues.map((i) => err(`course.${i.path.join('.')}` || 'course', i.message)),
    };
  }
  return { course: parsed.data, issues: [] };
}

/** Normalise a term for duplicate detection: case- and whitespace-insensitive. */
export function normalizeTerm(term: string): string {
  return term.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');
}

function checkFieldValues(
  item: ContentItem,
  index: number,
  specs: FieldSpec[],
  values: Record<string, string>,
  scope: string,
): ContentIssue[] {
  const issues: ContentIssue[] = [];
  const byKey = new Map(specs.map((s) => [s.key, s]));

  for (const spec of specs) {
    const value = values[spec.key];
    if (spec.required && (value === undefined || value.trim() === '')) {
      issues.push(err(`items[${index}].${scope}.${spec.key}`, `Thiếu trường bắt buộc "${spec.key}".`, item.stableKey));
      continue;
    }
    if (value !== undefined && spec.enum && !spec.enum.includes(value)) {
      issues.push(
        err(
          `items[${index}].${scope}.${spec.key}`,
          `Giá trị "${value}" không nằm trong danh sách cho phép của "${spec.key}": ${spec.enum.join(', ')}.`,
          item.stableKey,
        ),
      );
    }
  }

  for (const key of Object.keys(values)) {
    if (!byKey.has(key)) {
      issues.push(
        warn(
          `items[${index}].${scope}.${key}`,
          `Trường "${key}" không được khai báo trong course.json — sẽ bị bỏ qua khi import.`,
          item.stableKey,
        ),
      );
    }
  }
  return issues;
}

export function validateItemsFile(course: Course, raw: unknown): ValidationReport {
  const issues: ContentIssue[] = [];
  const parsed = itemsFileSchema.safeParse(raw);

  if (!parsed.success) {
    for (const i of parsed.error.issues) {
      issues.push(err(i.path.join('.') || 'items', i.message));
    }
    return report(issues, { itemCount: 0, byLevel: {}, topicCount: 0, glossaryLinks: 0, distinctTerms: 0, emptyDeclaredLevels: [] });
  }

  const file = parsed.data;
  if (file.courseId !== course.id) {
    issues.push(err('courseId', `courseId "${file.courseId}" không khớp course.json ("${course.id}").`));
  }

  const promptKey = course.fields.find((f) => f.role === 'prompt')?.key;
  const answerKey = course.fields.find((f) => f.role === 'answer')?.key;

  const seenKeys = new Map<string, number>();
  const seenOrder = new Map<number, string>();
  const byLevel: Record<string, number> = {};
  const topics = new Set<string>();
  const terms = new Set<string>();
  const duplicatePrompts = new Map<string, string>();
  let glossaryLinks = 0;

  const levelOrder = (lvl: string) => CEFR_LEVELS.indexOf(lvl as (typeof CEFR_LEVELS)[number]);
  const allowedLevels = new Set(course.levels);

  file.items.forEach((item, index) => {
    const at = `items[${index}]`;

    const firstSeen = seenKeys.get(item.stableKey);
    if (firstSeen !== undefined) {
      issues.push(err(`${at}.stableKey`, `stableKey "${item.stableKey}" bị trùng với items[${firstSeen}].`, item.stableKey));
    } else {
      seenKeys.set(item.stableKey, index);
    }

    const orderOwner = seenOrder.get(item.orderIndex);
    if (orderOwner !== undefined) {
      issues.push(err(`${at}.orderIndex`, `orderIndex ${item.orderIndex} đã dùng cho "${orderOwner}".`, item.stableKey));
    } else {
      seenOrder.set(item.orderIndex, item.stableKey);
    }

    if (!allowedLevels.has(item.level)) {
      issues.push(
        err(`${at}.level`, `Cấp độ "${item.level}" không nằm trong levels của khóa (${course.levels.join(', ')}).`, item.stableKey),
      );
    }

    if (item.kind !== course.primaryItemKind) {
      issues.push(
        warn(`${at}.kind`, `kind "${item.kind}" khác primaryItemKind "${course.primaryItemKind}" của khóa.`, item.stableKey),
      );
    }

    issues.push(...checkFieldValues(item, index, course.fields, item.fields, 'fields'));

    if (promptKey) {
      const prompt = item.fields[promptKey];
      if (prompt) {
        const key = normalizeTerm(prompt);
        const owner = duplicatePrompts.get(key);
        if (owner) {
          issues.push(warn(`${at}.fields.${promptKey}`, `Nội dung trùng với "${owner}": "${prompt}".`, item.stableKey));
        } else {
          duplicatePrompts.set(key, item.stableKey);
        }
      }
    }

    if (answerKey && item.fields[answerKey]?.trim() === item.fields[promptKey ?? '']?.trim()) {
      issues.push(warn(`${at}.fields.${answerKey}`, 'Nghĩa trùng y nguyên với câu gốc — có nhầm cột không?', item.stableKey));
    }

    byLevel[item.level] = (byLevel[item.level] ?? 0) + 1;
    topics.add(item.topic);

    const seenTermsInItem = new Set<string>();
    item.glossary.forEach((entry, gi) => {
      glossaryLinks += 1;
      const normalized = normalizeTerm(entry.term);
      terms.add(`${normalized}|${normalizeTerm(entry.meaning)}`);
      if (seenTermsInItem.has(normalized)) {
        issues.push(warn(`${at}.glossary[${gi}]`, `Từ "${entry.term}" xuất hiện hai lần trong cùng một mục.`, item.stableKey));
      }
      seenTermsInItem.add(normalized);
      issues.push(...checkFieldValues(item, index, course.glossaryFields, entry.fields, `glossary[${gi}].fields`));
    });
  });

  // orderIndex must be gapless and 1-based: the planner slices it by range.
  const orders = [...seenOrder.keys()].sort((a, b) => a - b);
  if (orders.length > 0) {
    if (orders[0] !== 1) {
      issues.push(warn('items[].orderIndex', `orderIndex nhỏ nhất là ${orders[0]}, thường phải bắt đầu từ 1.`));
    }
    for (let i = 1; i < orders.length; i += 1) {
      const prev = orders[i - 1]!;
      const curr = orders[i]!;
      if (curr !== prev + 1) {
        issues.push(
          warn(
            'items[].orderIndex',
            `orderIndex bị ngắt quãng: sau ${prev} là ${curr} (thiếu ${curr - prev - 1} mục). Kiểm tra lại nếu không cố ý.`,
          ),
        );
        break;
      }
    }
  }

  // Levels must not interleave: content is taught in ascending CEFR order.
  const sortedByOrder = [...file.items].sort((a, b) => a.orderIndex - b.orderIndex);
  let highestSoFar = -1;
  for (const item of sortedByOrder) {
    const rank = levelOrder(item.level);
    if (rank < highestSoFar) {
      issues.push(
        warn(
          `items[].level`,
          `Mục "${item.stableKey}" ở cấp ${item.level} nhưng xếp sau một mục cấp cao hơn — thứ tự cấp độ bị đảo.`,
          item.stableKey,
        ),
      );
      break;
    }
    highestSoFar = Math.max(highestSoFar, rank);
  }

  const emptyDeclaredLevels = course.levels.filter((lvl) => (byLevel[lvl] ?? 0) === 0);

  return report(issues, {
    itemCount: file.items.length,
    byLevel,
    topicCount: topics.size,
    glossaryLinks,
    distinctTerms: terms.size,
    emptyDeclaredLevels,
  });
}

function report(issues: ContentIssue[], stats: ValidationReport['stats']): ValidationReport {
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  return {
    issues,
    errorCount,
    warningCount: issues.length - errorCount,
    ok: errorCount === 0,
    stats,
  };
}
