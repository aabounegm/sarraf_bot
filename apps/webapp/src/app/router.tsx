import { parseStartParam } from '@sarraf/shared';
import {
  Outlet,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';

import { BrowsePage } from '../pages/browse/BrowsePage.tsx';
import { MyOffersPage } from '../pages/my-offers/MyOffersPage.tsx';
import { EditOfferPage, NewOfferPage } from '../pages/offer-form/OfferFormPage.tsx';
import { OfferPage } from '../pages/offer/OfferPage.tsx';

// Code-based routes (file-based routing would fight FSD's pages/ layer).
const root = createRootRoute({ component: Outlet });
const routeTree = root.addChildren([
  createRoute({ getParentRoute: () => root, path: '/', component: BrowsePage }),
  createRoute({ getParentRoute: () => root, path: '/my', component: MyOffersPage }),
  createRoute({ getParentRoute: () => root, path: '/offers/new', component: NewOfferPage }),
  createRoute({ getParentRoute: () => root, path: '/offers/$offerId', component: OfferPage }),
  createRoute({
    getParentRoute: () => root,
    path: '/offers/$offerId/edit',
    component: EditOfferPage,
  }),
]);

/** Memory history: a Mini App has no address bar; deep links arrive as Telegram's start_param. */
export function createAppRouter(startParam: string | undefined) {
  const target = parseStartParam(startParam);
  const initialPath = target ? `/offers/${target.offerId}` : '/';
  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
