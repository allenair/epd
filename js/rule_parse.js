"use strict";

// 目前（2019-10）的计算还没有实现3D变量，结构已经支持，明确计算方式后，需要修改_realCalResult函数

/** 
 * 1、传入参数options结构：
 * 示例：
 *          options = {
                "template": templateJsonString,
                "justRun": false, // false，代表需要处理一下模板，第一次调用必须处理模板，多次调用可跳过处理模板步骤以便节省时间
                "inputParameters": { // 此处结构方式是  name, value 组成的赋值对
                    "Es_Angle": "30",
                    "Es_TH": "1000",
                    "Es_HD": "7000",
                    "Es_SW": "800",
                    "Es_TBS": "10",
                    "Es_BBS": "20",
                    "Es_PIT_L": "30",
                    "System_lang": "CN"
                }
            };
 * 2、接口函数：calResultByRule，返回值为整合输入与输出参数的 name, value 对的json结构（结构类似inputParameters）
 * 3、内部结构：为方便计算，需要对模板进行精简处理，主要由参数（包含输入和输出）和逻辑两个内部结构支撑引擎的计算
 * （1）参数，对象，unionParaMap
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
 * 
*/
var epd = {
    unionParaMap: {},
    logicUnits: [],

    calResultByRule: function (options) {
        if (!options['justRun']) {
            this.justInit(options);
        }

        // 设置传入的初始化的值
        this._setInputsValue(options['inputParameters']);

        // 进行实际计算
        for (let index in this.logicUnits) {
            this._realCalResult(this.logicUnits[index]['name'], this.logicUnits[index]['calUnit']);
        }

        return this._combineParamters();
    },

    justInit: function (options) {
        this._initParamtersFromTemplate(options["template"]);
        this._initLogicUnitFromTemplate(options["template"]);
    },

    _initParamtersFromTemplate: function (tplObj) {
        this.unionParaMap = {};

        var inputObj = tplObj['CPARA_InputParameterValueList'];
        for (let index in inputObj) {
            var obj = inputObj[index];
            var name = obj['PropertyName'];
            var inMap = {};
            inMap['name'] = name;
            inMap['scope'] = obj['ValueList'] || '';
            inMap['type'] = 'S';
            inMap['value'] = '';
            inMap['isNum'] = false;
            inMap['from'] = 'input';
            this.unionParaMap[name] = inMap
        }

        var outputObj = tplObj['CPARA_InternalParameterValueList'];
        for (let index in outputObj) {
            var obj = outputObj[index];
            var name = obj['PropertyName'];
            var inMap = {};
            inMap['name'] = name;
            inMap['scope'] = obj['ValueList'] || '';
            inMap['type'] = 'S';
            inMap['value'] = 'NA'
            inMap['isNum'] = false;
            inMap['from'] = 'output';
            this.unionParaMap[name] = inMap
        }
    },

    _initLogicUnitFromTemplate: function (tplObj) {
        var logicObj = tplObj['CPARA_FormulaLinkup'];
        this.logicUnits = [];
        for (let index in logicObj) {
            var obj = logicObj[index];
            var inMap = {};
            inMap['name'] = obj['PropertyName'];
            inMap['calUnit'] = {
                'params': [],
                'values': [],
                'formulas': []
            };

            if (obj['Condition']) {
                var conObj = obj['Condition'];

                var paramArr = [];
                for (let k in conObj) {
                    var innerObj = conObj[k];
                    // 处理变量名和取值
                    var innerCondArr = innerObj['Conditions'];
                    var valueArr = [];
                    for (let kk in innerCondArr) {
                        var singleCondObj = innerCondArr[kk];
                        // 按照结构，变量名称只赋值一次
                        if (k == 0) {
                            paramArr.push(singleCondObj['Key']);
                        }
                        valueArr.push(singleCondObj['Value']);
                    }
                    inMap['calUnit']['values'].push(valueArr);

                    // 处理计算公式
                    var innerResultArr = innerObj['Results'];
                    var formulaArr = [];
                    for (let kk in innerResultArr) {
                        var singleResObj = innerResultArr[kk];
                        formulaArr.push(singleResObj['Value']);
                    }
                    inMap['calUnit']['formulas'].push(formulaArr);
                }
                inMap['calUnit']['params'] = paramArr;


            } else {
                var dataObj = obj['Data'];
                var formulaArr = [];
                for (let key in dataObj) {
                    if (key === 'ID') {
                        continue;
                    }
                    formulaArr.push(dataObj[key]);
                }
                inMap['calUnit']['formulas'].push(formulaArr);
            }

            this.logicUnits.push(inMap);
        }
    },

    _setInputsValue: function (inputParameters) {
        var inputVal, inputType, isNum;
        for (let key in inputParameters) {
            inputVal = inputParameters[key] || '';
            isNum = false;
            if (inputVal.indexOf(',') > -1) {
                inputType = 'M';
                if (ISNUMBER(inputType.split(',')[0])) {
                    isNum = true;
                }
            } else {
                inputType = 'S';
                if (ISNUMBER(inputType)) {
                    isNum = true;
                }
            }

            if (this.unionParaMap[key]) {
                this.unionParaMap[key]['value'] = inputVal;
                this.unionParaMap[key]['type'] = inputType;
                this.unionParaMap[key]['isNum'] = isNum;
            }
        }
    },

    _updateValue: function (name, value) {
        var isNum = false;
        if (ISNUMBER(value)) {
            value = parseFloat(value);
            isNum = true;

        } else if (value) {
            value = value.toString();

        } else {
            value = '';
        }

        if (this.unionParaMap[name]) {
            this.unionParaMap[name]['value'] = value;
            this.unionParaMap[name]['isNum'] = isNum;
            return true;
        }

        return false;
    },

    _realCalResult: function (name, calUnit) {
        var nameArr = [];
        if (name.indexOf(',') > -1) {
            nameArr = name.split(',');

        } else {
            nameArr.push(name);
        }

        var contextDeclareStr = this._getDeclareParamterStr();
        var paramName, paramValue, conParamArr, conValueArr2D, formulaArr2D;
        conParamArr = calUnit['params'];
        conValueArr2D = calUnit['values'];
        formulaArr2D = calUnit['formulas'];

        if (conParamArr.length == 0) {
            for (let nindex in nameArr) {
                paramName = nameArr[nindex];
                paramValue = eval(contextDeclareStr + formulaArr2D[0][nindex]);
                this._updateValue(paramName, paramValue);
            }

        } else {
            for (let vindex in conValueArr2D) {
                var flag = false;
                for (let pindex in conParamArr) {
                    flag = this._checkCondition(conParamArr[pindex], conValueArr2D[vindex][pindex]);
                    if (!flag) {
                        break;
                    }
                }

                if (flag) {
                    for (let nindex in nameArr) {
                        paramName = nameArr[nindex];
                        paramValue = eval(contextDeclareStr + formulaArr2D[vindex][nindex]);
                        this._updateValue(paramName, paramValue);
                    }
                    break;
                }
            }
        }
    },

    _checkCondition: function (name, conStr) {
        if (conStr === 'ELSE' || conStr === 'ANY') {
            return true;

        } else if (conStr === 'ALL') {
            if (this.unionParaMap[name] && this.unionParaMap[name]['from'] === 'input') {
                return epdtool._checkParam(this.unionParaMap[name]['value'], this.unionParaMap[name]['scope']);
            }
        } else {
            if (this.unionParaMap[name]) {
                return epdtool._checkParam(this.unionParaMap[name]['value'], conStr);
            }
        }

        return false;
    },

    _getDeclareParamterStr: function () {
        var paramArr = [];
        var valStr;

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
        var resParamters = {};
        for (let name in this.unionParaMap) {
            resParamters[this.unionParaMap[name]['name']] = this.unionParaMap[name]['value'];
        }
        return resParamters;
    },
};