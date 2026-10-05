'use client';

import { motion, useReducedMotion } from 'motion/react';

/**
 * One small diagram per method. Each shows the actual mechanism rather than
 * decorating the section: what a chunk is, what i+1 means, what spacing does.
 *
 * All three use currentColor and the theme tokens, so they read correctly in
 * light and dark. Animation is suppressed when the visitor asked for less motion.
 */

const EASE = [0.22, 1, 0.36, 1] as const;

function useMotionProps(delay = 0) {
  const reduced = useReducedMotion();
  if (reduced) return { initial: false as const, animate: {}, transition: { duration: 0 } };
  return {
    initial: { opacity: 0, y: 6 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: '-60px' },
    transition: { duration: 0.5, delay, ease: EASE },
  };
}

/** Lexical Approach: four loose words collapse into one remembered chunk. */
export function LexicalDiagram() {
  const reduced = useReducedMotion();
  const words = ['wie', 'geht', 'es', 'Ihnen'];

  return (
    <svg viewBox="0 0 240 96" className="h-24 w-full" role="img" aria-labelledby="lexical-diagram-title">
      <title id="lexical-diagram-title">
        Bốn từ rời được nhớ thành một khối duy nhất thay vì bốn mảnh tách biệt
      </title>

      {/* Top row: separate words, each its own fragment. */}
      {words.map((word, index) => (
        <g key={word}>
          <rect
            x={8 + index * 58}
            y={6}
            width={48}
            height={24}
            rx={6}
            fill="var(--surface-sunken)"
            stroke="var(--border-strong)"
            strokeWidth={1}
          />
          <text
            x={32 + index * 58}
            y={22}
            textAnchor="middle"
            className="fill-fg-muted"
            style={{ fontSize: 11 }}
          >
            {word}
          </text>
        </g>
      ))}

      {/* Converging lines. */}
      {words.map((word, index) => (
        <motion.path
          key={`line-${word}`}
          d={`M ${32 + index * 58} 32 C ${32 + index * 58} 48, 120 48, 120 60`}
          stroke="var(--primary)"
          strokeWidth={1.25}
          fill="none"
          strokeLinecap="round"
          initial={reduced ? false : { pathLength: 0, opacity: 0 }}
          whileInView={{ pathLength: 1, opacity: 0.55 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 + index * 0.08, ease: EASE }}
        />
      ))}

      {/* Bottom: the single chunk actually stored. */}
      <motion.g {...useMotionProps(0.4)}>
        <rect
          x={48}
          y={62}
          width={144}
          height={28}
          rx={8}
          fill="var(--primary-subtle)"
          stroke="var(--primary)"
          strokeWidth={1.25}
        />
        <text x={120} y={80} textAnchor="middle" className="fill-fg" style={{ fontSize: 12, fontWeight: 600 }}>
          wie geht es Ihnen
        </text>
      </motion.g>
    </svg>
  );
}

/** i+1: each step repeats what is known and adds exactly one new cell. */
export function IncrementalDiagram() {
  const reduced = useReducedMotion();
  const rows = [2, 3, 4, 5];

  return (
    <svg viewBox="0 0 240 96" className="h-24 w-full" role="img" aria-labelledby="incremental-diagram-title">
      <title id="incremental-diagram-title">
        Mỗi câu tiếp theo giữ lại phần đã biết và chỉ thêm đúng một phần mới
      </title>

      {rows.map((filled, rowIndex) => (
        <g key={filled}>
          {Array.from({ length: filled }).map((_, cellIndex) => {
            const isNew = cellIndex === filled - 1;
            return (
              <motion.rect
                key={cellIndex}
                x={8 + cellIndex * 26}
                y={6 + rowIndex * 22}
                width={22}
                height={14}
                rx={3}
                fill={isNew ? 'var(--primary)' : 'var(--surface-sunken)'}
                stroke={isNew ? 'var(--primary)' : 'var(--border-strong)'}
                strokeWidth={1}
                initial={reduced ? false : { opacity: 0, scaleX: 0.4 }}
                whileInView={{ opacity: 1, scaleX: 1 }}
                viewport={{ once: true }}
                style={{ originX: 0 }}
                transition={{
                  duration: 0.3,
                  delay: rowIndex * 0.12 + (isNew ? 0.14 : 0),
                  ease: EASE,
                }}
              />
            );
          })}
          <text
            x={8 + filled * 26 + 8}
            y={17 + rowIndex * 22}
            className="fill-fg-subtle"
            style={{ fontSize: 9 }}
          >
            {rowIndex === 0 ? 'đã biết + 1 mới' : '+1'}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** Spaced repetition: memory decays, each review lifts it and flattens the curve. */
export function SpacingDiagram() {
  const reduced = useReducedMotion();
  // Review points along the x axis, spacing out as retention strengthens.
  const reviews = [40, 86, 150, 214];

  return (
    <svg viewBox="0 0 240 96" className="h-24 w-full" role="img" aria-labelledby="spacing-diagram-title">
      <title id="spacing-diagram-title">
        Đường ghi nhớ tụt dần rồi được nâng lên mỗi lần ôn, khoảng cách giữa các lần ôn giãn ra
      </title>

      <line x1={8} y1={84} x2={232} y2={84} stroke="var(--border)" strokeWidth={1} />

      {/* Decay-and-recover curve: steep at first, flatter after each review. */}
      <motion.path
        d="M 8 20 Q 24 58, 40 66 L 40 24 Q 63 60, 86 68 L 86 26 Q 118 58, 150 66 L 150 28 Q 182 54, 214 62 L 214 30 Q 223 38, 232 42"
        fill="none"
        stroke="var(--primary)"
        strokeWidth={1.75}
        strokeLinecap="round"
        initial={reduced ? false : { pathLength: 0 }}
        whileInView={{ pathLength: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.1, ease: EASE }}
      />

      {reviews.map((x, index) => (
        <motion.g
          key={x}
          initial={reduced ? false : { opacity: 0, scale: 0.6 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.25, delay: 0.3 + index * 0.18, ease: EASE }}
        >
          <line x1={x} y1={84} x2={x} y2={24} stroke="var(--border-strong)" strokeWidth={0.75} strokeDasharray="2 3" />
          <circle cx={x} cy={24} r={3.5} fill="var(--surface-raised)" stroke="var(--primary)" strokeWidth={1.75} />
        </motion.g>
      ))}

      <text x={8} y={94} className="fill-fg-subtle" style={{ fontSize: 8 }}>
        ôn lần 1
      </text>
      <text x={196} y={94} className="fill-fg-subtle" style={{ fontSize: 8 }}>
        ôn lần 4
      </text>
    </svg>
  );
}

export const METHOD_DIAGRAMS = {
  lexical: LexicalDiagram,
  sentences: IncrementalDiagram,
  srs: SpacingDiagram,
} as const;
