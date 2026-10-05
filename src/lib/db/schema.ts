import {
  bigint,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Drizzle schema. The SQL files in supabase/migrations/ are authoritative — they
 * carry the RLS policies, triggers and grants that Drizzle cannot express — and
 * this file mirrors them to give the app typed queries.
 *
 * tests/unit/schema-parity.test.ts fails if the two ever drift apart.
 */

export const languages = pgTable('languages', {
  code: text('code').primaryKey(),
  nameNative: text('name_native').notNull(),
  nameVi: text('name_vi').notNull(),
  nameEn: text('name_en'),
  ttsLang: text('tts_lang'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const levels = pgTable(
  'levels',
  {
    framework: text('framework').notNull().default('CEFR'),
    code: text('code').notNull(),
    ord: smallint('ord').notNull(),
  },
  (t) => [primaryKey({ columns: [t.framework, t.code] })],
);

export const courses = pgTable('courses', {
  id: text('id').primaryKey(),
  version: text('version').notNull(),
  schemaVersion: smallint('schema_version').notNull().default(1),
  title: jsonb('title').notNull(),
  description: jsonb('description'),
  targetLanguage: text('target_language')
    .notNull()
    .references(() => languages.code),
  sourceLanguage: text('source_language')
    .notNull()
    .references(() => languages.code),
  levelFramework: text('level_framework').notNull().default('CEFR'),
  levelFrom: text('level_from').notNull(),
  levelTo: text('level_to').notNull(),
  levels: text('levels').array().notNull(),
  primaryItemKind: text('primary_item_kind').notNull(),
  fieldSchema: jsonb('field_schema').notNull(),
  tts: jsonb('tts'),
  source: jsonb('source'),
  publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const items = pgTable(
  'items',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    courseId: text('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    stableKey: text('stable_key').notNull(),
    kind: text('kind').notNull(),
    levelCode: text('level_code').notNull(),
    topic: text('topic').notNull(),
    orderIndex: integer('order_index').notNull(),
    fields: jsonb('fields').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('items_stable_key_unique').on(t.courseId, t.stableKey),
    unique('items_order_index_unique').on(t.courseId, t.orderIndex),
    index('items_course_order_idx').on(t.courseId, t.orderIndex),
    index('items_course_level_idx').on(t.courseId, t.levelCode, t.orderIndex),
  ],
);

export const glossaryTerms = pgTable(
  'glossary_terms',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    courseId: text('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    term: text('term').notNull(),
    meaning: text('meaning').notNull(),
    partOfSpeech: text('part_of_speech').notNull().default('other'),
    fields: jsonb('fields').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('glossary_terms_unique').on(t.courseId, t.term, t.meaning),
    index('glossary_terms_course_term_idx').on(t.courseId, t.term),
  ],
);

export const itemGlossary = pgTable(
  'item_glossary',
  {
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    termId: uuid('term_id')
      .notNull()
      .references(() => glossaryTerms.id, { onDelete: 'cascade' }),
    ord: smallint('ord').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.termId] }), index('item_glossary_term_idx').on(t.termId)],
);

// --- learner data (all guarded by RLS) ---------------------------------------

export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey(),
  email: text('email'),
  displayName: text('display_name'),
  uiLocale: text('ui_locale').notNull().default('vi'),
  timezone: text('timezone').notNull().default('Asia/Ho_Chi_Minh'),
  theme: text('theme').notNull().default('system'),
  fontScale: numeric('font_scale', { precision: 3, scale: 2 }).notNull().default('1.00'),
  reducedMotion: boolean('reduced_motion').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const enrollments = pgTable(
  'enrollments',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id').notNull(),
    courseId: text('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'restrict' }),
    levelFrom: text('level_from').notNull(),
    levelTo: text('level_to').notNull(),
    startDate: date('start_date').notNull(),
    targetDate: date('target_date').notNull(),
    newPerDay: smallint('new_per_day').notNull(),
    restWeekdays: smallint('rest_weekdays').array().notNull().default(sql`'{}'`),
    bufferDays: smallint('buffer_days').notNull(),
    timezone: text('timezone').notNull().default('Asia/Ho_Chi_Minh'),
    stageFlags: jsonb('stage_flags').notNull().default({ review: true, learn: true, consolidate: true }),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('enrollments_one_active_per_course')
      .on(t.userId, t.courseId)
      .where(sql`status = 'active'`),
    index('enrollments_user_idx').on(t.userId, t.status),
  ],
);

export const dailyPlans = pgTable(
  'daily_plans',
  {
    enrollmentId: uuid('enrollment_id')
      .notNull()
      .references(() => enrollments.id, { onDelete: 'cascade' }),
    planDate: date('plan_date').notNull(),
    dayIndex: integer('day_index').notNull(),
    plannedNew: smallint('planned_new').notNull(),
    completedNew: smallint('completed_new').notNull().default(0),
    completedReviews: smallint('completed_reviews').notNull().default(0),
    isRestDay: boolean('is_rest_day').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.enrollmentId, t.planDate] }),
    index('daily_plans_date_idx').on(t.enrollmentId, t.dayIndex),
  ],
);

export const cardStates = pgTable(
  'card_states',
  {
    userId: uuid('user_id').notNull(),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    enrollmentId: uuid('enrollment_id')
      .notNull()
      .references(() => enrollments.id, { onDelete: 'cascade' }),
    due: timestamp('due', { withTimezone: true }).notNull(),
    stability: doublePrecision('stability').notNull().default(0),
    difficulty: doublePrecision('difficulty').notNull().default(0),
    elapsedDays: integer('elapsed_days').notNull().default(0),
    scheduledDays: integer('scheduled_days').notNull().default(0),
    learningSteps: smallint('learning_steps').notNull().default(0),
    reps: integer('reps').notNull().default(0),
    lapses: integer('lapses').notNull().default(0),
    state: smallint('state').notNull().default(0),
    lastReview: timestamp('last_review', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.itemId] }),
    index('card_states_due_idx')
      .on(t.userId, t.enrollmentId, t.due)
      .where(sql`state <> 0`),
    index('card_states_enrollment_idx').on(t.enrollmentId, t.state),
  ],
);

export const reviewLogs = pgTable(
  'review_logs',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    userId: uuid('user_id').notNull(),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    enrollmentId: uuid('enrollment_id')
      .notNull()
      .references(() => enrollments.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id'),
    rating: smallint('rating').notNull(),
    exerciseKind: text('exercise_kind').notNull().default('flip'),
    isCorrect: boolean('is_correct'),
    durationMs: integer('duration_ms'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }).notNull().defaultNow(),
    stateBefore: smallint('state_before').notNull(),
    stabilityBefore: doublePrecision('stability_before'),
    difficultyBefore: doublePrecision('difficulty_before'),
    elapsedDays: integer('elapsed_days'),
    scheduledDays: integer('scheduled_days'),
    dueBefore: timestamp('due_before', { withTimezone: true }),
  },
  (t) => [
    index('review_logs_user_time_idx').on(t.userId, t.reviewedAt),
    index('review_logs_enrollment_time_idx').on(t.enrollmentId, t.reviewedAt),
    index('review_logs_item_idx').on(t.userId, t.itemId, t.reviewedAt),
  ],
);

export const studySessions = pgTable(
  'study_sessions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id').notNull(),
    enrollmentId: uuid('enrollment_id')
      .notNull()
      .references(() => enrollments.id, { onDelete: 'cascade' }),
    sessionDate: date('session_date').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    counts: jsonb('counts').notNull().default({}),
    accuracy: numeric('accuracy', { precision: 4, scale: 3 }),
    durationMs: integer('duration_ms'),
  },
  (t) => [index('study_sessions_user_date_idx').on(t.userId, t.sessionDate)],
);

export const itemFlags = pgTable(
  'item_flags',
  {
    userId: uuid('user_id').notNull(),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    isHard: boolean('is_hard').notNull().default(false),
    note: text('note'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.itemId] }),
    index('item_flags_hard_idx')
      .on(t.userId)
      .where(sql`is_hard`),
  ],
);

export type ItemRow = typeof items.$inferSelect;
export type CourseRow = typeof courses.$inferSelect;
export type ProfileRow = typeof profiles.$inferSelect;
export type EnrollmentRow = typeof enrollments.$inferSelect;
export type CardStateRow = typeof cardStates.$inferSelect;
export type ReviewLogRow = typeof reviewLogs.$inferSelect;
export type DailyPlanRow = typeof dailyPlans.$inferSelect;
export type StudySessionRow = typeof studySessions.$inferSelect;
export type GlossaryTermRow = typeof glossaryTerms.$inferSelect;
