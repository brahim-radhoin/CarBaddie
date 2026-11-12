"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";

const CELL = { type: "spring", stiffness: 520, damping: 34, mass: 0.45 } as const;
const CROSSFADE = { type: "spring", stiffness: 260, damping: 34, mass: 0.8 } as const;
const INSTANT = { duration: 0 } as const;

export type AsyncActionStatus = "idle" | "pending" | "success" | "error";

export type UseAsyncActionOptions = {
  action: () => unknown;
  resetAfter?: number;
  onError?: (error: unknown) => void;
};

export function useAsyncAction({
  action,
  resetAfter = 1400,
  onError,
}: UseAsyncActionOptions) {
  const [status, setStatus] = useState<AsyncActionStatus>("idle");

  const phase = useRef<AsyncActionStatus>("idle");
  const runId = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);

  const act = useRef(action);
  const fail = useRef(onError);

  useEffect(() => {
    act.current = action;
    fail.current = onError;
  });

  const clear = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    runId.current += 1;
    clear();
    phase.current = "idle";
    setStatus("idle");
  }, [clear]);

  const run = useCallback(() => {
    if (phase.current === "pending") return;

    clear();
    const id = ++runId.current;
    phase.current = "pending";
    setStatus("pending");

    const settle = (next: "success" | "error") => {
      if (!alive.current || id !== runId.current) return;
      clear();
      phase.current = next;
      setStatus(next);
      timer.current = setTimeout(() => {
        if (!alive.current || id !== runId.current) return;
        phase.current = "idle";
        setStatus("idle");
      }, resetAfter);
    };

    Promise.resolve()
      .then(() => act.current())
      .then(
        () => settle("success"),
        (error: unknown) => {
          fail.current?.(error);
          settle("error");
        },
      );
  }, [clear, resetAfter]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      clear();
    };
  }, [clear]);

  return {
    status,
    run,
    reset,
    pending: status === "pending",
  };
}

function Spinner({ still }: { still: boolean }) {
  return (
    <motion.svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
      animate={still ? undefined : { rotate: 360 }}
      transition={
        still ? undefined : { duration: 0.85, repeat: Infinity, ease: "linear" }
      }
    >
      <circle
        cx="6"
        cy="6"
        r="4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeOpacity="0.22"
      />
      <path
        d="M10.5 6A4.5 4.5 0 0 0 6 1.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </motion.svg>
  );
}

function CheckMark() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <path
        d="M2.6 6.3 4.9 8.6 9.4 3.6"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AlertMark() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="M6 2.9v3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M6 9.05h.01" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

export type LoadingButtonProps = {
  onAction?: () => unknown;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
  pendingLabel?: React.ReactNode;
  successLabel?: React.ReactNode;
  errorLabel?: React.ReactNode;
  resetAfter?: number;
  disabled?: boolean;
  loading?: boolean;
  onError?: (error: unknown) => void;
  type?: "button" | "submit" | "reset";
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg";
  className?: string;
};

const VARIANT_STYLES = {
  default:
    "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 focus-visible:outline-primary",
  destructive:
    "bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90 focus-visible:outline-destructive",
  outline:
    "border border-input bg-background text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground focus-visible:outline-ring",
  secondary:
    "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80 focus-visible:outline-ring",
  ghost:
    "hover:bg-accent hover:text-accent-foreground focus-visible:outline-ring",
} as const;

const SIZE_STYLES = {
  default: "h-9 px-4 text-[13px]",
  sm: "h-8 px-3 text-xs",
  lg: "h-10 px-5 text-sm",
} as const;

export function LoadingButton({
  onAction,
  onClick,
  children,
  pendingLabel = children,
  successLabel = "Done",
  errorLabel = "Try again",
  resetAfter = 1400,
  disabled = false,
  loading: externalLoading,
  onError,
  type = "button",
  variant = "default",
  size = "default",
  className = "",
}: LoadingButtonProps) {
  const reduced = useReducedMotion();

  const { status: asyncStatus, run } = useAsyncAction({
    action: onAction ?? (() => {}),
    resetAfter,
    onError,
  });

  const status: AsyncActionStatus =
    externalLoading !== undefined
      ? externalLoading
        ? "pending"
        : "idle"
      : asyncStatus;

  const pending = status === "pending";
  const fade = reduced ? INSTANT : CROSSFADE;

  const currentLabel =
    status === "pending"
      ? pendingLabel
      : status === "success"
        ? successLabel
        : status === "error"
          ? errorLabel
          : children;

  const getTone = () => {
    if (variant === "default") {
      return {
        idle: "text-primary-foreground",
        pending: "text-primary-foreground/80",
        success: "text-primary-foreground",
        error: "text-destructive-foreground",
      };
    }
    if (variant === "destructive") {
      return {
        idle: "text-destructive-foreground",
        pending: "text-destructive-foreground/80",
        success: "text-white",
        error: "text-white",
      };
    }
    return {
      idle: "text-foreground",
      pending: "text-muted-foreground",
      success: "text-emerald-600 dark:text-emerald-400",
      error: "text-destructive",
    };
  };

  const tones = getTone();

  const faces = [
    {
      key: "idle",
      content: children,
      tone: tones.idle,
      icon: null,
    },
    {
      key: "pending",
      content: pendingLabel,
      tone: tones.pending,
      icon: <Spinner still={reduced === true || !pending} />,
    },
    {
      key: "success",
      content: successLabel,
      tone: tones.success,
      icon: <CheckMark />,
    },
    {
      key: "error",
      content: errorLabel,
      tone: tones.error,
      icon: <AlertMark />,
    },
  ];

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (pending || disabled) {
      event.preventDefault();
      return;
    }
    if (onAction) {
      run();
    }
    onClick?.(event);
  };

  return (
    <>
      <motion.button
        type={type}
        disabled={disabled || pending}
        aria-busy={pending || undefined}
        aria-disabled={pending || disabled || undefined}
        whileTap={disabled || pending || reduced ? undefined : { y: 1 }}
        transition={CELL}
        onClick={handleClick}
        className={`relative inline-flex select-none items-center justify-center font-medium rounded-md outline-none transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 disabled:pointer-events-none ${VARIANT_STYLES[variant]} ${SIZE_STYLES[size]} ${className}`}
        style={{ touchAction: "manipulation" }}
      >
        <span aria-hidden className="relative grid place-items-center">
          {faces.map((face) => (
            <motion.span
              key={face.key}
              initial={false}
              animate={
                face.key === status
                  ? { opacity: 1, y: 0, filter: "blur(0px)" }
                  : { opacity: 0, y: 3, filter: "blur(3px)" }
              }
              transition={fade}
              className={`col-start-1 row-start-1 flex items-center justify-center gap-1.5 whitespace-nowrap ${face.tone}`}
            >
              {face.icon}
              <span>{face.content}</span>
            </motion.span>
          ))}
        </span>
      </motion.button>

      <span role="status" aria-live="polite" className="sr-only">
        {status === "success"
          ? typeof successLabel === "string"
            ? successLabel
            : "Success"
          : status === "error"
            ? typeof errorLabel === "string"
              ? errorLabel
              : "Error"
            : typeof currentLabel === "string"
              ? currentLabel
              : ""}
      </span>
    </>
  );
}
