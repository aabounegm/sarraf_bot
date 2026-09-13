import type { ClaimInput } from '@sarraf/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, unwrap } from '../../shared/api/client.ts';
import { offerKeys } from '../offer/api.ts';
import type { OfferDetail } from '../offer/model.ts';
import type { ClaimAction, MyClaim } from './model.ts';

export const claimKeys = { all: ['claims'] as const, mine: ['claims', 'mine'] as const };

export const useMyClaims = () =>
  useQuery({
    queryKey: claimKeys.mine,
    queryFn: async () => unwrap<MyClaim[]>(await api.claims.mine.$get()),
  });

/** Both mutations answer with the offer, so the detail cache is refreshed from the response. */
function useClaimMutation<V>(mutationFn: (v: V) => Promise<OfferDetail>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (offer) => {
      queryClient.setQueryData(offerKeys.detail(offer.id), offer);
      queryClient.invalidateQueries({ queryKey: offerKeys.all });
      queryClient.invalidateQueries({ queryKey: claimKeys.all });
    },
  });
}

export const useCreateClaim = () =>
  useClaimMutation(async (input: ClaimInput) =>
    unwrap<OfferDetail>(await api.claims.$post({ json: input })),
  );

export const useClaimAction = () =>
  useClaimMutation(async ({ id, action }: { id: number; action: ClaimAction }) =>
    unwrap<OfferDetail>(
      await api.claims[':id'][':action'].$post({ param: { id: String(id), action } }),
    ),
  );
