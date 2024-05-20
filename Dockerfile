FROM node:20

WORKDIR /usr/src/app

COPY scheduler.js scheduler.js
COPY scrap.js scrap.js

CMD ["node", "scheduler.js", "/config.json"]
