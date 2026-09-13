import { useLocalization } from '@fluent/react';
import {
  CURRENCY_CODES,
  EXPIRY_OPTIONS_HOURS,
  NOTE_MAX_LENGTH,
  convert,
  formatAmount,
  rateBase,
  toMinor,
} from '@sarraf/shared';
import {
  Cell,
  Chip,
  Input,
  Multiselectable,
  Section,
  Switch,
  Textarea,
} from '@telegram-apps/telegram-ui';

import type { useOfferForm } from './useOfferForm.ts';

type Form = ReturnType<typeof useOfferForm>;

function Chips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '8px 16px' }}>
      {options.map((o) => (
        <Chip key={o} mode={o === value ? 'mono' : 'outline'} onClick={() => onChange(o)}>
          {o}
        </Chip>
      ))}
    </div>
  );
}

function MethodList({
  options,
  selected,
  onToggle,
}: {
  options: readonly string[];
  selected: string[];
  onToggle: (m: string) => void;
}) {
  return (
    <>
      {options.map((m) => (
        <Cell
          key={m}
          Component="label"
          before={<Multiselectable checked={selected.includes(m)} onChange={() => onToggle(m)} />}
        >
          {m}
        </Cell>
      ))}
    </>
  );
}

export function OfferForm({ form }: { form: Form }) {
  const { l10n } = useLocalization();
  const { state, patch } = form;
  const base = rateBase(state.giveCurrency, state.getCurrency);
  const quote = base === state.giveCurrency ? state.getCurrency : state.giveCurrency;
  const amountNum = Number(state.giveAmount.replace(',', '.'));
  const rateNum = Number(state.rate.replace(',', '.'));
  const total =
    amountNum > 0 && rateNum > 0
      ? convert(state.giveCurrency, state.getCurrency, rateNum, toMinor(amountNum))
      : null;

  return (
    <>
      <Section header={l10n.getString('you-give')}>
        <Chips
          options={CURRENCY_CODES}
          value={state.giveCurrency}
          onChange={form.setGiveCurrency}
        />
        <Input
          className="form-input"
          type="text"
          inputMode="decimal"
          placeholder="0"
          value={state.giveAmount}
          onChange={(e) => patch({ giveAmount: e.target.value })}
          after={state.giveCurrency}
        />
        <Cell
          readOnly
          subtitle={
            state.giveCurrency === 'USDT'
              ? l10n.getString('network')
              : l10n.getString('payment-method')
          }
        />
        <MethodList
          options={form.giveMethodOptions}
          selected={state.giveMethods}
          onToggle={(m) => form.toggle('giveMethods', m)}
        />
      </Section>

      <Section header={l10n.getString('you-get')}>
        <Chips
          options={CURRENCY_CODES.filter((c) => c !== state.giveCurrency)}
          value={state.getCurrency}
          onChange={form.setGetCurrency}
        />
        <Cell readOnly subtitle={l10n.getString('payment-method-hint')} />
        <MethodList
          options={form.getMethodOptions}
          selected={state.getMethods}
          onToggle={(m) => form.toggle('getMethods', m)}
        />
      </Section>

      <Section
        header={l10n.getString(state.negotiable ? 'asking-rate-section' : 'rate-section')}
        footer={
          total !== null
            ? l10n.getString(state.negotiable ? 'total-asking' : 'total-fixed', {
                total: formatAmount(total),
                currency: state.getCurrency,
              })
            : undefined
        }
      >
        <Input
          className="form-input"
          type="text"
          inputMode="decimal"
          before={`1 ${base} =`}
          after={quote}
          placeholder="0"
          value={state.rate}
          onChange={(e) => patch({ rate: e.target.value })}
        />
        <Cell
          Component="label"
          after={
            <Switch
              checked={state.negotiable}
              onChange={(e) => patch({ negotiable: e.target.checked })}
            />
          }
          description={l10n.getString(
            state.negotiable ? 'negotiable-on-hint' : 'negotiable-off-hint',
          )}
          multiline
        >
          {l10n.getString('negotiable')}
        </Cell>
      </Section>

      <Section
        header={l10n.getString('expires-after')}
        footer={state.expiresInHours === null ? l10n.getString('expiry-none-hint') : undefined}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '8px 16px' }}>
          {[...EXPIRY_OPTIONS_HOURS, null].map((h) => (
            <Chip
              key={String(h)}
              mode={h === state.expiresInHours ? 'mono' : 'outline'}
              onClick={() => patch({ expiresInHours: h })}
            >
              {h === null
                ? l10n.getString('expiry-none')
                : l10n.getString('hours-short', { hours: h })}
            </Chip>
          ))}
        </div>
      </Section>

      <Section header={l10n.getString('notes-optional')} footer={l10n.getString('post-hint')}>
        <Textarea
          placeholder={l10n.getString('notes-placeholder')}
          value={state.note}
          maxLength={NOTE_MAX_LENGTH}
          onChange={(e) => patch({ note: e.target.value })}
        />
        <Cell readOnly subtitle={`${state.note.length}/${NOTE_MAX_LENGTH}`} />
      </Section>
    </>
  );
}
