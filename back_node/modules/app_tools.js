const epd = require('./epd_engine');

const fs = require('fs');
const util = require('util');

// 将node的标准方法进行promise化，以便进行同步化处理
const readDirAsync = util.promisify(fs.readdir);
const readAsync = util.promisify(fs.readFile);

// 启动时加载全部模板对象
async function initAllTemplate(rulePath) {
    let rulesObj = {};
    let files = await readDirAsync(rulePath);
    for (let file of files) {
        let data = await readAsync(`${rulePath}/${file}`);
        rulesObj[file.replace('.json', '')] = JSON.parse(data);
    }
    console.log('=============All Templates Init Completed!!====================');

    let allTplNames = [];
    for (let tplName in rulesObj) {
        allTplNames.push(tplName);
        epd.M_initGlobalTemplateMap(tplName, rulesObj[tplName], true);
    }

    epd.M_cleanDeletedTemplate(allTplNames);
    return "ok";
}

/**
 * 简化模板函数
 */
function simplifyRuleTemplate(jsonObj) {
    let logicObj = [];
    let xyTableObj = [];
    let inputObj = [];
    let outputObj = [];

    for (let rowObj of jsonObj.CPARA_FormulaLinkup) {
        let obj = {
            PropertyName: rowObj['PropertyName'],
            Data: rowObj['Data'],
            Condition: []
        };

        rowObj['Condition'] = rowObj['Condition'] || [];

        for (let conObj of rowObj['Condition']) {
            let conCell = {
                Conditions: [],
                Results: []
            };

            for (let innerConObj of conObj['Conditions']) {
                conCell['Conditions'].push({
                    'Key': innerConObj['Key'],
                    'Value': innerConObj['Value']
                });
            }

            for (let innerResObj of conObj['Results']) {
                conCell['Results'].push({
                    'Key': innerResObj['Key'],
                    'Value': innerResObj['Value']
                });
            }
            obj['Condition'].push(conCell);
        }

        logicObj.push(obj);
    }

    for (let rowObj of jsonObj.CPARA_XYTable) {
        let obj = {
            TNo: rowObj['TNo'],
            Condition: []
        };

        rowObj['Condition'] = rowObj['Condition'] || [];
        for (let conObj of rowObj['Condition']) {
            let conCell = {
                Conditions: [],
                Results: []
            };

            for (let innerConObj of conObj['Conditions']) {
                conCell['Conditions'].push({
                    'Key': innerConObj['Key'],
                    'Value': innerConObj['Value']
                });
            }

            for (let innerResObj of conObj['Results']) {
                conCell['Results'].push({
                    'Key': innerResObj['Key'],
                    'Value': innerResObj['Value']
                });
            }

            obj['Condition'].push(conCell);
        }

        xyTableObj.push(obj);
    }

    for (let rowObj of jsonObj.CPARA_InternalParameterValueList) {
        let obj = {
            PropertyName: rowObj['PropertyName'],
            Data: {
                Type: rowObj['Data']['Type']
            }
        };
        outputObj.push(obj);
    }

    for (let rowObj of jsonObj.CPARA_InputParameterValueList) {
        let obj = {
            PropertyName: rowObj['PropertyName'],
            ValueList: rowObj['ValueList'],
            Data: {
                Type: rowObj['Data']['Type']
            }
        };
        inputObj.push(obj);
    }


    let resObj = {
        CPARA_ChangeRecord: [],
        CPARA_FormulaLinkup: logicObj,
        CPARA_Script: [],
        CPARA_XYTable: xyTableObj,
        CPARA_InternalParameterValueList: outputObj,
        CPARA_InputParameterValueList: inputObj
    };

    return resObj;
}

module.exports = {
    simplifyRuleTemplate,
    initAllTemplate
};