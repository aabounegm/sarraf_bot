import { useLocalization } from '@fluent/react';
import { useNavigate } from '@tanstack/react-router';
import { InlineButtons } from '@telegram-apps/telegram-ui';

import { useOfferAction } from '../../entities/offer/api.ts';
import type { OfferSummary } from '../../entities/offer/model.ts';
import { confirmDialog, haptic } from '../../shared/lib/telegram.ts';

/** Pause/Resume · Edit · Close for an offer the current user posted. */
export function OfferActions({ offer }: { offer: OfferSummary }) {
  const { l10n } = useLocalization();
  const navigate = useNavigate();
  const action = useOfferAction();
  const finished = offer.status !== 'active' && offer.status !== 'paused';
  if (finished) return null;

  const close = async () => {
    if (
      !(await confirmDialog(
        l10n.getString('close-confirm'),
        l10n.getString('close'),
        l10n.getString('cancel'),
      ))
    )
      return;
    action.mutate({ id: offer.id, action: 'close' }, { onSuccess: () => haptic('success') });
  };

  return (
    <InlineButtons mode="bezeled">
      <InlineButtons.Item
        text={l10n.getString(offer.status === 'paused' ? 'resume' : 'pause')}
        onClick={() =>
          action.mutate({ id: offer.id, action: offer.status === 'paused' ? 'resume' : 'pause' })
        }
      />
      <InlineButtons.Item
        text={l10n.getString('edit')}
        onClick={() =>
          navigate({ to: '/offers/$offerId/edit', params: { offerId: String(offer.id) } })
        }
      />
      <InlineButtons.Item text={l10n.getString('close')} onClick={close} />
    </InlineButtons>
  );
}
