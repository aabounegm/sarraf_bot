import { useLocalization } from '@fluent/react';
import { Avatar, Cell } from '@telegram-apps/telegram-ui';
import type { ReactNode } from 'react';

import { availabilityText, dealsText, expiryText, rateText } from '../../entities/offer/format.ts';
import { COLOR_OK, COLOR_WARN, type OfferSummary } from '../../entities/offer/model.ts';

export function OfferCard({
  offer,
  onClick,
  after,
}: {
  offer: OfferSummary;
  onClick?: () => void;
  after?: ReactNode;
}) {
  const { l10n } = useLocalization();
  const status = availabilityText(l10n, offer);
  const paused = offer.status === 'paused';
  return (
    <Cell
      before={<Avatar size={40} acronym={offer.poster.firstName.slice(0, 1).toUpperCase()} />}
      subtitle={rateText(l10n, offer)}
      description={
        <>
          <div>{[...offer.giveMethods, ...offer.getMethods].join(' · ')}</div>
          <div style={{ color: paused ? undefined : status.partial ? COLOR_WARN : COLOR_OK }}>
            {paused ? l10n.getString('status-paused') : status.main}
            {status.extra.map((line) => (
              <span key={line} style={{ color: COLOR_WARN }}>
                {' · '}
                {line}
              </span>
            ))}
          </div>
          <div>
            {offer.poster.firstName}, {dealsText(l10n, offer.poster.deals)}
          </div>
        </>
      }
      after={
        after ?? (
          <span style={{ color: 'var(--tg-theme-hint-color)', fontSize: 13 }}>
            {expiryText(l10n, offer.expiresAt)}
          </span>
        )
      }
      multiline
      onClick={onClick}
    >
      {offer.giveAmount / 100} {offer.giveCurrency} → {offer.getCurrency}
    </Cell>
  );
}
