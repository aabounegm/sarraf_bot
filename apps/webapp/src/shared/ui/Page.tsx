import { useLocalization } from '@fluent/react';
import { useRouter } from '@tanstack/react-router';
import { Button, FixedLayout } from '@telegram-apps/telegram-ui';
import type { ReactNode } from 'react';

import { isMocked, useBackButton, useMainButton } from '../lib/telegram.ts';

/** Screen wrapper: wires Telegram's back button (with a visible fallback when mocked). */
export function Page({ back = false, children }: { back?: boolean; children: ReactNode }) {
  const router = useRouter();
  const { l10n } = useLocalization();
  const canBack = back && router.history.canGoBack();
  useBackButton(() => router.history.back(), canBack);
  return (
    <div style={{ paddingBottom: isMocked() ? 88 : 0 }}>
      {canBack && isMocked() && (
        <Button mode="plain" size="s" onClick={() => router.history.back()}>
          ← {l10n.getString('back')}
        </Button>
      )}
      {children}
    </div>
  );
}

/** The screen's primary action: Telegram's native main button, or an in-page button when mocked. */
export function PrimaryButton({
  text,
  onClick,
  disabled = false,
}: {
  text: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  useMainButton({ text, onClick, enabled: !disabled });
  if (!isMocked()) return null;
  return (
    <FixedLayout
      vertical="bottom"
      style={{ padding: 16, background: 'var(--tg-theme-bottom-bar-bg-color)' }}
    >
      <Button size="l" stretched disabled={disabled} onClick={onClick}>
        {text}
      </Button>
    </FixedLayout>
  );
}
