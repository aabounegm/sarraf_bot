import { useLocalization } from '@fluent/react';
import { useParams } from '@tanstack/react-router';
import {
  Avatar,
  Cell,
  Chip,
  Placeholder,
  Section,
  Spinner,
  Subheadline,
  Text,
  Title,
} from '@telegram-apps/telegram-ui';

import { useOffer } from '../../entities/offer/api.ts';
import {
  amount,
  availabilityText,
  dealsText,
  expiryDateText,
  expiryText,
  pairText,
  rateText,
} from '../../entities/offer/format.ts';
import { COLOR_OK, COLOR_WARN, type OfferDetail } from '../../entities/offer/model.ts';
import { OfferActions } from '../../features/manage-offer/OfferActions.tsx';
import { getCurrentUserId } from '../../shared/lib/telegram.ts';
import { Page } from '../../shared/ui/Page.tsx';

function MethodChips({ methods }: { methods: string[] }) {
  return (
    <span style={{ display: 'inline-flex', gap: 6 }}>
      {methods.map((m) => (
        <Chip key={m} mode="outline">
          {m}
        </Chip>
      ))}
    </span>
  );
}

function ProgressBar({ offer }: { offer: OfferDetail }) {
  const { filled, reserved } = offer.availability;
  const pct = (n: number) => `${(n / offer.giveAmount) * 100}%`;
  return (
    <div
      style={{
        height: 4,
        borderRadius: 2,
        background: 'var(--tg-theme-section-separator-color)',
        display: 'flex',
        overflow: 'hidden',
      }}
    >
      <div style={{ width: pct(filled), background: 'var(--tg-theme-hint-color)' }} />
      <div style={{ width: pct(reserved), background: COLOR_WARN }} />
    </div>
  );
}

export function OfferPage() {
  const { l10n } = useLocalization();
  const { offerId } = useParams({ from: '/offers/$offerId' });
  const offer = useOffer(Number(offerId));

  if (offer.isPending)
    return (
      <Page back>
        <Spinner size="l" />
      </Page>
    );
  if (!offer.data)
    return (
      <Page back>
        <Placeholder header={l10n.getString('error-generic')} description={offer.error?.message} />
      </Page>
    );

  const o = offer.data;
  const status = availabilityText(l10n, o);
  const mine = o.poster.id === getCurrentUserId();

  return (
    <Page back>
      <div
        style={{
          textAlign: 'center',
          padding: '24px 16px 8px',
          display: 'grid',
          gap: 6,
          justifyItems: 'center',
        }}
      >
        <Avatar size={48} acronym={o.poster.firstName.slice(0, 1).toUpperCase()} />
        <Subheadline level="2" style={{ color: 'var(--tg-theme-hint-color)' }}>
          {o.poster.firstName} · {dealsText(l10n, o.poster.deals)}
        </Subheadline>
        <Title level="1" weight="2">
          {pairText(o)}
        </Title>
        <Text style={{ color: 'var(--tg-theme-accent-text-color)' }}>{rateText(l10n, o)}</Text>
      </div>
      <div style={{ padding: '0 16px 8px' }}>
        <ProgressBar offer={o} />
        <div
          style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 13 }}
        >
          <span style={{ color: status.partial ? COLOR_WARN : COLOR_OK }}>
            {o.status === 'paused'
              ? l10n.getString('status-paused')
              : [status.main, ...status.extra].join(' · ')}
          </span>
          <span style={{ color: 'var(--tg-theme-hint-color)' }}>
            {expiryText(l10n, o.expiresAt)}
          </span>
        </div>
      </div>

      {mine && (
        <div style={{ padding: '0 16px 8px' }}>
          <OfferActions offer={o} />
        </div>
      )}

      <Section header={l10n.getString('details')}>
        <Cell after={<MethodChips methods={o.giveMethods} />}>
          {l10n.getString('gives', { name: o.poster.firstName })}
        </Cell>
        <Cell after={<MethodChips methods={o.getMethods} />}>{l10n.getString('accepts')}</Cell>
        <Cell after={l10n.getString('allowed')}>{l10n.getString('partial-amounts')}</Cell>
        <Cell after={expiryDateText(l10n, o.expiresAt)}>{l10n.getString('expiry')}</Cell>
      </Section>

      {o.note && (
        <Section header={l10n.getString('note-from', { name: o.poster.firstName })}>
          <Cell multiline>{o.note}</Cell>
        </Section>
      )}

      {o.claims.length > 0 && (
        <Section header={l10n.getString('other-takers')}>
          {o.claims.map((c) => (
            <Cell key={c.id} after={l10n.getString(`claim-${c.status}`)}>
              {c.taker.firstName} · {amount(c.amount, o.giveCurrency)}
            </Cell>
          ))}
        </Section>
      )}
    </Page>
  );
}
