import { zValidator } from '@hono/zod-validator';
import { ClaimInput } from '@sarraf/shared';
import { Hono } from 'hono';
import { z } from 'zod';

import type { Db } from '../../db/index.ts';
import type { AuthEnv } from '../../http/auth.ts';
import { applyClaimAction, createClaim, listClaimsByTaker } from './service.ts';

const actionParam = z.object({
  id: z.coerce.number().int().positive(),
  action: z.enum(['confirm', 'decline', 'cancel', 'release', 'done']),
});

/** Every action answers with the offer, so one response refreshes both sides of the handshake. */
export function claimsApi(db: Db) {
  return new Hono<AuthEnv>()
    .get('/mine', (c) => c.json(listClaimsByTaker(db, c.get('user').id)))
    .post('/', zValidator('json', ClaimInput), (c) =>
      c.json(createClaim(db, c.get('user'), c.req.valid('json')), 201),
    )
    .post('/:id/:action', zValidator('param', actionParam), (c) => {
      const { id, action } = c.req.valid('param');
      return c.json(applyClaimAction(db, c.get('user').id, id, action));
    });
}
