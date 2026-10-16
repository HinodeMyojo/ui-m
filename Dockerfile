# Фронт собирается в CI (шаг Build), а сюда приезжает готовый dist. Раньше
# образ собирал его второй раз прямо на сервере, и с диаграммами «Архитектуры»
# (LikeC4, Mermaid, CodeMirror) vite на сервере упирался в 2 ГБ кучи и падал:
# там 0.2 ядра и мало памяти, а у раннера GitHub — 7 ГБ.
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

# Static files — собранные в CI
COPY dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/http.d/default.conf

# Proxy server
COPY proxy-server.mjs ./
COPY package*.json ./
RUN npm ci --omit=dev

ARG UPSTREAM_PROXY
ENV UPSTREAM_PROXY=${UPSTREAM_PROXY}

EXPOSE 8080

CMD sh -c "nginx && node /app/proxy-server.mjs"
