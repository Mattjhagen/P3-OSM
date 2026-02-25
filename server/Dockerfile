# ---- build stage ----
FROM node:20-bookworm AS build
WORKDIR /app

# Install deps
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# ---- runtime stage ----
FROM node:20-bookworm
WORKDIR /app
ENV NODE_ENV=production

# Install prod deps only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled output
COPY --from=build /app/dist ./dist

# Cloud Run uses PORT env var (usually 8080)
ENV PORT=8080
EXPOSE 8080

CMD ["node", "dist/index.js"]
