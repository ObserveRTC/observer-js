### STAGE 1: Build ###
FROM node:13.12.0

WORKDIR /usr/src/app
COPY __test__/example-demo .
RUN npm install

CMD [ "npm", "run", "start-server" ]

