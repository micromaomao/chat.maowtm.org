FROM node:lts
WORKDIR /usr/src/app
COPY . .
RUN npm install
EXPOSE 3000
CMD ["node", "-r", "ts-node/register", "src/server.ts"]
