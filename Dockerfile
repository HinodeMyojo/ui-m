FROM node:lts-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:lts-alpine
RUN apk add --no-cache nginx

WORKDIR /app

# Static files
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/http.d/default.conf

# Proxy server
COPY proxy-server.mjs ./
COPY package*.json ./
RUN npm ci --omit=dev

ARG UPSTREAM_PROXY
ENV UPSTREAM_PROXY=${UPSTREAM_PROXY}

EXPOSE 8080

CMD sh -c "nginx && node /app/proxy-server.mjs"
