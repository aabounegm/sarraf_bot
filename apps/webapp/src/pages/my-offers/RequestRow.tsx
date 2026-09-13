import { useLocalization } from '@fluent/react';
import { Avatar, Cell } from '@telegram-apps/telegram-ui';

import type { MyClaim } from '../../entities/claim/model.ts';

/** One line of "Your requests": what you asked for, from whom, and where it stands. */
export function RequestRow({
  claim,
  label,
  onClick,
}: {
  claim: MyClaim;
  label: string;
  onClick: () => void;
}) {
  const { l10n } = useLocalization();
  return (
    <Cell
      before={<Avatar size={40} acronym={claim.poster.firstName.slice(0, 1).toUpperCase()} />}
      subtitle={l10n.getString(`request-${claim.status}`, { name: claim.poster.firstName })}
      onClick={onClick}
    >
      {l10n.getString('request-from', { amount: label, name: claim.poster.firstName })}
    </Cell>
  );
}
