import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { createLocalization } from '../shared/lib/i18n.ts';
import { initTelegram } from '../shared/lib/telegram.ts';
import { App } from './App.tsx';
import { createAppRouter } from './router.tsx';

const launch = await initTelegram();
const l10n = createLocalization(launch.tgWebAppData?.user?.language_code);
const router = createAppRouter(launch.tgWebAppStartParam);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App l10n={l10n} router={router} />
  </StrictMode>,
);
