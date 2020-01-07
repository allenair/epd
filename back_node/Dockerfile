FROM node:12.14

RUN mkdir -p /zxtech/app
WORKDIR /zxtech/app
COPY . /zxtech/app

RUN npm set registry https://registry.npm.taobao.org/
RUN npm install

EXPOSE 9000

CMD [ "npm", "start" ]