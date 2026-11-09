FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
# Refuse to start with a weak session secret, apply pending migrations, then start.
CMD ["sh", "-c", "[ ${#AUTH_SECRET} -ge 32 ] || { echo 'AUTH_SECRET must be at least 32 characters (openssl rand -base64 32)'; exit 1; }; npx prisma migrate deploy && npx next start -p 3000"]
