# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Server-side fetches during `next build` (if any). Runtime browser proxy uses the same env at request time.
ARG API_INTERNAL_URL=http://api:8080
ENV API_INTERNAL_URL=$API_INTERNAL_URL
ARG NEXT_PUBLIC_API_URL=http://localhost:8080
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_LAUNCHDARKLY_CLIENT_SIDE_ID=
ENV NEXT_PUBLIC_LAUNCHDARKLY_CLIENT_SIDE_ID=$NEXT_PUBLIC_LAUNCHDARKLY_CLIENT_SIDE_ID
ARG NEXT_PUBLIC_SENTRY_DSN=
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_BRANDFETCH_CLIENT_ID=
ENV NEXT_PUBLIC_BRANDFETCH_CLIENT_ID=$NEXT_PUBLIC_BRANDFETCH_CLIENT_ID
ARG SENTRY_ORG=
ENV SENTRY_ORG=$SENTRY_ORG
ARG SENTRY_PROJECT=
ENV SENTRY_PROJECT=$SENTRY_PROJECT
ARG SENTRY_AUTH_TOKEN=
ENV SENTRY_AUTH_TOKEN=$SENTRY_AUTH_TOKEN
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
RUN chown -R nextjs:nodejs /app/.next
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["npm", "start"]
