const log4js = require('log4js');
const path = require('path');

const currentPath = process.env.LOGPATH || path.join(__dirname, 'logs');

log4js.configure({
    replaceConsole: true,
    appenders: {
        stdout: { //控制台输出
            type: 'console'
        },
        trace: {
            type: 'dateFile',
            filename: currentPath + '/tracelog/',
            pattern: 'trace-yyyy-MM-dd.log',
            alwaysIncludePattern: true
        },
        debug: {
            type: 'dateFile',
            filename: currentPath + '/debuglog/',
            pattern: 'debug-yyyy-MM-dd.log',
            alwaysIncludePattern: true
        },
        info: {
            type: 'dateFile',
            filename: currentPath + '/infolog/',
            pattern: 'info-yyyy-MM-dd.log',
            alwaysIncludePattern: true
        },
        warn: {
            type: 'dateFile',
            filename: currentPath + '/warnlog/',
            pattern: 'warn-yyyy-MM-dd.log',
            alwaysIncludePattern: true
        },
        error: {
            type: 'dateFile',
            filename: currentPath + '/errorlog/',
            pattern: 'error-yyyy-MM-dd.log',
            alwaysIncludePattern: true
        },
        fatal: {
            type: 'dateFile',
            filename: currentPath + '/fatallog/',
            pattern: 'fatal-yyyy-MM-dd.log',
            alwaysIncludePattern: true
        },
    },
    categories: {
        trace: {
            appenders: ['stdout', 'trace'],
            level: 'trace'
        }, //appenders:采用的appender,取appenders项,level:设置级别
        debug: {
            appenders: ['stdout', 'debug'],
            level: 'debug'
        },
        default: {
            appenders: ['stdout', 'info'],
            level: 'info'
        },
        warn: {
            appenders: ['stdout', 'warn'],
            level: 'warn'
        },
        error: {
            appenders: ['stdout', 'error'],
            level: 'error'
        },
        fatal: {
            appenders: ['stdout', 'fatal'],
            level: 'fatal'
        },
    }
})

module.exports.getLogger = function (name) { //name取categories项
    return log4js.getLogger(name || 'info')
}

module.exports.useLogger = function (app, logger) { //用来与express结合
    app.use(log4js.connectLogger(logger || log4js.getLogger('info'), {
        format: '[:remote-addr :method :url :status :response-timems][:referrer HTTP/:http-version :user-agent]' //自定义输出格式
    }))
}