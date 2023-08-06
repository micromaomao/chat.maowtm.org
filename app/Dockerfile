FROM node:lts
WORKDIR /usr/src/app
COPY . .
RUN npm ci && npm run build
EXPOSE 3000
CMD ["node", "-r", "ts-node/register", "src/server.ts"]
