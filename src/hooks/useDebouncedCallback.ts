import { useCallback, useEffect, useRef } from "react";

/**
 * Schedule a callback after `delayMs` of quiet time.
 * Latest args win; unmount cancels pending work.
 */
export function useDebouncedCallback<A extends unknown[]>(
  fn: (...args: A) => void,
  delayMs = 500,
): {
  schedule: (...args: A) => void;
  flush: (...args: A) => void;
  cancel: () => void;
} {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<A | null>(null);

  const cancel = useCallback(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pendingRef.current = null;
  }, []);

  const flush = useCallback((...args: A) => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pendingRef.current = null;
    fnRef.current(...args);
  }, []);

  const schedule = useCallback(
    (...args: A) => {
      pendingRef.current = args;
      if (timerRef.current != null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const pending = pendingRef.current;
        pendingRef.current = null;
        if (pending) fnRef.current(...pending);
      }, delayMs);
    },
    [delayMs],
  );

  useEffect(() => () => cancel(), [cancel]);

  return { schedule, flush, cancel };
}
