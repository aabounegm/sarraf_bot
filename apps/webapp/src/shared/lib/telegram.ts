import {
  backButton,
  hapticFeedback,
  init,
  isTMA,
  mainButton,
  miniApp,
  mockTelegramEnv,
  popup,
  retrieveLaunchParams,
  themeParams,
} from '@telegram-apps/sdk-react';
import { useEffect } from 'react';

let mocked = false;
let currentUserId: number | undefined;

/** True when running in a plain browser with a mocked Telegram environment (development only). */
export const isMocked = () => mocked;
export const getCurrentUserId = () => currentUserId;

/**
 * Boots the Telegram SDK. In a plain browser during development the environment is mocked with
 * initData signed by the API's dev endpoint, so API calls are accepted as a fake user.
 */
export async function initTelegram() {
  if (import.meta.env.DEV && !isTMA()) {
    mocked = true;
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
  for (const component of [miniApp, themeParams]) {
    if (component.mountSync.isAvailable()) {
      component.mountSync();
      component.bindCssVars();
    }
  }
  if (mainButton.mount.isAvailable()) mainButton.mount();
  if (backButton.mount.isAvailable()) backButton.mount();
  const launch = retrieveLaunchParams();
  currentUserId = launch.tgWebAppData?.user?.id;
  return launch;
}

/** Drives Telegram's native main button. In the mocked environment `PrimaryButton` renders a fallback. */
export function useMainButton(params: { text: string; onClick: () => void; enabled?: boolean }) {
  const { text, onClick, enabled = true } = params;
  useEffect(() => {
    if (mocked || !mainButton.setParams.isAvailable()) return;
    mainButton.setParams({ isVisible: true });
    return () => mainButton.setParams({ isVisible: false });
  }, []);
  useEffect(() => {
    if (mocked || !mainButton.setParams.isAvailable()) return;
    mainButton.setParams({ text, isEnabled: enabled });
  }, [text, enabled]);
  useEffect(() => {
    if (mocked || !mainButton.onClick.isAvailable()) return;
    return mainButton.onClick(onClick);
  }, [onClick]);
}

/** Shows Telegram's native back button while `enabled`, calling `onBack` when pressed. */
export function useBackButton(onBack: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled || mocked || !backButton.show.isAvailable()) return;
    backButton.show();
    return () => backButton.hide();
  }, [enabled]);
  useEffect(() => {
    if (!enabled || mocked || !backButton.onClick.isAvailable()) return;
    return backButton.onClick(onBack);
  }, [enabled, onBack]);
}

export function haptic(type: 'success' | 'error' | 'warning') {
  if (hapticFeedback.notificationOccurred.isAvailable()) hapticFeedback.notificationOccurred(type);
}

export async function confirmDialog(message: string, ok: string, cancel: string): Promise<boolean> {
  if (!popup.show.isAvailable()) return window.confirm(message);
  const pressed = await popup.show({
    message,
    buttons: [
      { id: 'ok', type: 'destructive', text: ok },
      { id: 'cancel', type: 'default', text: cancel },
    ],
  });
  return pressed === 'ok';
}
