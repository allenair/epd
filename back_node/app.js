const express = require('express');
const path = require('path');

const indexRouter = require('./routes/index');
const epd_tool = require('./modules/app_tools');
const log = require('./modules/log');

// 初始化模板
epd_tool.initAllTemplate(path.join(__dirname, 'public', 'rules'));

// 启动应用
const app = express();

// 设置access日志
log.useLogger(app)
// 设置全局日志
global.LOG = log.getLogger('info');

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