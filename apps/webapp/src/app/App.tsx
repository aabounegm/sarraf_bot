import { LocalizationProvider, Localized, type ReactLocalization } from '@fluent/react';
import { AppRoot, Placeholder } from '@telegram-apps/telegram-ui';

import '@telegram-apps/telegram-ui/dist/styles.css';

export function App({ l10n }: { l10n: ReactLocalization }) {
  return (
    <LocalizationProvider l10n={l10n}>
      <AppRoot>
        <Placeholder header={<Localized id="app-name" />} />
      </AppRoot>
    </LocalizationProvider>
  );
}
