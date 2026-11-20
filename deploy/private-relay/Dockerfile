FROM node:24.21.0-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY server.mjs admission.mjs ./
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 8080
CMD ["node", "server.mjs"]
