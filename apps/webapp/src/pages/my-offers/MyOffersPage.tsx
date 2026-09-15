import { useLocalization } from '@fluent/react';
import { useNavigate } from '@tanstack/react-router';
import { List, Placeholder, Section, SegmentedControl, Spinner } from '@telegram-apps/telegram-ui';

import { useMyClaims } from '../../entities/claim/api.ts';
import { isOpen } from '../../entities/claim/model.ts';
import { useMyOffers } from '../../entities/offer/api.ts';
import { amount } from '../../entities/offer/format.ts';
import { ClaimRow } from '../../features/manage-claim/ClaimRow.tsx';
import { OfferActions } from '../../features/manage-offer/OfferActions.tsx';
import { Page, PrimaryButton } from '../../shared/ui/Page.tsx';
import { OfferCard } from '../../widgets/offer-card/OfferCard.tsx';
import { RequestRow } from './RequestRow.tsx';

export function MyOffersPage() {
  const { l10n } = useLocalization();
  const navigate = useNavigate();
  const offers = useMyOffers();
  const requests = useMyClaims();
  const openOffer = (id: number) =>
    navigate({ to: '/offers/$offerId', params: { offerId: String(id) } });

  return (
    <Page>
      <div style={{ padding: 8 }}>
        <SegmentedControl>
          <SegmentedControl.Item onClick={() => navigate({ to: '/' })}>
            {l10n.getString('nav-offers')}
          </SegmentedControl.Item>
          <SegmentedControl.Item selected>{l10n.getString('nav-my-offers')}</SegmentedControl.Item>
        </SegmentedControl>
      </div>
      <Section header={l10n.getString('posted-by-you')}>
        {offers.isPending && (
          <Placeholder>
            <Spinner size="m" />
          </Placeholder>
        )}
        {offers.data?.length === 0 && <Placeholder header={l10n.getString('no-my-offers')} />}
        <List>
          {offers.data?.map((o) => (
            <div key={o.id}>
              <OfferCard
                offer={o}
                after={
                  <span style={{ color: 'var(--tg-theme-hint-color)', fontSize: 13 }}>#{o.id}</span>
                }
                onClick={() => openOffer(o.id)}
              />
              {o.claims.filter(isOpen).map((c) => (
                <ClaimRow key={c.id} offer={o} claim={c} />
              ))}
              {/* A finished offer says so; expired also gets OfferActions' [Repost] under it. */}
              <div style={{ padding: '0 16px 12px' }}>
                {o.status !== 'active' && o.status !== 'paused' && (
                  <span
                    style={{
                      color: 'var(--tg-theme-hint-color)',
                      fontSize: 13,
                      display: 'block',
                      marginBottom: 6,
                    }}
                  >
                    {l10n.getString(`status-${o.status}`)}
                  </span>
                )}
                <OfferActions offer={o} />
              </div>
            </div>
          ))}
        </List>
      </Section>

      <Section header={l10n.getString('your-requests')}>
        {requests.data?.length === 0 && <Placeholder header={l10n.getString('no-requests')} />}
        {requests.data?.map((c) => (
          <RequestRow
            key={c.id}
            claim={c}
            label={amount(c.amount, c.giveCurrency)}
            onClick={() => openOffer(c.offerId)}
          />
        ))}
      </Section>

      <PrimaryButton
        text={l10n.getString('post-offer')}
        onClick={() => navigate({ to: '/offers/new' })}
      />
    </Page>
  );
}
