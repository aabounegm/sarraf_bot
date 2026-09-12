import { FluentBundle, FluentResource } from '@fluent/bundle';
import { ReactLocalization } from '@fluent/react';
import ar from '@sarraf/shared/locales/ar.ftl?raw';
import en from '@sarraf/shared/locales/en.ftl?raw';
import ru from '@sarraf/shared/locales/ru.ftl?raw';

// Same Fluent files as the bot (@grammyjs/i18n) — one catalog for both surfaces.
const SOURCES: Record<string, string> = { en, ru, ar };
const RTL = new Set(['ar']);

export function createLocalization(requested: string | undefined) {
  const locale = requested && requested in SOURCES ? requested : 'en';
  const bundle = new FluentBundle(locale);
  bundle.addResource(new FluentResource(SOURCES[locale]!));
  document.documentElement.lang = locale;
  document.documentElement.dir = RTL.has(locale) ? 'rtl' : 'ltr';
  return new ReactLocalization([bundle]);
}
