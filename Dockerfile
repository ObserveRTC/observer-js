### STAGE 1: Build ###
FROM node:13.12.0

WORKDIR /usr/src/app
COPY __test__/pc1 .
RUN npm install

CMD [ "npm", "run", "start-server" ]

