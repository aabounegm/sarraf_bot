# Builds the mini app, then ships the bot with production dependencies only.
# Node runs the TypeScript sources directly; the workspace layout is kept so that
# @sarraf/shared stays a real directory (Node refuses to strip types inside node_modules).
FROM node:24-alpine AS build
RUN npm install -g pnpm@9
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/bot/package.json apps/bot/
COPY apps/webapp/package.json apps/webapp/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @sarraf/webapp build

FROM node:24-alpine
RUN npm install -g pnpm@9 && mkdir -p /data && chown node:node /data
WORKDIR /app
ENV NODE_ENV=production
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/bot/package.json apps/bot/
COPY apps/webapp/package.json apps/webapp/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --prod --filter @sarraf/bot --filter @sarraf/shared
COPY apps/bot apps/bot
COPY packages/shared packages/shared
COPY --from=build /app/apps/webapp/dist apps/webapp/dist
USER node
EXPOSE 3000
CMD ["node", "apps/bot/src/main.ts"]
