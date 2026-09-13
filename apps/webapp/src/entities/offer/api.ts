import type { Currency, OfferInput } from '@sarraf/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, unwrap } from '../../shared/api/client.ts';
import type { MyOffer, OfferAction, OfferDetail, OfferSummary } from './model.ts';

export const offerKeys = {
  all: ['offers'] as const,
  list: (give?: Currency) => ['offers', 'list', give ?? 'any'] as const,
  detail: (id: number) => ['offers', 'detail', id] as const,
  mine: ['offers', 'mine'] as const,
};

export const useOffers = (give?: Currency) =>
  useQuery({
    queryKey: offerKeys.list(give),
    queryFn: async () =>
      unwrap<OfferSummary[]>(await api.offers.$get({ query: give ? { give } : {} })),
  });

export const useOffer = (id: number) =>
  useQuery({
    queryKey: offerKeys.detail(id),
    queryFn: async () =>
      unwrap<OfferDetail>(await api.offers[':id'].$get({ param: { id: String(id) } })),
  });

export const useMyOffers = () =>
  useQuery({
    queryKey: offerKeys.mine,
    queryFn: async () => unwrap<MyOffer[]>(await api.offers.mine.$get()),
  });

/** Creates when `offerId` is undefined, otherwise replaces the offer's editable fields. */
export function useSaveOffer(offerId?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: OfferInput) =>
      unwrap<OfferDetail>(
        offerId === undefined
          ? await api.offers.$post({ json: input })
          : await api.offers[':id'].$put({ param: { id: String(offerId) }, json: input }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: offerKeys.all }),
  });
}

export function useOfferAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, action }: { id: number; action: OfferAction }) =>
      unwrap<OfferDetail>(
        await api.offers[':id'][':action'].$post({ param: { id: String(id), action } }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: offerKeys.all }),
  });
}
