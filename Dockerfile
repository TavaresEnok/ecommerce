FROM node:24.21.0-bookworm-slim AS dependencies
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 API_INTERNAL_URL=http://api:3001
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/media/package.json packages/media/package.json
COPY packages/purchase/package.json packages/purchase/package.json
RUN npm install --global npm@11.6.2 --no-audit --no-fund && npm ci --no-audit --no-fund
FROM dependencies AS browsers
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN npx playwright install --with-deps chromium && chmod -R a+rX /ms-playwright

FROM dependencies AS app
COPY . .
RUN npm run build
USER node

FROM browsers AS tests
COPY --from=app /app /app
USER node
CMD ["node", "--test", "tests/foundation.test.mjs"]
