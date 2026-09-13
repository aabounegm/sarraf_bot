import { zValidator } from '@hono/zod-validator';
import { CURRENCY_CODES, OfferInput } from '@sarraf/shared';
import { Hono } from 'hono';
import { z } from 'zod';

import type { Db } from '../../db/index.ts';
import type { AuthEnv } from '../../http/auth.ts';
import {
  applyOfferAction,
  createOffer,
  getOffer,
  listOffers,
  listOffersByPoster,
  updateOffer,
} from './service.ts';

const idParam = z.object({ id: z.coerce.number().int().positive() });

export function offersApi(db: Db) {
  return new Hono<AuthEnv>()
    .get('/', zValidator('query', z.object({ give: z.enum(CURRENCY_CODES).optional() })), (c) =>
      c.json(listOffers(db, c.req.valid('query'))),
    )
    .get('/mine', (c) => c.json(listOffersByPoster(db, c.get('user').id)))
    .post('/', zValidator('json', OfferInput), (c) =>
      c.json(createOffer(db, c.get('user'), c.req.valid('json')), 201),
    )
    .get('/:id', zValidator('param', idParam), (c) => c.json(getOffer(db, c.req.valid('param').id)))
    .put('/:id', zValidator('param', idParam), zValidator('json', OfferInput), (c) =>
      c.json(updateOffer(db, c.get('user').id, c.req.valid('param').id, c.req.valid('json'))),
    )
    .post(
      '/:id/:action',
      zValidator('param', idParam.extend({ action: z.enum(['pause', 'resume', 'close']) })),
      (c) => {
        const { id, action } = c.req.valid('param');
        return c.json(applyOfferAction(db, c.get('user').id, id, action));
      },
    );
}
