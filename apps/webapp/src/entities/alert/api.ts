import type { AlertInput } from '@sarraf/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, unwrap } from '../../shared/api/client.ts';
import type { Alert, AlertAction } from './model.ts';

export const alertKeys = { all: ['alerts'] as const };

export const useAlerts = () =>
  useQuery({
    queryKey: alertKeys.all,
    queryFn: async () => unwrap<Alert[]>(await api.alerts.$get()),
  });

/** Creates the pair, or replaces the methods of the alert already on it. */
export function useSaveAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: AlertInput) => unwrap<Alert>(await api.alerts.$put({ json: input })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: alertKeys.all }),
  });
}

export function useAlertAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, action }: { id: number; action: AlertAction }) =>
      unwrap<Alert>(
        await api.alerts[':id'][':action'].$post({ param: { id: String(id), action } }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: alertKeys.all }),
  });
}
