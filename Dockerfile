FROM node:18-alpine as builder

WORKDIR /app

COPY package.json yarn.lock ./

RUN yarn install

COPY . .

RUN yarn build

FROM node:18-alpine

WORKDIR /app

COPY package.json yarn.lock ./

RUN yarn install --prod

COPY --from=builder /app/dist /app/dist

CMD yarn docker