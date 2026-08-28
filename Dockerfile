FROM node:lts-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:lts-alpine

# Зеркало Alpine. С боевого сервера dl-cdn.alpinelinux.org не отвечает вообще —
# ни по https, ни по http: соединение висит и отваливается по таймауту. 27 августа
# 2026 это уронило сборку образа (`apk add nginx` восемь минут перебирал зеркала и
# сдался), деплой при этом отчитался успехом и поднял контейнер на старом образе.
# Адрес вынесен в аргумент: сменить зеркало можно одной строкой, не трогая Dockerfile.
ARG ALPINE_MIRROR=https://mirror.yandex.ru/mirrors/alpine
RUN sed -i "s|https\?://dl-cdn.alpinelinux.org/alpine|${ALPINE_MIRROR}|g" /etc/apk/repositories \
    && apk add --no-cache nginx

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
