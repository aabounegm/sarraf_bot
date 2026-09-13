import { useLocalization } from '@fluent/react';
import { useNavigate } from '@tanstack/react-router';
import { List, Placeholder, Section, SegmentedControl, Spinner } from '@telegram-apps/telegram-ui';

import { useMyOffers } from '../../entities/offer/api.ts';
import { OfferActions } from '../../features/manage-offer/OfferActions.tsx';
import { Page, PrimaryButton } from '../../shared/ui/Page.tsx';
import { OfferCard } from '../../widgets/offer-card/OfferCard.tsx';

export function MyOffersPage() {
  const { l10n } = useLocalization();
  const navigate = useNavigate();
  const offers = useMyOffers();

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
        {offers.isPending && <Spinner size="m" />}
        {offers.data?.length === 0 && <Placeholder header={l10n.getString('no-my-offers')} />}
        <List>
          {offers.data?.map((o) => (
            <div key={o.id}>
              <OfferCard
                offer={o}
                after={
                  <span style={{ color: 'var(--tg-theme-hint-color)', fontSize: 13 }}>#{o.id}</span>
                }
                onClick={() =>
                  navigate({ to: '/offers/$offerId', params: { offerId: String(o.id) } })
                }
              />
              <div style={{ padding: '0 16px 12px' }}>
                {o.status === 'active' || o.status === 'paused' ? (
                  <OfferActions offer={o} />
                ) : (
                  <span style={{ color: 'var(--tg-theme-hint-color)', fontSize: 13 }}>
                    {l10n.getString(`status-${o.status}`)}
                  </span>
                )}
              </div>
            </div>
          ))}
        </List>
      </Section>
      <PrimaryButton
        text={l10n.getString('post-offer')}
        onClick={() => navigate({ to: '/offers/new' })}
      />
    </Page>
  );
}
