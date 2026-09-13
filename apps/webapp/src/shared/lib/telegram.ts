import {
  backButton,
  emitEvent,
  hapticFeedback,
  init,
  isTMA,
  mainButton,
  miniApp,
  mockTelegramEnv,
  openTelegramLink,
  popup,
  retrieveLaunchParams,
  themeParams,
} from '@telegram-apps/sdk-react';
import { useEffect } from 'react';

/** Telegram Android light theme, as used by the design prototype. */
const MOCK_THEME = {
  accent_text_color: '#1c93e3',
  bg_color: '#ffffff',
  bottom_bar_bg_color: '#f0f0f0',
  button_color: '#50a8eb',
  button_text_color: '#ffffff',
  destructive_text_color: '#cc2929',
  header_bg_color: '#527da3',
  hint_color: '#a8a8a8',
  link_color: '#2678b6',
  secondary_bg_color: '#f0f0f0',
  section_bg_color: '#ffffff',
  section_header_text_color: '#3a95d5',
  section_separator_color: '#d9d9d9',
  subtitle_text_color: '#82868a',
  text_color: '#222222',
} as const;
const NO_INSETS = { left: 0, top: 0, right: 0, bottom: 0 } as const;

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
  // 'complete' really probes Telegram. The sync isTMA() only checks that launch params are
  // retrievable, which stays true after a reload because mockTelegramEnv persists them.
  if (import.meta.env.DEV && !(await isTMA('complete'))) {
    mocked = true;
    // `?user=2` in the browser's URL becomes a second fake identity (see http/index.ts).
    const initData = await (await fetch(`/api/dev/init-data${window.location.search}`)).text();
    mockTelegramEnv({
      launchParams: {
        tgWebAppPlatform: 'android',
        tgWebAppVersion: '8.0',
        tgWebAppThemeParams: MOCK_THEME,
        tgWebAppData: initData,
      },
      // Answer the requests the SDK may make, as in the SDK docs' mocking example.
      onEvent([name]) {
        if (name === 'web_app_request_theme')
          emitEvent('theme_changed', { theme_params: MOCK_THEME });
        if (name === 'web_app_request_viewport') {
          emitEvent('viewport_changed', {
            height: window.innerHeight,
            width: window.innerWidth,
            is_expanded: true,
            is_state_stable: true,
          });
        }
        if (name === 'web_app_request_content_safe_area')
          emitEvent('content_safe_area_changed', NO_INSETS);
        if (name === 'web_app_request_safe_area') emitEvent('safe_area_changed', NO_INSETS);
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

/**
 * Opens a DM with the other side of a confirmed deal. Only handles can be linked to from a mini
 * app, so callers must hide the entry point when `username` is null (the bot's own buttons can
 * still reach those users by id).
 */
export function openChat(username: string) {
  const url = `https://t.me/${username}`;
  if (openTelegramLink.isAvailable()) openTelegramLink(url);
  else window.open(url, '_blank');
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
