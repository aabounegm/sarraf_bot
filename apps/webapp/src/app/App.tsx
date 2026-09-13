import { LocalizationProvider, type ReactLocalization } from '@fluent/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { AppRoot } from '@telegram-apps/telegram-ui';

import '@telegram-apps/telegram-ui/dist/styles.css';
import type { createAppRouter } from './router.tsx';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 10_000 } },
});

export function App({
  l10n,
  router,
}: {
  l10n: ReactLocalization;
  router: ReturnType<typeof createAppRouter>;
}) {
  return (
    <LocalizationProvider l10n={l10n}>
      <QueryClientProvider client={queryClient}>
        <AppRoot>
          <RouterProvider router={router} />
        </AppRoot>
      </QueryClientProvider>
    </LocalizationProvider>
  );
}
