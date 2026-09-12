import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { createLocalization } from '../shared/lib/i18n.ts';
import { App } from './App.tsx';
import { initTelegram } from './telegram.ts';

const launch = await initTelegram();
const l10n = createLocalization(launch.tgWebAppData?.user?.language_code);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App l10n={l10n} />
  </StrictMode>,
);
