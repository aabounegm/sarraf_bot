import type { InferResponseType } from 'hono/client';

import type { api } from '../../shared/api/client.ts';

export type Alert = InferResponseType<typeof api.alerts.$get, 200>[number];
/** Mirrors the API's action enum. */
export type AlertAction = 'pause' | 'resume' | 'delete';
