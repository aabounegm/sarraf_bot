import { useLocalization } from '@fluent/react';
import { CURRENCY_CODES, type Currency } from '@sarraf/shared';
import { useNavigate } from '@tanstack/react-router';
import {
  Chip,
  List,
  Placeholder,
  Section,
  SegmentedControl,
  Spinner,
} from '@telegram-apps/telegram-ui';
import { useState } from 'react';

import { useOffers } from '../../entities/offer/api.ts';
import { Page, PrimaryButton } from '../../shared/ui/Page.tsx';
import { OfferCard } from '../../widgets/offer-card/OfferCard.tsx';

export function BrowsePage() {
  const { l10n } = useLocalization();
  const navigate = useNavigate();
  const [give, setGive] = useState<Currency | undefined>();
  const offers = useOffers(give);

  return (
    <Page>
      <div style={{ padding: 8 }}>
        <SegmentedControl>
          <SegmentedControl.Item selected>{l10n.getString('nav-offers')}</SegmentedControl.Item>
          <SegmentedControl.Item onClick={() => navigate({ to: '/my' })}>
            {l10n.getString('nav-my-offers')}
          </SegmentedControl.Item>
        </SegmentedControl>
      </div>
      <Section header={l10n.getString('looking-for')} footer={l10n.getString('requested-hint')}>
        <div style={{ display: 'flex', gap: 8, padding: '8px 16px', overflowX: 'auto' }}>
          <Chip mode={give === undefined ? 'mono' : 'outline'} onClick={() => setGive(undefined)}>
            {l10n.getString('anything')}
          </Chip>
          {CURRENCY_CODES.map((c) => (
            <Chip key={c} mode={give === c ? 'mono' : 'outline'} onClick={() => setGive(c)}>
              {c}
            </Chip>
          ))}
        </div>
        {offers.isPending && <Spinner size="m" />}
        {offers.data?.length === 0 && (
          <Placeholder
            header={l10n.getString('no-offers')}
            description={l10n.getString('no-offers-hint')}
          />
        )}
        <List>
          {offers.data?.map((o) => (
            <OfferCard
              key={o.id}
              offer={o}
              onClick={() =>
                navigate({ to: '/offers/$offerId', params: { offerId: String(o.id) } })
              }
            />
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
