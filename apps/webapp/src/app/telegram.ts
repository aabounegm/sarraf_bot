import {
  init,
  isTMA,
  miniApp,
  mockTelegramEnv,
  retrieveLaunchParams,
  themeParams,
} from '@telegram-apps/sdk-react';

/**
 * Boots the Telegram SDK. In a plain browser during development the environment is mocked with
 * initData signed by the API's dev endpoint, so API calls are accepted as a fake user.
 */
export async function initTelegram() {
  if (import.meta.env.DEV && !isTMA()) {
    const initData = await (await fetch('/api/dev/init-data')).text();
    mockTelegramEnv({
      launchParams: {
        tgWebAppPlatform: 'android',
        tgWebAppVersion: '8.0',
        tgWebAppThemeParams: {},
        tgWebAppData: initData,
      },
    });
  }
  init();
  if (miniApp.mountSync.isAvailable()) {
    miniApp.mountSync();
    miniApp.bindCssVars();
  }
  if (themeParams.mountSync.isAvailable()) {
    themeParams.mountSync();
    themeParams.bindCssVars();
  }
  return retrieveLaunchParams();
}
