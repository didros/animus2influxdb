FROM node:10.17.0

WORKDIR /usr/src/app
COPY package.json .
COPY package-lock.json .
RUN npm install
COPY js-animus.js .
#PROD 
COPY .env.template .env
#DEV 
# COPY .env .env
RUN apt-get update
RUN apt-get install nano

CMD [ "npm", "start" ]

