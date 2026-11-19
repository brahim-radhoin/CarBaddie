"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";

const CELL = { type: "spring", stiffness: 520, damping: 34, mass: 0.45 } as const;

const SEG_BASE = "text-center text-[13px] font-medium leading-[18px] whitespace-nowrap";
const SEG_PAD = { default: "px-3 py-[7px]", compact: "px-2 py-[5px]" } as const;

export type SegmentedOption = {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
  /** Spoken name when the label is an icon or other non-text node. */
  ariaLabel?: string;
};

export type SegmentedControlProps = {
  options: SegmentedOption[];
  label: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Tighter cells, for icon-only controls in small spaces. */
  compact?: boolean;
  className?: string;
};

export function SegmentedControl({
  options,
  label,
  value,
  defaultValue,
  onValueChange,
  compact = false,
  className = "",
}: SegmentedControlProps) {
  const SEG = `${SEG_BASE} ${SEG_PAD[compact ? "compact" : "default"]}`;
  const count = Math.max(1, options.length);
  const template = `repeat(${count}, minmax(0, 1fr))`;

  const [internal, setInternal] = useState(
    () => defaultValue ?? options[0]?.value ?? "",
  );
  const [hovered, setHovered] = useState(-1);

  const controlled = value !== undefined;
  const current = controlled ? value : internal;
  const found = options.findIndex((o) => o.value === current);
  const index = found < 0 ? 0 : found;

  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const emit = useRef(onValueChange);
  emit.current = onValueChange;

  const reduced = useReducedMotion();
  const pos = useMotionValue(index);
  const thumbX = useTransform(pos, (v) => `${v * 100}%`);
  const maskX = useTransform(pos, (v) => `${v * -100}%`);

  useEffect(() => {
    if (reduced) {
      pos.set(index);
      return;
    }
    const controls = animate(pos, index, CELL);
    return () => controls.stop();
  }, [index, reduced, pos]);

  const select = useCallback(
    (next: string) => {
      if (!controlled) setInternal(next);
      if (next !== current) emit.current?.(next);
    },
    [controlled, current],
  );

  const seek = useCallback(
    (from: number, dir: number) => {
      let i = from;
      for (let k = 0; k < count; k++) {
        i = (i + dir + count) % count;
        if (!options[i]?.disabled) return i;
      }
      return from;
    },
    [count, options],
  );

  const go = useCallback(
    (i: number) => {
      const option = options[i];
      if (!option || option.disabled) return;
      buttons.current[i]?.focus();
      select(option.value);
    },
    [options, select],
  );

  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      go(seek(i, 1));
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      go(seek(i, -1));
    } else if (e.key === "Home") {
      e.preventDefault();
      go(seek(count - 1, 1));
    } else if (e.key === "End") {
      e.preventDefault();
      go(seek(0, -1));
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`relative inline-block select-none rounded-[9px] border border-border bg-secondary p-[3px] dark:bg-background ${className}`}
    >
      <div
        className="relative grid"
        style={{ gridTemplateColumns: template, touchAction: "manipulation" }}
      >
        {options.map((option, i) => (
          <span
            key={option.value}
            aria-hidden
            className={`${SEG} pointer-events-none ${
              option.disabled
                ? "text-muted-foreground/40"
                : hovered === i && i !== index
                  ? "text-foreground"
                  : "text-muted-foreground"
            }`}
          >
            {option.label}
          </span>
        ))}

        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 overflow-hidden rounded-[6px] bg-card shadow-[0_1px_2px_rgba(0,0,0,0.08),0_0_0_1px_var(--border)] dark:bg-secondary"
          style={{ width: `${100 / count}%`, x: thumbX }}
          initial={false}
        >
          <motion.div
            className="absolute inset-0"
            style={{ x: maskX }}
            initial={false}
          >
            <div
              className="absolute inset-y-0 left-0 grid"
              style={{ width: `${count * 100}%`, gridTemplateColumns: template }}
            >
              {options.map((option) => (
                <span
                  key={option.value}
                  className={`${SEG} text-foreground`}
                >
                  {option.label}
                </span>
              ))}
            </div>
          </motion.div>
        </motion.div>
        <div
          className="absolute inset-0 grid"
          style={{ gridTemplateColumns: template }}
          onPointerLeave={() => setHovered(-1)}
        >
          {options.map((option, i) => (
            <button
              key={option.value}
              ref={(node) => {
                buttons.current[i] = node;
              }}
              type="button"
              role="radio"
              aria-checked={i === index}
              aria-disabled={option.disabled || undefined}
              tabIndex={i === index ? 0 : -1}
              onClick={() => !option.disabled && select(option.value)}
              onKeyDown={(e) => onKeyDown(e, i)}
              onPointerEnter={() => !option.disabled && setHovered(i)}
              className="cursor-default rounded-[6px] outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--ring)]"
            >
              <span className="sr-only">
                {option.ariaLabel ?? (typeof option.label === "string" ? option.label : option.value)}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
