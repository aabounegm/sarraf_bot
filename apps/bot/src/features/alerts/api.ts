import { zValidator } from '@hono/zod-validator';
import { AlertInput } from '@sarraf/shared';
import { Hono } from 'hono';
import { z } from 'zod';

import type { Db } from '../../db/index.ts';
import type { AuthEnv } from '../../http/auth.ts';
import { applyAlertAction, listAlerts, saveAlert } from './service.ts';

const idParam = z.object({ id: z.coerce.number().int().positive() });

export function alertsApi(db: Db) {
  return (
    new Hono<AuthEnv>()
      .get('/', (c) => c.json(listAlerts(db, c.get('user').id)))
      // One route for create and edit: an alert is identified by its pair, not by an id the client picks.
      .put('/', zValidator('json', AlertInput), (c) =>
        c.json(saveAlert(db, c.get('user'), c.req.valid('json'))),
      )
      .post(
        '/:id/:action',
        zValidator('param', idParam.extend({ action: z.enum(['pause', 'resume', 'delete']) })),
        (c) => {
          const { id, action } = c.req.valid('param');
          return c.json(applyAlertAction(db, c.get('user').id, id, action));
        },
      )
  );
}
