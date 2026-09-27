import { type Currency, currencyLabel } from '@sarraf/shared';
import { Cell, Chip, Multiselectable } from '@telegram-apps/telegram-ui';

/** One currency out of a row of chips — the offer form's picker, and the alert form's. */
export function Chips<T extends Currency>({
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
        <Chip
          key={o}
          mode={o === value ? 'mono' : 'outline'}
          onClick={() => onChange(o)}
          style={{ whiteSpace: 'nowrap' }}
        >
          {currencyLabel(o)}
        </Chip>
      ))}
    </div>
  );
}

/** The payment methods of one currency, as many as apply. */
export function MethodList({
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
