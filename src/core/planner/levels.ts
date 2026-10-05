import { CEFR_LEVELS, type CefrLevel } from '@/config/app.config';

/**
 * Level range arithmetic. Pure, so the planner and the UI agree on what
 * "from A1 to B2" contains without asking the database.
 */

export function levelRank(level: string): number {
  return CEFR_LEVELS.indexOf(level as CefrLevel);
}

export function isCefrLevel(value: string): value is CefrLevel {
  return levelRank(value) !== -1;
}

/**
 * Levels a learner studies when going from `from` to `to`.
 *
 * The starting level is *excluded*: someone who already has A1 does not relearn
 * it, they start at A2. The one exception is a range of a single level, which
 * means "study this level", not "study nothing".
 */
export function levelsToStudy(from: string, to: string): CefrLevel[] {
  const fromRank = levelRank(from);
  const toRank = levelRank(to);
  if (fromRank === -1 || toRank === -1 || fromRank > toRank) return [];
  if (fromRank === toRank) return [CEFR_LEVELS[fromRank]!];
  return CEFR_LEVELS.slice(fromRank + 1, toRank + 1) as CefrLevel[];
}

/** Every level in the inclusive range, used for display rather than for planning. */
export function levelsInRange(from: string, to: string): CefrLevel[] {
  const fromRank = levelRank(from);
  const toRank = levelRank(to);
  if (fromRank === -1 || toRank === -1 || fromRank > toRank) return [];
  return CEFR_LEVELS.slice(fromRank, toRank + 1) as CefrLevel[];
}

/**
 * Goals a learner at `currentLevel` can pick, given which levels actually have
 * content. A goal is offered only when every level along the way has items —
 * otherwise the plan would promise days with nothing to study.
 */
export function selectableGoals(args: {
  currentLevel: string;
  courseLevels: readonly string[];
  /** Item counts per level, from the database. */
  itemCountByLevel: Readonly<Record<string, number>>;
}): CefrLevel[] {
  const { currentLevel, courseLevels, itemCountByLevel } = args;
  const currentRank = levelRank(currentLevel);
  if (currentRank === -1) return [];

  const goals: CefrLevel[] = [];
  for (const level of courseLevels) {
    const rank = levelRank(level);
    if (rank <= currentRank) continue;
    const path = levelsToStudy(currentLevel, level);
    if (path.length === 0) continue;
    if (path.every((step) => (itemCountByLevel[step] ?? 0) > 0)) {
      goals.push(level as CefrLevel);
    }
  }
  return goals;
}

/** Starting levels worth offering: the course's own levels, minus the top one. */
export function selectableStartingLevels(courseLevels: readonly string[]): CefrLevel[] {
  const ranked = [...courseLevels].filter(isCefrLevel).sort((a, b) => levelRank(a) - levelRank(b));
  if (ranked.length === 0) return [];

  // A learner can also start one level below the course's floor: someone at A0
  // belongs in an A1-B2 course.
  const floor = levelRank(ranked[0]!);
  const below = floor > 0 ? [CEFR_LEVELS[floor - 1]!] : [];
  return [...below, ...ranked.slice(0, -1)];
}

export function countItemsForGoal(args: {
  currentLevel: string;
  goalLevel: string;
  itemCountByLevel: Readonly<Record<string, number>>;
}): number {
  return levelsToStudy(args.currentLevel, args.goalLevel).reduce(
    (sum, level) => sum + (args.itemCountByLevel[level] ?? 0),
    0,
  );
}
