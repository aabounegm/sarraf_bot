import { type Api, GrammyError, type InlineKeyboard } from 'grammy';

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

/**
 * Telegram refuses a whole message over a `tg://user?id=` link to someone whose privacy settings
 * forbid linking to them. Dropping that one button is the answer: the message still has to arrive,
 * and the buttons the deal runs on ([Mark as done], [Release]) have nothing to do with the refusal.
 */
export function withoutUserLinks(markup: InlineKeyboard | undefined) {
  const rows = (markup?.inline_keyboard ?? [])
    .map((row) => row.filter((b) => !('url' in b && b.url.startsWith('tg://'))))
    .filter((row) => row.length > 0);
  return rows.length > 0 ? { inline_keyboard: rows } : undefined;
}

/** Someone who blocked the bot still sees everything in the mini app; that is not an error here. */
export const sendDm = (api: Api, to: number, text: string, reply_markup?: InlineKeyboard) =>
  withRetry(() => api.sendMessage(to, text, { reply_markup }))
    .catch((err: unknown) => {
      if (!reply_markup || !complains(err, 'BUTTON_')) throw err;
      return withRetry(() =>
        api.sendMessage(to, text, { reply_markup: withoutUserLinks(reply_markup) }),
      );
    })
    .catch((err: unknown) => {
      if (!complains(err, 'bot was blocked', 'chat not found', 'user is deactivated')) throw err;
      // Logged, not thrown: the handshake stands, but a dropped DM is why someone "got nothing".
      console.warn(`dm to ${to} dropped`, (err as GrammyError).description);
    });

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
