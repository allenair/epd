FROM node:12.14

LABEL maintainer="yucai.wang@5000m.com"

RUN mkdir -p /zxtech/app
WORKDIR /zxtech/app
COPY . /zxtech/app

RUN npm set registry https://registry.npm.taobao.org/
RUN npm install

ENV EPDPATH /zxtech/app

EXPOSE 9000

CMD [ "npm", "start" ]