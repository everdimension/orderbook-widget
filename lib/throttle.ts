export type Throttled<Args extends unknown[]> = {
  (...args: Args): void;
  cancel: () => void;
};

/** Leading + trailing throttle */
export function throttle<Args extends unknown[]>(
  fn: (...args: Args) => void,
  ms: number,
): Throttled<Args> {
  let lastInvokedAt = -Infinity;
  let pendingTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingArgs: Args | null = null;

  const invoke = () => {
    if (!pendingArgs) return;
    const args = pendingArgs;
    pendingArgs = null;
    lastInvokedAt = performance.now();
    fn(...args);
  };

  const throttled = ((...args: Args) => {
    pendingArgs = args;
    const sinceLast = performance.now() - lastInvokedAt;
    if (sinceLast >= ms) {
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        pendingTimer = null;
      }
      invoke();
    } else if (!pendingTimer) {
      pendingTimer = setTimeout(() => {
        pendingTimer = null;
        invoke();
      }, ms - sinceLast);
    }
  }) as Throttled<Args>;

  throttled.cancel = () => {
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }
    pendingArgs = null;
  };

  return throttled;
}
