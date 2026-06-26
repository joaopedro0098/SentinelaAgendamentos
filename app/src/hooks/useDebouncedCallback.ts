import { useCallback, useEffect, useRef } from "react";

export function useDebouncedCallback<T extends (...args: never[]) => void>(fn: T, delay = 400): T {
  const fnRef = useRef(fn);
  const timerRef = useRef<number>();
  fnRef.current = fn;

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return useCallback(
    (...args: Parameters<T>) => {
      clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => fnRef.current(...args), delay);
    },
    [delay],
  ) as T;
}
