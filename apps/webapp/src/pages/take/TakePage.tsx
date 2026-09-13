import { useLocalization } from '@fluent/react';
import { fromMinor, toMinor } from '@sarraf/shared';
import { useNavigate, useParams } from '@tanstack/react-router';
import {
  Cell,
  Chip,
  Input,
  Placeholder,
  Radio,
  Section,
  Snackbar,
  Spinner,
} from '@telegram-apps/telegram-ui';
import { useState } from 'react';

import { useCreateClaim } from '../../entities/claim/api.ts';
import { payText } from '../../entities/claim/format.ts';
import { useOffer } from '../../entities/offer/api.ts';
import { amount as amountText } from '../../entities/offer/format.ts';
import type { OfferDetail } from '../../entities/offer/model.ts';
import { apiErrorText } from '../../shared/api/client.ts';
import { haptic } from '../../shared/lib/telegram.ts';
import { Page, PrimaryButton } from '../../shared/ui/Page.tsx';

const whole = (minor: number) => Math.floor(minor / 100) * 100;

/** Quarter, half and all of what is left — the round numbers a taker actually asks for. */
const quickAmounts = (remaining: number): number[] =>
  [...new Set([whole(remaining / 4), whole(remaining / 2), remaining])].filter(
    (n) => n > 0 && n <= remaining,
  );

function TakeForm({ offer }: { offer: OfferDetail }) {
  const { l10n } = useLocalization();
  const navigate = useNavigate();
  const create = useCreateClaim();
  const [value, setValue] = useState('');
  const [method, setMethod] = useState(offer.getMethods[0] ?? '');
  const [error, setError] = useState<string | null>(null);

  const remaining = offer.availability.remaining;
  const minor = toMinor(Number(value.replace(',', '.')));
  const tooMuch = minor > remaining;
  const valid = minor > 0 && !tooMuch && method !== '';

  const submit = () =>
    create.mutate(
      { offerId: offer.id, amount: minor, method },
      {
        onSuccess: () => {
          haptic('success');
          navigate({
            to: '/offers/$offerId',
            params: { offerId: String(offer.id) },
            replace: true,
          });
        },
        onError: (e) => {
          haptic('error');
          setError(apiErrorText(l10n, e, { amount: amountText(remaining, offer.giveCurrency) }));
        },
      },
    );

  return (
    <>
      <Section
        header={l10n.getString('how-much', { currency: offer.giveCurrency })}
        footer={
          tooMuch
            ? l10n.getString('error-amount-exceeds-remaining', {
                amount: amountText(remaining, offer.giveCurrency),
              })
            : l10n.getString('max-amount', { amount: amountText(remaining, offer.giveCurrency) })
        }
      >
        <Input
          className="form-input"
          type="text"
          inputMode="decimal"
          placeholder="0"
          value={value}
          status={tooMuch ? 'error' : undefined}
          onChange={(e) => setValue(e.target.value)}
          after={offer.giveCurrency}
        />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '8px 16px' }}>
          {quickAmounts(remaining).map((n) => (
            <Chip
              key={n}
              mode={minor === n ? 'mono' : 'outline'}
              onClick={() => setValue(String(fromMinor(n)))}
            >
              {n === remaining
                ? l10n.getString('all-of', { amount: amountText(n, offer.giveCurrency) })
                : amountText(n, offer.giveCurrency)}
            </Chip>
          ))}
        </div>
        {minor > 0 && <Cell readOnly subtitle={payText(l10n, offer, minor)} />}
      </Section>

      <Section
        header={l10n.getString('pay-with')}
        footer={l10n.getString('take-hint', { name: offer.poster.firstName })}
      >
        {offer.getMethods.map((m) => (
          <Cell
            key={m}
            Component="label"
            before={<Radio checked={method === m} onChange={() => setMethod(m)} />}
          >
            {m}
          </Cell>
        ))}
      </Section>

      <PrimaryButton
        text={l10n.getString('request-amount', {
          amount: amountText(minor > 0 ? minor : remaining, offer.giveCurrency),
        })}
        onClick={submit}
        disabled={!valid || create.isPending}
      />
      {error && <Snackbar onClose={() => setError(null)}>{error}</Snackbar>}
    </>
  );
}

export function TakePage() {
  const { l10n } = useLocalization();
  const { offerId } = useParams({ from: '/offers/$offerId/take' });
  const offer = useOffer(Number(offerId));
  return (
    <Page back>
      {offer.isPending && (
        <Placeholder>
          <Spinner size="l" />
        </Placeholder>
      )}
      {offer.isError && <Placeholder header={l10n.getString('error-generic')} />}
      {offer.data && <TakeForm offer={offer.data} />}
    </Page>
  );
}
