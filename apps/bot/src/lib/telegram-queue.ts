import { GrammyError } from 'grammy';

/**
 * One Telegram call at a time, and never in the caller's face: everything the bot sends because
 * of a mutation (channel post, claim notification) is a side effect of that mutation, not part
 * of it. A failed send is logged and dropped.
 */
export function createQueue(label: string) {
  let queue: Promise<unknown> = Promise.resolve();
  return {
    push(task: () => Promise<unknown>) {
      queue = queue.then(async () => {
        try {
          await task();
        } catch (err) {
          console.error(`${label} failed`, err);
        }
        return null;
      });
    },
    /** Resolves when the queue is empty — for tests and for a clean shutdown. */
    idle: () => queue,
  };
}

/** True when Telegram refused for one of the given reasons, e.g. 'message is not modified'. */
export const complains = (err: unknown, ...reasons: string[]) =>
  err instanceof GrammyError && reasons.some((reason) => err.description.includes(reason));

/** Telegram answers 429 with the exact pause to take; every other failure is the caller's problem. */
export async function withRetry<T>(call: () => Promise<T>, attempts = 3): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await call();
    } catch (err) {
      const retryAfter = err instanceof GrammyError ? err.parameters.retry_after : undefined;
      if (retryAfter === undefined || attempt === attempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
    }
  }
}
