import { useLocalization } from '@fluent/react';
import { useNavigate, useParams } from '@tanstack/react-router';
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

import { isLive, isOpen } from '../../entities/claim/model.ts';
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
import { ClaimCard } from '../../features/manage-claim/ClaimCard.tsx';
import { OfferActions } from '../../features/manage-offer/OfferActions.tsx';
import { getCurrentUserId } from '../../shared/lib/telegram.ts';
import { Page, PrimaryButton } from '../../shared/ui/Page.tsx';

/** Under the row label, not in the Cell's `after` slot: a long method list has to wrap. */
function MethodChips({ methods }: { methods: string[] }) {
  return (
    <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingTop: 4 }}>
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
  const navigate = useNavigate();
  const { offerId } = useParams({ from: '/offers/$offerId' });
  const offer = useOffer(Number(offerId));

  if (offer.isPending)
    return (
      <Page back>
        <Placeholder>
          <Spinner size="l" />
        </Placeholder>
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
  const myClaims = mine ? [] : o.claims.filter((c) => c.taker.id === getCurrentUserId());
  // The open request if there is one, otherwise the last thing that happened (a completed deal).
  const myClaim = myClaims.find(isOpen) ?? myClaims.at(-1);
  // Nothing to take when it is yours, paused, gone, or you are already in the queue for it.
  const canTake =
    !mine && o.status === 'active' && o.availability.remaining > 0 && !(myClaim && isOpen(myClaim));

  const others = o.claims.filter((c) => c.id !== myClaim?.id && isLive(c));

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

      {myClaim && <ClaimCard offer={o} claim={myClaim} />}

      <Section header={l10n.getString('details')}>
        <Cell readOnly multiline description={<MethodChips methods={o.giveMethods} />}>
          {l10n.getString('gives', { name: o.poster.firstName })}
        </Cell>
        <Cell readOnly multiline description={<MethodChips methods={o.getMethods} />}>
          {l10n.getString('accepts')}
        </Cell>
        <Cell readOnly after={expiryDateText(l10n, o.expiresAt)}>
          {l10n.getString('expiry')}
        </Cell>
      </Section>

      {o.note && (
        <Section header={l10n.getString('note-from', { name: o.poster.firstName })}>
          <Cell readOnly multiline>
            {o.note}
          </Cell>
        </Section>
      )}

      {others.length > 0 && (
        <Section header={l10n.getString('other-takers')}>
          {others.map((c) => (
            <Cell key={c.id} readOnly after={l10n.getString(`claim-${c.status}`)}>
              {c.taker.firstName} · {amount(c.amount, o.giveCurrency)}
            </Cell>
          ))}
        </Section>
      )}

      <PrimaryButton
        text={l10n.getString(canTake ? 'take-offer' : 'back-to-offers')}
        onClick={() =>
          canTake
            ? navigate({ to: '/offers/$offerId/take', params: { offerId: String(o.id) } })
            : navigate({ to: '/' })
        }
      />
    </Page>
  );
}
