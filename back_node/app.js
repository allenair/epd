var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');

var indexRouter = require('./routes/index');


const fs = require('fs');
const util = require('util');
const epd = require('./modules/epd_engine');
const readDirAsync = util.promisify(fs.readdir);
const readAsync = util.promisify(fs.readFile);

// 启动时加载全部模板对象
(async () => {
    let rulesObj = {};
    let files = await readDirAsync(path.join(__dirname, 'rules'));
    for (let file of files) {
        let data = await readAsync(path.join(__dirname, 'rules', file));
        rulesObj[file.replace('.json', '')] = JSON.parse(data);
    }
    console.log('=============All Templates Init Completed!!====================');

    for (let tplName in rulesObj) {
        epd.M_initGlobalTemplateMap(tplName, rulesObj[tplName], true);
    }
})();


var app = express();

app.use(logger('dev'));
app.use(express.json({limit: '20mb'}));
app.use(express.urlencoded({
    limit: '20mb',
    extended: true
}));
app.use(cookieParser());

app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);

module.exports = app;