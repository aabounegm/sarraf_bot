import { useLocalization } from '@fluent/react';
import { Button, Cell, Section } from '@telegram-apps/telegram-ui';

import { useClaimAction } from '../../entities/claim/api.ts';
import { requestText } from '../../entities/claim/format.ts';
import type { Claim } from '../../entities/claim/model.ts';
import { COLOR_OK, COLOR_WARN, type OfferDetail } from '../../entities/offer/model.ts';
import { haptic, openChat } from '../../shared/lib/telegram.ts';

const Dot = ({ color }: { color: string }) => (
  <span style={{ color, fontSize: 20, lineHeight: '20px' }}>●</span>
);

/** The viewer's own request on an offer: where it stands and what they can do about it. */
export function ClaimCard({ offer, claim }: { offer: OfferDetail; claim: Claim }) {
  const { l10n } = useLocalization();
  const action = useClaimAction();
  const name = offer.poster.firstName;
  if (claim.status === 'declined' || claim.status === 'cancelled') return null;

  const pending = claim.status === 'pending';
  const run = (a: 'cancel' | 'release' | 'done') =>
    action.mutate({ id: claim.id, action: a }, { onSuccess: () => haptic('success') });

  const title = pending
    ? l10n.getString('claim-waiting', { name })
    : claim.status === 'done'
      ? l10n.getString('claim-finished')
      : claim.takerDone
        ? l10n.getString('claim-you-marked-done', { name })
        : l10n.getString('claim-yours', { name });

  // The handle in text as well as in the button, like the bot's card: a button only opens a chat,
  // and there is none at all for a poster whose handle the mini app cannot link to.
  const handle = claim.status === 'confirmed' ? offer.poster.username : null;

  return (
    <Section>
      <Cell
        multiline
        before={<Dot color={pending ? COLOR_WARN : COLOR_OK} />}
        subtitle={requestText(l10n, offer, claim)}
        description={
          pending
            ? l10n.getString('claim-waiting-hint', { name })
            : handle && l10n.getString('contact-handle', { handle })
        }
      >
        {title}
      </Cell>
      {claim.status === 'confirmed' && (
        <div style={{ display: 'flex', gap: 8, padding: '0 16px 8px' }}>
          {offer.poster.username && (
            <Button size="s" stretched onClick={() => openChat(offer.poster.username!)}>
              {l10n.getString('message-user', { name })}
            </Button>
          )}
          {!claim.takerDone && (
            <Button size="s" mode="bezeled" stretched onClick={() => run('done')}>
              {l10n.getString('mark-done')}
            </Button>
          )}
        </div>
      )}
      {claim.status !== 'done' && (
        <Button
          mode="plain"
          size="s"
          style={{ color: 'var(--tg-theme-destructive-text-color)' }}
          onClick={() => run(pending ? 'cancel' : 'release')}
        >
          {l10n.getString(pending ? 'cancel-request' : 'release-reservation')}
        </Button>
      )}
    </Section>
  );
}
