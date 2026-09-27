import { useLocalization } from '@fluent/react';
import { CURRENCY_CODES, CURRENCY_METHODS, type Currency } from '@sarraf/shared';
import { Button, Cell, Placeholder, Section, Switch } from '@telegram-apps/telegram-ui';
import { type ReactNode, useState } from 'react';

import { useAlertAction, useAlerts, useSaveAlert } from '../../entities/alert/api.ts';
import type { Alert } from '../../entities/alert/model.ts';
import { haptic } from '../../shared/lib/telegram.ts';
import { Page, PrimaryButton } from '../../shared/ui/Page.tsx';
import { Chips, MethodList } from '../../shared/ui/Pickers.tsx';
import { NavTabs } from '../../widgets/nav/NavTabs.tsx';

const toggle = (list: string[], set: (v: string[]) => void, method: string) =>
  set(list.includes(method) ? list.filter((m) => m !== method) : [...list, method]);

/** TelegramUI ships no trash icon, and one path is cheaper than a dependency. */
const TrashIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" />
  </svg>
);

/** The row's own controls are not the row: tapping one must not also load it into the form. */
const Stop = ({ children }: { children: ReactNode }) => (
  <span onClick={(e) => e.stopPropagation()}>{children}</span>
);

/** "DM me when someone posts USDT → RUB": the alerts you have, and the form that adds one. */
export function AlertsPage() {
  const { l10n } = useLocalization();
  const alerts = useAlerts();
  const action = useAlertAction();
  const save = useSaveAlert();

  const [give, setGive] = useState<Currency>('USDT');
  const [get, setGet] = useState<Currency>('RUB');
  const [giveMethods, setGiveMethods] = useState<string[]>([]);
  const [getMethods, setGetMethods] = useState<string[]>([]);

  // The pair is the alert's identity, so switching one side keeps the two different and clears the
  // methods that belonged to the currency that is gone.
  const pick = (side: 'give' | 'get') => (value: Currency) => {
    if (side === 'give') {
      setGive(value);
      setGiveMethods([]);
      if (value === get) setGet(CURRENCY_CODES.find((c) => c !== value)!);
    } else {
      setGet(value);
      setGetMethods([]);
    }
  };
  // Tapping a row fills the form with it — which is also how the truncated method list is read in
  // full, and how it is changed: the pair is the alert's identity, so saving it is the edit.
  const edit = (alert: Alert) => {
    setGive(alert.giveCurrency);
    setGet(alert.getCurrency);
    setGiveMethods(alert.giveMethods);
    setGetMethods(alert.getMethods);
  };
  const watched = alerts.data?.some((a) => a.giveCurrency === give && a.getCurrency === get);

  const methodsText = (alert: Alert) =>
    [
      alert.giveMethods.length > 0 && `${alert.giveCurrency}: ${alert.giveMethods.join(', ')}`,
      alert.getMethods.length > 0 && `${alert.getCurrency}: ${alert.getMethods.join(', ')}`,
    ]
      .filter(Boolean)
      .join(' · ') || l10n.getString('alert-any-method');

  return (
    <Page>
      <NavTabs active="/alerts" />

      <Section header={l10n.getString('nav-alerts')} footer={l10n.getString('alert-list')}>
        {alerts.data?.length === 0 && <Placeholder header={l10n.getString('alert-none')} />}
        {alerts.data?.map((alert) => (
          <Cell
            key={alert.id}
            subtitle={methodsText(alert)}
            onClick={() => edit(alert)}
            before={
              <Stop>
                <Switch
                  checked={!alert.paused}
                  onChange={() =>
                    action.mutate({ id: alert.id, action: alert.paused ? 'resume' : 'pause' })
                  }
                />
              </Stop>
            }
            after={
              <Stop>
                <Button
                  mode="plain"
                  size="s"
                  aria-label={l10n.getString('delete')}
                  style={{ color: 'var(--tg-theme-destructive-text-color)' }}
                  onClick={() =>
                    action.mutate(
                      { id: alert.id, action: 'delete' },
                      { onSuccess: () => haptic('success') },
                    )
                  }
                >
                  <TrashIcon />
                </Button>
              </Stop>
            }
          >
            {l10n.getString('alert-pair', { give: alert.giveCurrency, get: alert.getCurrency })}
          </Cell>
        ))}
      </Section>

      <Section header={l10n.getString('alert-give')}>
        <Chips options={CURRENCY_CODES} value={give} onChange={pick('give')} />
        <Cell readOnly subtitle={l10n.getString('alert-methods-hint')} />
        <MethodList
          options={CURRENCY_METHODS[give]}
          selected={giveMethods}
          onToggle={(m) => toggle(giveMethods, setGiveMethods, m)}
        />
      </Section>

      <Section header={l10n.getString('alert-get')} footer={l10n.getString('alert-duplicate-hint')}>
        <Chips
          options={CURRENCY_CODES.filter((c) => c !== give)}
          value={get}
          onChange={pick('get')}
        />
        <Cell readOnly subtitle={l10n.getString('alert-methods-hint')} />
        <MethodList
          options={CURRENCY_METHODS[get]}
          selected={getMethods}
          onToggle={(m) => toggle(getMethods, setGetMethods, m)}
        />
      </Section>

      <PrimaryButton
        text={l10n.getString(watched ? 'alert-update' : 'alert-add')}
        disabled={save.isPending}
        onClick={() =>
          save.mutate(
            { giveCurrency: give, getCurrency: get, giveMethods, getMethods },
            { onSuccess: () => haptic('success') },
          )
        }
      />
    </Page>
  );
}
