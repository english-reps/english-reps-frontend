FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=build_ca \
    if [ -f /run/secrets/build_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/build_ca; fi; \
    npm ci --cache /tmp/npm-cache
FROM dependencies AS development
COPY . .
EXPOSE 3007
CMD ["npm", "run", "dev"]
FROM dependencies AS build
COPY . .
RUN npm run build
FROM nginx:1.28-alpine AS production
ENV PORT=80 API_UPSTREAM=http://api:8000 NGINX_ENVSUBST_FILTER="^(PORT|API_UPSTREAM)$"
COPY docker/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --retries=5 CMD wget -Y off -q -O /dev/null "http://127.0.0.1:${PORT}/healthz" || exit 1
