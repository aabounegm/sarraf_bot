import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { I18n } from '@grammyjs/i18n';

import type { BotContext } from './index.ts';

// The bot and the mini app read the same Fluent files from @sarraf/shared.
const localesDir = dirname(fileURLToPath(import.meta.resolve('@sarraf/shared/locales/en.ftl')));

/** Middleware for replies (`ctx.t`), and `i18n.t(locale, …)` where there is no user: the channel post. */
export const i18n = new I18n<BotContext>({
  defaultLocale: 'en',
  directory: localesDir,
  useSession: true,
  // Telegram renders plain text: Fluent's bidi isolation marks would break @mention autolinking.
  fluentBundleOptions: { useIsolating: false },
});
