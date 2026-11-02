# Build from the repository root: docker build -f apps/server/Dockerfile .
FROM node:22-slim
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps/server ./apps/server
COPY content/bank ./content/bank
RUN pnpm install --frozen-lockfile --filter @setu/server...
ENV SETU_BANK_PATH=/repo/content/bank/bank.json PORT=8080
EXPOSE 8080
CMD ["pnpm", "--filter", "@setu/server", "start"]
