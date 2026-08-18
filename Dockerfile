# Pudl Frontend (React + Vite) — Multi-Stage-Build für Self-Hosting.
# Stage 1 baut das Bundle, Stage 2 liefert nur die statischen Dateien aus.
# Backend (Supabase Cloud) bleibt unberührt — hier landet ausschließlich das Frontend.

# --- Stage 1: Build ---------------------------------------------------------
FROM node:20-alpine AS build

WORKDIR /app

COPY prototype/package*.json ./
RUN npm ci

COPY prototype/ .

# VITE_*-Werte werden zur BUILD-Zeit ins Bundle eingebacken (wie bei Render).
# Werte kommen aus docker-compose.yml → build.args → .env.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

RUN npm run build

# --- Stage 2: Serve ---------------------------------------------------------
FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
