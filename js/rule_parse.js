"use strict";

// 目前（2019-10）的计算还没有实现3D变量，结构已经支持，明确计算方式后，需要修改_realCalResult函数

/** 
 * 1、传入参数options结构：
 * 示例：
 *          options = {
 *              "name": "DN1", // 模板名称
                "template": templateJsonString,
                "inputParameters": [   // target代表目标参数名，src代表所赋的值，还有一个type参数默认为空，如果为‘map’则代表此时src属性代表的是源参数名（target参数的值需要与此相同）
                    {"target": "Es_Angle", "src": "30"},
                    {"target": "Es_TH", "src": "1000"},
                    {"target": "Es_HD", "src": "7000"},
                    {"target": "Es_SW", "src": "800"},
                    {"target": "Es_TBS", "src": "10"},
                    {"target": "Es_BBS", "src": "20"},
                    {"target": "Es_PIT_L", "src": "30"},
                    {"target": "System_lang", "src": "CN"},
                ],
                "initialFlag": false // 全部初始化，当作为程序入口时设置为true，循环进入的模板不用设置，保持为false
            };
 * 2、接口函数：calResultByRule，返回值为整合输入与输出参数的 name, value 对的json结构（结构类似inputParameters）
 * 3、主要结构：为方便计算，需要对模板进行精简处理，主要由参数（包含输入和输出）和逻辑两个内部结构支撑引擎的计算
 * （1）参数，对象，unionParaMap, 全局参数列表
 * 示例：
 * {
 *      "Es_Angle": {
 *          "name": "Es_Angle",
 *          "scope": "30,35",
 *          "type": "S", // 此处S代表简单值，M代表数组类型（3D变量）
 *          "value": "30",
 *          "isNum": true, // 此处为内部计算时候避免字符串相加的问题（乳沟都为字符串则数字相加会变为字符串拼接）
 *          "from": "input" // 取值input，output
 *      },
 *      ...
 * }
 * （2）逻辑，数组，logicUnits
 * 示例：
 * [
 *      {
 *          "name": "TN1", // 此处一般与output的值相对应，此处允许同时为多个值赋值，例如“TN1,TN2,TN9”以英文逗号分隔
 *          "calUnit": {
 *              "params": ["Es_SW", "Es_Angle"], // 一维数组，值是计算依赖的变量名，此处的值应该存在于input或output的变量中
 *              "values": [                      // 二维数组，每一个内部数组代表此条件的要求值，内部数组的长度需要与条件参数的个数一样（params数组长度）
 *                  [“600”, "30"], ["800,1000", "30"]
 *                  ...
 *              ],
 *              "formulas": [                    // 二维数组，此数组一维的长度应该与values数组的一维长度相同，内部二维的长度应该不小于name指定的参数个数（逗号分隔后），此处中的计算使用eval进行
 *                  ["ROUND(Es_TH*1.732+5185,0)", null, null, ...],
 *                  ...
 *              ]
 *          }
 *      },
 *      ...
 * ]
 * （3）XY表格存储，tableCalculateMap，此处数据是不可改变的，因此可以按照模板名称进行分割存储，eval调用时通过传入模板名称进行调用
 * 示例：
 * {
 *      "TEST": {
 *          "T1": {
 *              "tbNum": "T1",
 *              "conditionArray": [
 *                  {
 *                      "M_PRJ_TYPE": "fds", 
 *                      "N301": "10",
 *                      "RZZ043": "YES",
 *                      "ZZ088": "(10,20]",
 *                      "TB123": "YES",
 *                      "TS30": "SDAF"
 *                  },
 *                  ...
 *              ],
 *              "resultArray": [
 *                  {
 *                      "R:1": 1, 
 *                      "R:2": 2
 *                  },
 *                  ...
 *              ]
 *          },
 * 
 *          "T2": {},
 *          ...
 *      }
 * }
 * 
*/
const epd = {
    unionParaMap: {},
    tableCalculateMap: {},

    registerGlFunction: function (fun) {
        if (fun && Object.prototype.toString.call(fun) === '[object Function]') {
            epdtool._outerFunction = fun;
        }
    },

    calResultByRule: function (options) {
        const tplName = options['name'] || 'TEST';
        if (options['initialFlag']) {
            this.unionParaMap = {};
            this.tableCalculateMap = {};
        }

        // 根据模板形成内部处理结构
        this._initParamtersFromTemplate(options["template"]);
        this._initXYTableFromTemplate(options["template"], tplName);
        const logicUnits = this._initLogicUnitFromTemplate(options["template"]);

        // 设置执行单元（支持循环）
        const excuteCells = this._arrangeExcuteCell(logicUnits);

        // 设置传入的初始化的值
        this._setInputsValue(options['inputParameters']);

        // 进行实际计算
        let logic;
        for (let cell of excuteCells) {
            // 数组长度大于1代表是循环
            if (cell['step'].length > 1) {
                let flag = true;
                while (flag) {
                    for (let index = 0; index < cell['step'].length; index++) {
                        logic = logicUnits[cell['step'][index]];
                        let res = this._realCalResult(logic['name'], logic['calUnit'], tplName);
                        if (index == 0) {
                            flag = res;
                        }
                    }
                }

            } else {
                logic = logicUnits[cell['step'][0]];
                this._realCalResult(logic['name'], logic['calUnit'], tplName);
            }
        }

        return this._combineParamters();
    },

    _initParamtersFromTemplate: function (tplObj) {
        const inputObj = tplObj['CPARA_InputParameterValueList'];
        for (let obj of inputObj) {
            let name = obj['PropertyName'];
            if (!this.unionParaMap[name]) {
                let inMap = {};
                inMap['name'] = name;
                inMap['scope'] = obj['ValueList'] || '';
                inMap['type'] = 'S';
                inMap['value'] = '';
                inMap['isNum'] = false;
                inMap['from'] = 'input';
                this.unionParaMap[name] = inMap;
            }
        }

        const outputObj = tplObj['CPARA_InternalParameterValueList'];
        for (let obj of outputObj) {
            let name = obj['PropertyName'];
            if (!this.unionParaMap[name]) {
                let inMap = {};
                inMap['name'] = name;
                inMap['scope'] = obj['ValueList'] || '';
                inMap['type'] = 'S';
                inMap['value'] = 'NA'
                inMap['isNum'] = false;
                inMap['from'] = 'output';
                this.unionParaMap[name] = inMap;
            }
        }
    },

    _initXYTableFromTemplate: function (tplObj, tplName) {
        const xyObj = tplObj['CPARA_XYTable'];
        const tableObj = {};
        for (let obj of xyObj) {
            let innerObj = {};
            innerObj['tbNum'] = obj['TNo'];
            innerObj['conditionArray'] = [];
            innerObj['resultArray'] = [];

            for (let conObj of obj['Condition']) {
                let conCell = {};
                for (let innerConObj of conObj['Conditions']) {
                    conCell[innerConObj['Key']] = innerConObj['Value'];
                }
                innerObj['conditionArray'].push(conCell);

                let resCell = {};
                for (let innerResObj of conObj['Results']) {
                    resCell[innerResObj['Key']] = innerResObj['Value'];
                }
                innerObj['resultArray'].push(resCell);
            }

            tableObj[innerObj['tbNum']] = innerObj;
        }
        this.tableCalculateMap[tplName] = tableObj;
    },

    _initLogicUnitFromTemplate: function (tplObj) {
        const logicObj = tplObj['CPARA_FormulaLinkup'];
        const logicUnits = [];

        for (let obj of logicObj) {
            let inMap = {};
            inMap['name'] = obj['PropertyName'];
            inMap['calUnit'] = {
                'params': [],
                'values': [],
                'formulas': []
            };

            if (obj['Condition']) {
                let conObj = obj['Condition'];

                let paramSet = new Set();
                for (let innerObj of conObj) {
                    // 处理变量名和取值
                    let innerCondArr = innerObj['Conditions'];
                    let valueArr = [];
                    for (let singleCondObj of innerCondArr) {
                        // 按照结构，变量名称只赋值一次
                        paramSet.add(singleCondObj['Key']);
                        valueArr.push(singleCondObj['Value']);
                    }
                    inMap['calUnit']['values'].push(valueArr);

                    // 处理计算公式
                    let innerResultArr = innerObj['Results'];
                    let formulaArr = [];
                    for (let singleResObj of innerResultArr) {
                        formulaArr.push(epdtool._dealFormularStr(singleResObj['Value']));
                    }
                    inMap['calUnit']['formulas'].push(formulaArr);
                }
                inMap['calUnit']['params'] = [...paramSet];

            } else {
                let dataObj = obj['Data'];
                let formulaArr = [];
                for (let key in dataObj) {
                    if (key === 'ID') {
                        continue;
                    }
                    formulaArr.push(epdtool._dealFormularStr(dataObj[key]));
                }
                inMap['calUnit']['formulas'].push(formulaArr);
            }

            logicUnits.push(inMap);
        }

        return logicUnits;
    },

    // 依照执行单元编制执行顺序，目的是将同一个循环单元放置在一个cell中执行
    _arrangeExcuteCell: function (logicUnits) {
        const excuteCells = [];
        let cell = {};

        let loopFlag = false;
        for (let index = 0; index < logicUnits.length; index++) {
            let logic = logicUnits[index];

            if (logic['name'] === '#DO WHILE') {
                loopFlag = true;
                cell = {
                    'step': [index]
                };

            } else if (logic['name'] === '#LOOP') {
                loopFlag = false;
                excuteCells.push(cell);

            } else {
                if (loopFlag) {
                    cell['step'].push(index);

                } else {
                    cell = {
                        'step': [index]
                    };
                    excuteCells.push(cell);
                }
            }
        }

        return excuteCells;
    },

    _setInputsValue: function (inputParameters) {
        let target, src, inputType, isNum;
        for (let obj of inputParameters) {
            target = obj['target'];
            src = epdtool._realValue(obj['src']);
            isNum = false;

            if (!this.unionParaMap[target]) {
                this.unionParaMap[target] = {};
                this.unionParaMap[target]['name'] = target;
                this.unionParaMap[target]['scope'] = '';
                this.unionParaMap[target]['from'] = 'input';
            }

            // 此时是需要使用src代表的参数的值给target参数赋值
            if (obj['type'] && obj['type'] === 'map') {
                this.unionParaMap[target]['value'] = this.unionParaMap[src]['value'];
                this.unionParaMap[target]['type'] = this.unionParaMap[src]['type'];
                this.unionParaMap[target]['isNum'] = this.unionParaMap[src]['isNum'];

            } else {
                let inputVal = src;
                if (inputVal.toString().indexOf(',') > -1) {
                    inputType = 'M';
                    if (ISNUMBER(inputVal.split(',')[0])) {
                        isNum = true;
                    }
                } else {
                    inputType = 'S';
                    if (ISNUMBER(inputVal)) {
                        isNum = true;
                    }
                }
                this.unionParaMap[target]['value'] = inputVal;
                this.unionParaMap[target]['type'] = inputType;
                this.unionParaMap[target]['isNum'] = isNum;
            }
        }
    },

    _updateValue: function (name, value) {
        let isNum = false;
        value = epdtool._realValue(value);
        if (ISNUMBER(value)) {
            isNum = true;
        }
        if (this.unionParaMap[name]) {
            this.unionParaMap[name]['value'] = value;
            this.unionParaMap[name]['isNum'] = isNum;
            return true;
        }

        return false;
    },

    _realCalResult: function (name, calUnit, tplName) {
        let excuteFlag = true;

        // 标记是否是循环 #DO WHILE 方法
        let loopFlag = false;

        // 标记是否是GetValuesFromGL方法
        let valuesFromGlFlag = false;

        let nameArr = [];
        if (name === '#DO WHILE') {
            loopFlag = true;
            nameArr.push(name);

        } else if (name.startsWith('#')) {
            valuesFromGlFlag = true;
            nameArr = name.substring(1).split(',');

        } else if (name.indexOf(',') > -1) {
            nameArr = name.split(',');

        } else {
            nameArr.push(name);
        }

        const contextDeclareStr = this._getDeclareParamterStr() + " var tplName='" + tplName + "'; ";
        const conParamArr = calUnit['params'];
        const conValueArr2D = calUnit['values'];
        const formulaArr2D = calUnit['formulas'];

        for (let name of nameArr) {
            this._updateValue(name, 'NA');
        }

        // 没有条件直接根据公式计算结果
        if (conParamArr.length == 0) {
            if (valuesFromGlFlag) {
                let paramValueArr = eval(contextDeclareStr + formulaArr2D[0][0]);
                let minLen = MIN(nameArr.length, paramValueArr.length);
                for (let nindex = 0; nindex < minLen; nindex++) {
                    this._updateValue(nameArr[nindex], paramValueArr[nindex]);
                }

            } else {
                for (let nindex in nameArr) {
                    nindex = parseInt(nindex);
                    let paramValue = eval(contextDeclareStr + formulaArr2D[0][nindex]);
                    if (loopFlag) {
                        return epdtool._realValue(paramValue);
                    }
                    this._updateValue(nameArr[nindex], paramValue);
                }
            }

        } else { // 根据变量以及条件计算值
            for (let vindex in conValueArr2D) {
                let flag = false;
                for (let pindex in conParamArr) {
                    pindex = parseInt(pindex);
                    flag = this._checkCondition(conParamArr[pindex], conValueArr2D[vindex][pindex]);
                    if (!flag) {
                        break;
                    }
                }

                if (flag) {
                    for (let nindex in nameArr) {
                        nindex = parseInt(nindex);
                        let paramValue = eval(contextDeclareStr + formulaArr2D[vindex][nindex]);
                        if (loopFlag) {
                            return epdtool._realValue(paramValue);
                        }
                        this._updateValue(nameArr[nindex], paramValue);
                    }
                    break;
                }
            }
        }

        return excuteFlag;
    },

    _checkCondition: function (name, conStr) {
        if (conStr === 'ELSE' || conStr === 'ANY') {
            if (this.unionParaMap[name]['value'] === 'NA') {
                return false;
            } else {
                return true;
            }

        } else if (conStr === 'ALL') {
            if (this.unionParaMap[name] && this.unionParaMap[name]['from'] === 'input') {
                return epdtool._checkParam(this.unionParaMap[name]['value'], this.unionParaMap[name]['scope']);
            }

        } else if (conStr.startsWith('@')) {
            let paraName = conStr.substring(1);
            return epdtool._checkParam(this.unionParaMap[name]['value'], this.unionParaMap[paraName]['value']);

        } else {
            if (this.unionParaMap[name]) {
                return epdtool._checkParam(this.unionParaMap[name]['value'], conStr);
            }
        }

        return false;
    },

    _getDeclareParamterStr: function () {
        const paramArr = [];
        let valStr;

        for (let name in this.unionParaMap) {
            if (this.unionParaMap[name]['isNum']) {
                valStr = " = " + this.unionParaMap[name]['value'] + "";
            } else {
                valStr = " = '" + this.unionParaMap[name]['value'] + "'";
            }
            paramArr.push("var " + this.unionParaMap[name]['name'] + valStr);
        }

        return paramArr.join('; ') + '; ';
    },

    _combineParamters: function () {
        const resParamters = {};
        for (let name in this.unionParaMap) {
            resParamters[this.unionParaMap[name]['name']] = ISNA(this.unionParaMap[name]['value']) ? 'NA' : this.unionParaMap[name]['value'];
        }
        return resParamters;
    },

    _queryTableFunction: function (TNo, RNo, inputParaArr) {
        let tableObj = this.tableCalculateMap[tplName];
        console.log("_queryTableFunction > tplName: "+tplName);
        console.log(tableObj);


    }
};