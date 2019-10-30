const express = require('express');
const path = require('path');
const logger = require('morgan');
const fs = require('fs');
const util = require('util');

const indexRouter = require('./routes/index');
const epd = require('./modules/epd_engine');

// 将node的标准方法进行promise化，以便进行同步化处理
const readDirAsync = util.promisify(fs.readdir);
const readAsync = util.promisify(fs.readFile);

// 启动时加载全部模板对象
(async () => {
    let rulesObj = {};
    let files = await readDirAsync(path.join(__dirname, 'public', 'rules'));
    for (let file of files) {
        let data = await readAsync(path.join(__dirname, 'public', 'rules', file));
        rulesObj[file.replace('.json', '')] = JSON.parse(data);
    }
    console.log('=============All Templates Init Completed!!====================');

    for (let tplName in rulesObj) {
        epd.M_initGlobalTemplateMap(tplName, rulesObj[tplName], true);
    }
})();


const app = express();

// 设置后台日志
app.use(logger('dev'));

// 支持json的body
app.use(express.json({limit: '20mb'}));
app.use(express.urlencoded({
    limit: '20mb',
    extended: true
}));

// 设置静态文件路径
app.use(express.static(path.join(__dirname, 'public')));

// 装载路由，统一设置 / 到indexRouter路由处理器
app.use('/', indexRouter);

module.exports = app;