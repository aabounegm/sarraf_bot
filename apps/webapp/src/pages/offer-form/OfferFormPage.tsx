import { useLocalization } from '@fluent/react';
import { formatAmount } from '@sarraf/shared';
import { useNavigate, useParams } from '@tanstack/react-router';
import { Placeholder, Snackbar, Spinner } from '@telegram-apps/telegram-ui';
import { useState } from 'react';

import { useOffer, useSaveOffer } from '../../entities/offer/api.ts';
import type { OfferDetail } from '../../entities/offer/model.ts';
import { OfferForm } from '../../features/offer-form/OfferForm.tsx';
import { useOfferForm } from '../../features/offer-form/useOfferForm.ts';
import { ApiError } from '../../shared/api/client.ts';
import { haptic } from '../../shared/lib/telegram.ts';
import { Page, PrimaryButton } from '../../shared/ui/Page.tsx';

function Form({ offer }: { offer?: OfferDetail }) {
  const { l10n } = useLocalization();
  const navigate = useNavigate();
  const form = useOfferForm(offer);
  const save = useSaveOffer(offer?.id);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!form.input) return;
    save.mutate(form.input, {
      onSuccess: (saved) => {
        haptic('success');
        navigate({ to: '/offers/$offerId', params: { offerId: String(saved.id) }, replace: true });
      },
      onError: (e) => {
        haptic('error');
        const committed = offer ? offer.availability.filled + offer.availability.reserved : 0;
        setError(
          e instanceof ApiError && e.code === 'amount-below-committed'
            ? l10n.getString('error-amount-below-committed', {
                amount: formatAmount(committed),
                currency: offer?.giveCurrency ?? '',
              })
            : l10n.getString('error-generic'),
        );
      },
    });
  };

  return (
    <>
      <OfferForm form={form} />
      <PrimaryButton
        text={l10n.getString(offer ? 'save-changes' : 'post-offer')}
        onClick={submit}
        disabled={form.input === null || save.isPending}
      />
      {error && <Snackbar onClose={() => setError(null)}>{error}</Snackbar>}
    </>
  );
}

export function NewOfferPage() {
  return (
    <Page back>
      <Form />
    </Page>
  );
}

export function EditOfferPage() {
  const { l10n } = useLocalization();
  const { offerId } = useParams({ from: '/offers/$offerId/edit' });
  const offer = useOffer(Number(offerId));
  return (
    <Page back>
      {offer.isPending && <Spinner size="l" />}
      {offer.isError && <Placeholder header={l10n.getString('error-generic')} />}
      {offer.data && <Form offer={offer.data} />}
    </Page>
  );
}
