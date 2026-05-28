FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
COPY pnpm-workspace.yaml package.json .npmrc tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY packages/review-agent/package.json packages/review-agent/
RUN pnpm install --frozen-lockfile=false --filter @cicd-agent/review-agent... --prod=false

FROM deps AS build
COPY packages/core packages/core
COPY packages/review-agent packages/review-agent
RUN pnpm --filter @cicd-agent/core build
RUN pnpm --filter @cicd-agent/review-agent build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
COPY --from=build /app/pnpm-workspace.yaml /app/package.json /app/.npmrc ./
COPY --from=build /app/packages/core/package.json packages/core/
COPY --from=build /app/packages/core/dist packages/core/dist
COPY --from=build /app/packages/review-agent/package.json packages/review-agent/
COPY --from=build /app/packages/review-agent/dist packages/review-agent/dist
RUN pnpm install --filter @cicd-agent/review-agent... --prod
EXPOSE 8080
CMD ["node", "packages/review-agent/dist/bin.js"]
