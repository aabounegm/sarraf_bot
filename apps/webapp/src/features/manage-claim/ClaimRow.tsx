import { useLocalization } from '@fluent/react';
import { Avatar, Button, Cell } from '@telegram-apps/telegram-ui';

import { useClaimAction } from '../../entities/claim/api.ts';
import type { Claim } from '../../entities/claim/model.ts';
import { amount } from '../../entities/offer/format.ts';
import type { OfferDetail } from '../../entities/offer/model.ts';
import { haptic, openChat } from '../../shared/lib/telegram.ts';

/** One request on an offer the viewer posted: confirm/decline it, then mark it done. */
export function ClaimRow({ offer, claim }: { offer: OfferDetail; claim: Claim }) {
  const { l10n } = useLocalization();
  const action = useClaimAction();
  const pending = claim.status === 'pending';
  const run = (a: 'confirm' | 'decline' | 'done') =>
    action.mutate({ id: claim.id, action: a }, { onSuccess: () => haptic('success') });

  return (
    <Cell
      multiline
      before={<Avatar size={28} acronym={claim.taker.firstName.slice(0, 1).toUpperCase()} />}
      subtitle={
        pending ? l10n.getString('asks-if-available') : l10n.getString(`claim-${claim.status}`)
      }
      description={
        <span style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
          {pending && (
            <>
              <Button size="s" onClick={() => run('confirm')}>
                {l10n.getString('confirm')}
              </Button>
              <Button
                size="s"
                mode="plain"
                style={{ color: 'var(--tg-theme-destructive-text-color)' }}
                onClick={() => run('decline')}
              >
                {l10n.getString('decline')}
              </Button>
            </>
          )}
          {claim.status === 'confirmed' && (
            <>
              {claim.taker.username && (
                <Button size="s" onClick={() => openChat(claim.taker.username!)}>
                  {l10n.getString('message-user', { name: claim.taker.firstName })}
                </Button>
              )}
              {!claim.posterDone && (
                <Button size="s" mode="bezeled" onClick={() => run('done')}>
                  {l10n.getString('mark-done')}
                </Button>
              )}
            </>
          )}
        </span>
      }
    >
      {claim.taker.firstName} · {amount(claim.amount, offer.giveCurrency)}
      {/* Earned by a confirmed claim (the API reveals it then), and shown as text as well as in
          the button — the same rule the bot's card follows. */}
      {claim.status === 'confirmed' && claim.taker.username && ` · @${claim.taker.username}`}
    </Cell>
  );
}
