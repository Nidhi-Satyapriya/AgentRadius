import { useCallback, useEffect, useRef, useState } from "react";

export type AsyncState<T> =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "success"; readonly data: T }
  | { readonly status: "error"; readonly message: string };

/**
 * Runs an async task, discarding results from superseded or unmounted calls.
 * `run` and `reset` are stable across renders even when `task` is an inline closure.
 */
export function useAsyncTask<A extends unknown[], T>(task: (...args: A) => Promise<T>) {
  const [state, setState] = useState<AsyncState<T>>({ status: "idle" });
  const generation = useRef(0);
  const taskRef = useRef(task);
  useEffect(() => {
    taskRef.current = task;
  });
  useEffect(() => () => void (generation.current += 1), []);
  const run = useCallback((...args: A) => {
    const id = ++generation.current;
    setState({ status: "loading" });
    taskRef.current(...args).then(
      (data) => id === generation.current && setState({ status: "success", data }),
      (error: unknown) =>
        id === generation.current &&
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Request failed",
        }),
    );
  }, []);
  const reset = useCallback(() => {
    generation.current += 1;
    setState({ status: "idle" });
  }, []);
  return { state, run, reset };
}
