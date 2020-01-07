const express = require('express');
const path = require('path');
const fs = require('fs');  
const logger = require('morgan');

const indexRouter = require('./routes/index');
const epd_tool = require('./modules/app_tools');

// 初始化模板
epd_tool.initAllTemplate(path.join(__dirname, 'public', 'rules'));

const app = express();

// 设置后台日志
app.use(logger('dev'));

var accessLogStream = fs.createWriteStream('access.log', {flags: 'a'})
app.use(logger('combined', {stream: accessLogStream}))

// 支持json的body
app.use(express.json({
    limit: '20mb'
}));
app.use(express.urlencoded({
    limit: '20mb',
    extended: true
}));

// 设置静态文件路径
app.use(express.static(path.join(__dirname, 'public')));

// 装载路由，统一设置 / 到indexRouter路由处理器
app.use('/', indexRouter);

module.exports = app;