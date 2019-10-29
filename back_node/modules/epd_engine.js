"use strict";

/**
 * 这三个是全局变量，按照模板名称作为key将模板解析后分别存储，多次计算可不用重复初始化
 * templateParamterMap示例
 {
     "tplName1": {
        "Es_Angle": {
            "name": "Es_Angle",
            "scope": "30,35",
            "dataType": "N", 
            "value": M_UNSTANDARDFLAG,
            "from": "input" // 取值input，output
        },
        "Es_BBB": {...}
        ...
     }, 

     "tplName2": {...}
     ...
 }
 * 
 * templateLogicUnitMap示例
 {
     "tplName1": [
        {
            "name": "TN1", // 此处一般与output的值相对应，此处允许同时为多个值赋值，例如“TN1,TN2,TN9”以英文逗号分隔
            "calUnit": {
                "params": ["Es_SW", "Es_Angle"], // 一维数组，值是计算依赖的变量名，此处的值应该存在于input或output的变量中
                "values": [                      // 二维数组，每一个内部数组代表此条件的要求值，内部数组的长度需要与条件参数的个数一样（params数组长度）
                    [“600”, "30"], ["800,1000", "30"]
                    ...
                ],
                "formulas": [                    // 二维数组，此数组一维的长度应该与values数组的一维长度相同，内部二维的长度应该不小于name指定的参数个数（逗号分隔后），此处中的计算使用eval进行
                    ["ROUND(Es_TH*1.732+5185,0)", null, null, ...],
                    ...
                ]
            }
        },
        ...
     ],

     "tplName2": [...]
     ...
 }
 * 
 * templateXYTableMap示例
 {
     "tplName1": {
        "T1": {
            "tbNum": "T1",
            "conditionArray": [
                {
                    "M_PRJ_TYPE": "fds", 
                    "N301": "10",
                    "RZZ043": "YES",
                    "ZZ088": "(10,20]",
                    "TB123": "YES",
                    "TS30": "SDAF"
                },
                ...
            ],
            "resultArray": [
                {
                    "R:1": 1, 
                    "R:2": 2
                },
                ...
            ]
        },

        "T2": {...},
        ...
     },

     "tplName2": {...}
     ...
 }
 * 
 */
const templateParamterMap = {}; // 模板所有input与output
const templateLogicUnitMap = {}; // 模板所有逻辑判断与执行单元
const templateXYTableMap = {}; // 模板XY表格内容
const templateExcuteStep = {}; // 模板执行单元的执行方式（应对循环的情况）

// 标识非标的特殊字符
const UNSTANDARDFLAG = '_';
// 所有可能在公式中出现的函数名称
const GLOBALFUNCTIONS = ['GetValueFromGL', 'GetValuesFromGL', 'QueryTable', 'QueryTable3D', 'ConvertTo3D', 'CTo3D', 'E_AND', 'E_OR', 'E_NOT', 'E_IF', 'ABS', 'ACOS', 'ASIN', 'ATAN', 'COS', 'SIN', 'TAN', 'PI', 'DEGREES', 'RADIANS', 'ROUND', 'ROUNDUP', 'ROUNDDOWN', 'INT', 'LN', 'LOG', 'MAX', 'MIN', 'POWER', 'SQRT', 'EMOD', 'CEILING', 'FLOOR', 'ISNUMBER', 'ISLOGICAL', 'ISTEXT', 'ISNA', 'CSTR', 'CNUM', 'CBOOL'];

/**
 * 存储全部用户输入的变量（作为本次计算的变量池，可能属于多个模板）,最终将此变量池输出
 * 示例：
 {
     "Es_Angle": {
        "name": "Es_Angle",
        "dataType": "N", 
        "value": M_UNSTANDARDFLAG,
        "from": "input" // 取值input，output
    },
    "Es_BBB": {...}
    ...
 }
 */
let allParamsValues = {};
let childParamValues = {}; // 结构与全局相同，主要目的是存储子模板调用中的子模板的变量，单独出来的原因是避免两个模板变量名称相同的问题
let usedTemplateNameSet = new Set(); // 此变量避免循环调用

let usedTemplateNameStack = []; // 此处使用栈存储所有使用的模板名称


/**
 * 得到当前已经装载的模板名列表
 */
function M_getAllTemplateNames() {
    let tplNameArr = [];
    for (let tplName in templateLogicUnitMap) {
        tplNameArr.push(tplName);
    }

    return tplNameArr;
}

/**
 * 依据模板名得到模板数据
 */
function M_getTemplateDataByName(tplName) {
    let tplDataObj = {
        "paramters": templateParamterMap[tplName],
        "logics": templateLogicUnitMap[tplName],
        "XYTables": templateXYTableMap[tplName]
    };

    return tplDataObj;
}

/*
 * 将指定模板装载入全局对象
 * tplName：模板名称
 * tplObj：模板对象
 * isCover：是否覆盖，默认为false，如果为true则依据传入重新解析并覆盖，如果为false则如果全局变量中存在此模板则跳过若不存在则解析
 */
function M_initGlobalTemplateMap(tplName, tplObj, isCover) {
    if (!tplName || !tplObj) {
        return 'EMPTY';
    }
    if (!isCover && templateParamterMap[tplName] && templateLogicUnitMap[tplName] && templateXYTableMap[tplName] && templateExcuteStep[tplName]) {
        return 'OVER';
    }

    templateParamterMap[tplName] = _parseTemplateParamters(tplObj);
    templateXYTableMap[tplName] = _parseTemplateXYTable(tplObj);
    templateLogicUnitMap[tplName] = _parseTemplateLogicUnit(tplObj);
    templateExcuteStep[tplName] = _arrangeTemplateLogicOrder(templateLogicUnitMap[tplName]);

    return 'OK';
}

/**
 * 计算入口函数，调用此函数前请先调用 M_initGlobalTemplateMap，完成模板对象的初始化
 * options 示例: 
   {
       "tplName": "DN1", // 模板名称
       "inputParameters": {
           "Es_Angle": "30",
           "Es_TH": "200",
           ...
       },
       "childFlag": false // 用于内部子模板的调用标记，默认为false，对外接口可不理会
       "outParameters": null  // 用于子模板指定输出的参数，默认不设置为null， 对外接口可不理会
   }

* 如果没有找到模板对象返回null，正确返回全部参数的计算结果对象
 */
function M_calResultByRule(options) {
    let tplName = options['tplName'];

    // 如果没有传入模板名称，或者该模板没有对应的模板对象，则返回{}
    if (!tplName || !templateParamterMap[tplName] || !templateLogicUnitMap[tplName]) {
        return {};
    }

    // 如果存在循环调用则返回{}
    if (usedTemplateNameSet.has(tplName)) {
        console.log('Template calling is LOOP!! templateName: ' + tplName);
        return {};
    }

    usedTemplateNameStack.push(tplName);
    usedTemplateNameSet.add(tplName);

    if (options['childFlag']) {
        _setInputsValue(tplName, options['inputParameters'], true);

    } else {
        _setInputsValue(tplName, options['inputParameters'], false);
    }

    // 进行实际计算
    let logicUnits = templateLogicUnitMap[tplName];
    for (let cell of templateExcuteStep[tplName]) {
        let logic;
        // 数组长度大于1代表是循环
        if (cell['step'].length > 1) {
            let flag = true;
            while (flag) {
                for (let index = 0; index < cell['step'].length; index++) {
                    logic = logicUnits[cell['step'][index]];
                    let res = _realCalResult(tplName, logic['name'], logic['calUnit']);
                    // index=0 代表是#DO WHILE行的循环判断语句
                    if (index == 0) {
                        flag = res;
                        if (!flag) {
                            break;
                        }
                    }
                }
            }

        } else {
            logic = logicUnits[cell['step'][0]];
            _realCalResult(tplName, logic['name'], logic['calUnit']);
        }
    }

    usedTemplateNameStack.pop();
    usedTemplateNameSet.delete(tplName);

    let resMap = _combineOutputs(tplName, options['outParameters']);
    if (options['childFlag']) {
        return resMap;
    }

    return _dealResultBoolType(resMap);
}

/**
 * 将最终结果的true、false转换为YES、NO
 */
function _dealResultBoolType(resMap) {
    resMap = resMap || {};
    for (let pname in resMap) {
        if (resMap[pname] === true) {
            resMap[pname] = 'YES';
        }
        if (resMap[pname] === false) {
            resMap[pname] = 'NO';
        }
        if (resMap[pname].length > 1) {
            for (let index = 0; index < resMap[pname].length; index++) {
                if (resMap[pname][index] === true) {
                    resMap[pname][index] = 'YES';
                } else if (resMap[pname][index] === false) {
                    resMap[pname][index] = 'NO';
                } else {
                    break;
                }
            }
        }
    }

    return resMap;
}

/** 
 * 依据传入输入参数值进行调用模板前的输入参数初始化，isFromChildTpl代表是外部传入还是从子模板调用传入，两种方式值的对象结构不同
* 外部传入的结构为“名称：值”，例如：
{
    "Es_Angle": "30",
    "Es_TH": "200",
    ...
}
* 子模板调用传入的结构为：
[
    {
        "target": "Es_Angle", 
        "src": "30",
        "type": "value"
    },
    ...
]
*/
function _setInputsValue(tplName, inputParamObj, isFromChildTpl) {
    childParamValues[tplName] = {};

    // 依照传入信息，需要将子模板的临时变量放在单独的结构中，避免模板之间的变量重名问题
    if (isFromChildTpl) {
        let tmpMap = {};
        for (let obj of inputParamObj) {
            tmpMap[obj['target']] = obj;
        }
        inputParamObj = tmpMap;

        // 依据模板将所有模板中定义的参数进行转载，重点是确定参数的dataType
        for (let pname in templateParamterMap[tplName]) {
            childParamValues[tplName][pname] = {
                'name': pname,
                'dataType': templateParamterMap[tplName][pname]['dataType'],
                'from': templateParamterMap[tplName][pname]['from'],
                'value': UNSTANDARDFLAG
            };
        }

        // 依据传入的变量对所有已经装载的参数进行赋值，重点是确定参数的value，如果参数没有传入值，则保持非标UNSTANDARDFLAG
        for (let pname in inputParamObj) {
            if (childParamValues[tplName][pname]) {
                // 此时是需要使用src代表的参数的值给target参数赋值,值为map则需要取src所代表的变量的值，否则则直接使用src的值
                let val = inputParamObj[pname]['src'];
                if (inputParamObj[pname]['type'] === 'map') {
                    childParamValues[tplName][pname]['value'] = allParamsValues[val]['value'];

                } else {
                    childParamValues[tplName][pname]['value'] = _realValue(val, childParamValues[tplName][pname]['dataType']);
                }
            }
        }


    } else {
        for (let pname in templateParamterMap[tplName]) {
            allParamsValues[pname] = {
                'name': pname,
                'dataType': templateParamterMap[tplName][pname]['dataType'],
                'from': templateParamterMap[tplName][pname]['from'],
                'value': UNSTANDARDFLAG
            };
        }

        for (let pname in inputParamObj) {
            let val = inputParamObj[pname];
            if (allParamsValues[pname]) {
                allParamsValues[pname]['value'] = _realValue(val, allParamsValues[pname]['dataType']);

            } else {
                allParamsValues[pname] = {
                    'name': pname,
                    'dataType': 'S',
                    'from': 'input',
                    'value': val
                };
            }
        }
    }
}

/**
 * 更新变量池的值,先更新子模板的变量，找不到后再更新变量池的变量
 * 因此重复变量将仅影响本次子模板的值，不会影响全局
 */
function _updateValue(tplName, name, value) {
    if (childParamValues[tplName][name]) {
        childParamValues[tplName][name]['value'] = _realValue(value, childParamValues[tplName][name]['dataType']);
        return true;
    }
    if (allParamsValues[name]) {
        allParamsValues[name]['value'] = _realValue(value, allParamsValues[name]['dataType']);
        return true;
    }

    return false;
}

/**
 * 获取变量的对象，先获取子模板的变量，找不到后再从变量池的变量中寻找
 * 因此重复变量的取值仅从本次子模板中取
 */
function _getParamObj(tplName, name) {
    if (childParamValues[tplName][name] != null) {
        return childParamValues[tplName][name];
    }
    if (allParamsValues[name] != null) {
        return allParamsValues[name];
    }

    return null;
}

/**
 * 用于进行条件匹配检查
 * tplName：模板名称
 * name：变量名 
 * conStr：匹配条件 
 * index：3D变量的下标
 */
function _checkCondition(tplName, name, conStr, index) {
    let paraObj = _getParamObj(tplName, name);
    if (!paraObj) {
        return false;
    }

    let realVal = paraObj['value'];
    if (index != null && paraObj['dataType'].startsWith('3D')) {
        realVal = realVal[index];
    }

    if (conStr === 'ELSE' || conStr === 'ANY') {
        if (realVal == null || realVal === 'NA') {
            return false;
        } else {
            return true;
        }

    } else if (conStr === 'ALL') {
        return _checkParam(realVal, templateParamterMap[tplName][name]['scope']);

    } else if (conStr.startsWith('@')) {
        let pobj = _getParamObj(tplName, conStr.substring(1));
        if (pobj == null) {
            return false;
        }
        return _checkParam(realVal, pobj['value']);

    } else {
        return _checkParam(realVal, conStr);
    }
}

/**
 * 实际计算逻辑单元的值
 * name：待赋值的变量名称，多个变量以英文逗号分隔
 * calUnit：逻辑判断与执行单元 
 * tplName：模板名称 
 */
function _realCalResult(tplName, name, calUnit) {
    // 标记是否是循环 #DO WHILE 方法
    let loopFlag = false;

    // 标记是否是GetValuesFromGL方法, 以#开头的变量意味着会使用子模板返回多值
    let valuesFromGlFlag = false;

    // 无论目标是计算多个变量还是单一变量，统一放置在数组中管理
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

    const conParamArr = calUnit['params'];
    const conValueArr2D = calUnit['values'];
    const formulaArr2D = calUnit['formulas'];

    // 没有条件直接根据公式计算结果
    if (conParamArr.length == 0) {
        // 此处对应GetValuesFromGL方法，此方法是会调用子模板，并返回结果对象，再依据变量顺序进行赋值
        if (valuesFromGlFlag) {
            // 预先检验表达式所包含的参数值是否存在NA和非标的情况,非标则直接退出
            let checkRes = _checkExpress(childParamValues[tplName], allParamsValues, formulaArr2D[0][0]);
            if (_isUnStandard(checkRes)) {
                for (let pname of nameArr) {
                    _updateValue(tplName, pname, UNSTANDARDFLAG);
                }
                return false;

            } else if (checkRes === 'NA') {
                for (let pname of nameArr) {
                    _updateValue(tplName, pname, 'NA');
                }
                return false;

            } else {
                let paramValueArr = [];
                try {
                    paramValueArr = _evalExpress(_getDeclareParamterStr(tplName, formulaArr2D[0][0]));

                    let minLen = Math.min(nameArr.length, paramValueArr.length);
                    for (let nindex = 0; nindex < minLen; nindex++) {
                        _updateValue(tplName, nameArr[nindex], paramValueArr[nindex]);
                    }

                } catch (err) {
                    for (let pname of nameArr) {
                        _updateValue(tplName, pname, UNSTANDARDFLAG);
                    }
                    console.log(`Calculate is template name: ${tplName}; formular: ${formulaArr2D[0][0]}`);
                    console.log(err);
                }
            }

        } else { // 此处对应直接计算变量值的情况，每一个变量对应excel一行中的公式区的一个公式
            for (let nindex = 0; nindex < nameArr.length; nindex++) {
                let paramValue;

                let checkRes = _checkExpress(childParamValues[tplName], allParamsValues, formulaArr2D[0][nindex]);
                if (_isUnStandard(checkRes)) {
                    paramValue = UNSTANDARDFLAG;

                } else if (checkRes === 'NA') {
                    paramValue = 'NA';

                } else {
                    try {
                        paramValue = _evalExpress(_getDeclareParamterStr(tplName, formulaArr2D[0][nindex]));

                    } catch (err) {
                        console.log(`Calculate is template name: ${tplName}; formular: ${formulaArr2D[0][nindex]}`);
                        console.log(err);
                        paramValue = UNSTANDARDFLAG;
                    }
                }

                if (loopFlag) {
                    if (_isUnStandard(paramValue) || paramValue === 'NA') {
                        return false;
                    }
                    return _realValue(paramValue, 'B');
                }
                _updateValue(tplName, nameArr[nindex], paramValue);
            }
        }

    } else { // 根据变量以及条件计算值 conParamArr.length>0，此时代表是标注的excel查表对条件的模式
        // 此处判定一下条件中的变量是否有3D变量
        let maxLen = _max3dConditionCount(tplName, conParamArr);

        // 不含3D变量，按照excel中一行行进行比对并取公式进行计算
        if (maxLen == 1) {
            // 如果条件参数中没有值，或存在非标值，则直接将结果参数赋值为非标
            for (let cname of conParamArr) {
                let pobj = _getParamObj(tplName, cname);
                if (!pobj || _isUnStandard(pobj['value'])) {
                    for (let pname of nameArr) {
                        _updateValue(tplName, pname, UNSTANDARDFLAG);
                    }
                    return false;
                }
            }

            // 按照行、列的顺序进行条件判定，先取定一行，再在此行中依次取条件变量进行条件判断，一行中遇到不满足的条件变量则直接跳到下一行进行判断，
            // 此行全部条件变量的值都符合条件，则寻找到，此时计算该行对应的公示区的公式，并将结果分别赋值
            for (let vindex = 0; vindex < conValueArr2D.length; vindex++) {
                let flag = false;
                for (let pindex = 0; pindex < conParamArr.length; pindex++) {
                    flag = _checkCondition(tplName, conParamArr[pindex], conValueArr2D[vindex][pindex], null);
                    if (!flag) {
                        break;
                    }
                }

                if (flag) {
                    for (let nindex = 0; nindex < nameArr.length; nindex++) {
                        let paramValue;

                        let checkRes = _checkExpress(childParamValues[tplName], allParamsValues, formulaArr2D[vindex][nindex]);
                        if (_isUnStandard(checkRes)) {
                            paramValue = UNSTANDARDFLAG;

                        } else if (checkRes === 'NA') {
                            paramValue = 'NA';

                        } else {
                            try {
                                paramValue = _evalExpress(_getDeclareParamterStr(tplName, formulaArr2D[vindex][nindex]));

                            } catch (err) {
                                console.log(`Calculate is template name: ${tplName}; formular: ${formulaArr2D[vindex][nindex]}`);
                                console.log(err);
                                paramValue = UNSTANDARDFLAG;
                            }
                        }

                        if (loopFlag) {
                            if (_isUnStandard(paramValue) || paramValue === 'NA') {
                                return false;
                            }
                            return _realValue(paramValue, 'B');
                        }
                        _updateValue(tplName, nameArr[nindex], paramValue);
                    }
                    break;
                }
            }




        } else { // maxLen>1，包含3D变量
            for (let cname of conParamArr) {
                let pobj = _getParamObj(tplName, cname);
                if (!pobj || _isUnStandard(pobj['value'])) {
                    for (let pname of nameArr) {
                        _updateValue(tplName, pname, UNSTANDARDFLAG);
                    }
                    return false;
                }
            }

            let valArr = {};
            let flag = false;
            for (let pos = 0; pos < maxLen; pos++) {
                flag = false;
                for (let vindex = 0; vindex < conValueArr2D.length; vindex++) {
                    flag = false;
                    for (let pindex = 0; pindex < conParamArr.length; pindex++) {
                        flag = _checkCondition(tplName, conParamArr[pindex], conValueArr2D[vindex][pindex], pos);
                        if (!flag) {
                            break;
                        }
                    }

                    if (flag) {
                        // for (let nindex in nameArr) {
                        for (let nindex = 0; nindex < namearr.length; nindex++) {
                            let pname = nameArr[nindex];
                            if (!valArr[pname]) {
                                valArr[pname] = [];
                            }

                            let paramValue;
                            let checkRes = _checkExpress(childParamValues[tplName], allParamsValues, formulaArr2D[vindex][nindex]);
                            if (_isUnStandard(checkRes)) {
                                paramValue = UNSTANDARDFLAG;

                            } else if (checkRes === 'NA') {
                                paramValue = 'NA';

                            } else {
                                try {
                                    paramValue = _evalExpress(_getDeclareParamterStr(tplName, formulaArr2D[vindex][nindex]));

                                } catch (err) {
                                    console.log(`Calculate is template name: ${tplName}; formular: ${formulaArr2D[vindex][nindex]}`);
                                    console.log(err);
                                    paramValue = UNSTANDARDFLAG;
                                }
                            }

                            if (_isUnStandard(paramValue)) {
                                for (let pname of nameArr) {
                                    _updateValue(tplName, pname, UNSTANDARDFLAG);
                                }
                                return false;

                            } else {
                                valArr[pname].push(paramValue);
                            }
                        }
                        break;
                    }
                }

                // 如果所有3D变量数组第pos位置取值后，没有符合条件，则认为结果的pos位置值为非标，此时可认为整体非标
                if (!flag) {
                    return false;
                }
            }

            if (flag) {
                for (let pname of nameArr) {
                    _updateValue(tplName, pname, valArr[pname]);
                }
            }
        }
    }

    return true;
}

/**
 * 生成eval执行所需的上下文信息串，并整合此串与待执行语句
 * tplName：模板名称
 * expressStr：待执行的语句
 */
function _getDeclareParamterStr(tplName, expressStr) {
    const paramArr = [];
    let resStr = '';
    // 保存已经包含的变脸名，避免由于名称相同重复声明，并且当前模板的变量值的优先级较高
    let paramSet = new Set();

    for (let pname in childParamValues[tplName]) {
        if (paramSet.has(pname)) {
            continue;
        }
        let dataType = childParamValues[tplName][pname]['dataType'];
        let value = childParamValues[tplName][pname]['value'];
        let valStr;

        if (_isUnStandard(value)) {
            valStr = ` = null`;

        } else if (dataType === 'S') {
            valStr = ` = '${value}'`;

        } else {
            valStr = ` = ${value}`;
        }
        paramArr.push(`var  ${pname}  ${valStr}`);
        paramSet.add(pname);
    }

    for (let pname in allParamsValues) {
        if (paramSet.has(pname)) {
            continue;
        }
        let dataType = allParamsValues[pname]['dataType'];
        let value = allParamsValues[pname]['value'];
        let valStr;

        if (_isUnStandard(value)) {
            valStr = ` = null`;

        } else if (dataType === 'S') {
            valStr = ` = '${value}'`;

        } else {
            valStr = ` = ${value}`;
        }
        paramArr.push(`var  ${pname}  ${valStr}`);
        paramSet.add(pname);
    }

    resStr = paramArr.join('; ') + '; ';
    resStr = resStr + expressStr;

    return resStr;
}

/**
 * 将变量池中的变量及其值，整理输出
 * outputParams 不为空代表是子模板要求，因此仅返回子模板要求的参数值即可
 */
function _combineOutputs(tplName, outputParams) {
    let resParamters = {};

    if (outputParams) {
        let params = outputParams.split(',');
        for (let pname of params) {
            resParamters[pname] = childParamValues[tplName][pname]['value'];
        }

    } else {
        for (let pname in allParamsValues) {
            resParamters[pname] = allParamsValues[pname]['value'];
        }
    }

    return resParamters;
}

/**
 * 获取给定变量列表中变量的最大长度值，如果是单一变量长度为1，如果是3D变量则为数组长度
 */
function _max3dConditionCount(tplName, conParamArr) {
    let maxCount = 1;
    for (let pname of conParamArr) {
        let obj = _getParamObj(tplName, pname);
        if (obj['dataType'].startsWith('3D')) {
            maxCount = Math.max(maxCount, obj['value'].length);
        }
    }
    return maxCount;
}


//======Inner Function====内部功能性函数===========================================

function _evalExpress(expressStr) {
    return eval(expressStr);
}

function _isUnStandard(val) {
    return val === UNSTANDARDFLAG;
}

/* 解析模板中的变量，并生成内部对象返回 */
function _parseTemplateParamters(tplObj) {
    let resObj = {};

    const inputObj = tplObj['CPARA_InputParameterValueList'];
    for (let obj of inputObj) {
        resObj[obj['PropertyName']] = {
            'name': obj['PropertyName'],
            'scope': obj['ValueList'] || '',
            'dataType': _paramType(obj['Data']['Type']),
            'value': UNSTANDARDFLAG,
            'from': 'input'
        };
    }

    const outputObj = tplObj['CPARA_InternalParameterValueList'];
    for (let obj of outputObj) {
        resObj[obj['PropertyName']] = {
            'name': obj['PropertyName'],
            'scope': obj['ValueList'] || '',
            'dataType': _paramType(obj['Data']['Type']),
            'value': UNSTANDARDFLAG,
            'from': 'output'
        };
    }

    return resObj;
}

/* 解析模板中的XY表，并生成内部对象返回 */
function _parseTemplateXYTable(tplObj) {
    let resObj = {};

    const xyObj = tplObj['CPARA_XYTable'];
    for (let obj of xyObj) {
        let innerObj = {
            'tbNum': obj['TNo'],
            'conditionArray': [],
            'resultArray': []
        };

        obj['Condition'] = obj['Condition'] || [];
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

        resObj[obj['TNo']] = innerObj;
    }

    return resObj;
}

/* 解析模板中的判断逻辑，并生成内部对象返回 */
function _parseTemplateLogicUnit(tplObj) {
    let resArr = [];
    const logicObj = tplObj['CPARA_FormulaLinkup'];

    for (let obj of logicObj) {
        // 双斜线开头的名字，代表本单元已经被注释，后续不需要执行
        if (obj['PropertyName'] && obj['PropertyName'].startsWith('//')) {
            continue;
        }

        let inMap = {
            'name': obj['PropertyName'],
            'calUnit': {
                'params': [],
                'values': [],
                'formulas': []
            }
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
                    formulaArr.push(_dealFormularStr(singleResObj['Value']));
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
                formulaArr.push(_dealFormularStr(dataObj[key]));
            }
            inMap['calUnit']['formulas'].push(formulaArr);
        }

        resArr.push(inMap);
    }

    return resArr;
}

/* 依照模板的执行单元循环情况，编制执行顺序，目的是将同一个循环单元放置在一个cell中执行，同一个执行单元所需执行的步骤存储在step中，
 *  内容是模板执行单元的数组序号
 */
function _arrangeTemplateLogicOrder(logicUnits) {
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
}

function _isNull(val){
    if(val==null || val==undefined){
        return true;
    }
    if(val.toString()=='NaN'){
        return true;
    }
    return false;
}

/* 根据scope类型，对val进行是否满足scope要求进行判断，val为空值为不符合，scope的类型为N则符合，其他根据要求进行判断 */
function _checkParam(val, scopeStr) {
    if (_isNull(val) || _isUnStandard(val)) {
        return false;
    }

    const scopeMap = _parseValueScope(scopeStr);
    // 没有指定范围
    if (scopeMap['valType'] === 'N') {
        return true;
    }

    // 只有一个取值
    if (scopeMap['valType'] === 'O') {
        return _checkParamValueEqual(val, scopeMap['valScope']);

    } else if (scopeMap['valType'] === 'D') { // 离散取值
        let varArr = scopeMap['valScope'];
        for (let s of varArr) {
            if (_checkParamValueEqual(val, s)) {
                return true;
            }
        }

    } else { // 范围取值, 此处只可能是数值型
        const varMap = scopeMap['valScope'];
        const startFlag = varMap['startFlag'];
        const endFlag = varMap['endFlag'];
        let startNum = varMap['startNum'];
        let endNum = varMap['endNum'];
        let step = varMap['step'];

        let realVal = parseFloat(val);

        if (isNaN(realVal) || startFlag && realVal < startNum || !startFlag && realVal <= startNum || endFlag && realVal > endNum || !endFlag && realVal >= endNum) {
            return false;
        }

        if (step === '1') {
            return true;

        } else {
            let stepDigits = _calFloatDigitsCount(step);
            realVal = parseInt(realVal * Math.pow(10, stepDigits));
            step = parseInt(step * Math.pow(10, stepDigits));

            if (startNum > -Infinity) {
                startNum = parseInt(startNum * Math.pow(10, stepDigits));
                if ((realVal - startNum) % step == 0) {
                    return true;
                }
            } else if (endNum < Infinity) {
                endNum = parseInt(endNum * Math.pow(10, stepDigits));
                if ((endNum - realVal) % step == 0) {
                    return true;
                }
            }
        }
    }

    return false;
}


/* 依据传入的字符串得到真正的数值  */
function _realValue(valStr, dataType) {
    if (valStr == null || valStr == undefined || valStr.toString() === "NaN" || _isUnStandard(valStr)) {
        return UNSTANDARDFLAG;
    }

    if (valStr === 'NA') {
        return 'NA';
    }

    if (dataType && dataType.startsWith('3D')) {
        // 如果传入的就是数组，则说明是已经完成处理，可直接返回
        if (valStr.length > 1) {
            return valStr;
        }

        let valArr = valStr.split(',');
        let resArr = [];
        for (let val of valArr) {
            if (_isUnStandard(val)) {
                return UNSTANDARDFLAG;
            }
            if (dataType === '3DB') {
                resArr.push(val.toUpperCase() === 'YES' || val.toUpperCase() === 'TRUE');

            } else if (dataType === '3DN') {
                resArr.push(parseFloat(val));

            } else {
                resArr.push(val);
            }
        }
        return resArr;

    } else if (dataType) {
        if (_isUnStandard(valStr)) {
            return UNSTANDARDFLAG;
        }
        if (dataType === 'B') {
            return valStr.toString().toUpperCase() === 'YES' || valStr.toString().toUpperCase() === 'TRUE';
        }
        if (dataType === 'N') {
            return parseFloat(valStr);
        }
        return valStr;

    } else {
        if (_isUnStandard(valStr)) {
            return UNSTANDARDFLAG;
        }
        if (ISLOGICAL(valStr)) {
            return valStr.toUpperCase() === 'YES' || valStr.toUpperCase() === 'TRUE';

        } else {
            if (ISNUMBER(valStr)) {
                return parseFloat(valStr);

            } else if (!valStr) {
                return '';

            } else {
                return valStr;
            }
        }
    }
}


/* 
判断公式中所有参数是否存在非标值或NA，存在则该公式值直接为非标或NA 
如果公式为null或空字符串，则认为没有合适的公式，该值返回非标
*/
function _checkExpress(childParamValMap, paramValMap, formularExpress) {
    if (formularExpress == null || formularExpress === '') {
        return UNSTANDARDFLAG;
    }

    let params = _extractParamArr(formularExpress);

    for (let pname of params) {
        if (childParamValMap[pname] && _isUnStandard(childParamValMap[pname]['value'])) {
            return UNSTANDARDFLAG;
        }
        if (childParamValMap[pname] && childParamValMap[pname]['value'] === 'NA') {
            return 'NA';
        }

        if (paramValMap[pname] && _isUnStandard(paramValMap[pname]['value'])) {
            return UNSTANDARDFLAG;
        }
        if (paramValMap[pname] && paramValMap[pname]['value'] === 'NA') {
            return 'NA';
        }
    }

    return 'OK';
}

function _isEqual(val1, val2) {
    if (Math.abs(val1 - val2) < 1e-7) {
        return true;
    }
    return false;
}

function _isString(str) {
    return (typeof str == 'string') && str.constructor == String;
}


/* 解析GetValueFromGL的第三个特殊参数格式 */
function _parseGLParamter(paramStr) {
    if (!paramStr) {
        return [];
    }

    const resArr = [];
    const paramArr = paramStr.split(',');

    for (let val of paramArr) {
        let innerMap, innerTmpArr, srcParamName, targetParamName;

        val = val.trim();
        // 此处处理类似  p1,p2 的问题，目标处理为 p1>p1, p2>p2
        if (val.indexOf('>') < 0) {
            val = val + '>' + val;
        }

        innerTmpArr = val.split('>');
        if (innerTmpArr.length !== 2) {
            continue;
        }
        srcParamName = innerTmpArr[0];
        targetParamName = innerTmpArr[1];

        innerMap = {};
        innerMap['target'] = targetParamName;
        if (srcParamName.startsWith('V:')) {
            innerMap['src'] = _realValue(srcParamName.substring(2));
            innerMap['type'] = 'value';

        } else {
            innerMap['src'] = srcParamName;
            innerMap['type'] = 'map';
        }
        resArr.push(innerMap);
    }
    return resArr;
}

/*
 * 根据模板指定，标定参数的所属类型，对照关系是：
 * Text --> S   Number --> N   Yes/No --> B
 * 3DText --> 3DS   3DNumber --> 3DN  3DYes/No --> 3DB
 */
function _paramType(typeName) {
    if (!typeName) {
        return 'S';
    }
    if (typeName.toUpperCase() === 'TEXT') {
        return 'S';
    }
    if (typeName.toUpperCase() === 'NUMBER') {
        return 'N';
    }
    if (typeName.toUpperCase() === 'YES/NO') {
        return 'B';
    }
    if (typeName.toUpperCase() === '3DTEXT') {
        return '3DS';
    }
    if (typeName.toUpperCase() === '3DNUMBER') {
        return '3DN';
    }
    if (typeName.toUpperCase() === '3DYES/NO') {
        return '3DB';
    }
    return 'S';
}

/*
 * 计算小数位数，目的是解决准确计算问题，一般需要将浮点转换为整数计算，例如1.5, 0.15, 0.00015这三个数都需要转换为15，
 * 此函数就是得到转换到15，三个数都需要乘以几个10（10的幂数），以便与其同时计算的其他数字扩大相同倍数
 */
function _calFloatDigitsCount(val) {
    if (!val) {
        return 0;
    }

    const valStr = val.toString();
    if (valStr.indexOf('.') < 0) {
        return 0;
    }

    return valStr.length - valStr.indexOf('.') - 1;
}

function _checkParamValueEqual(val1, val2) {
    if(_isNull(val1) || _isNull(val2)){
        return false;
    }

    if (ISLOGICAL(val1)) {
        val1 = _realValue(val1, 'B');
    }
    if (ISLOGICAL(val2)) {
        val2 = _realValue(val2, 'B');
    }
    
    if (val1.toString() === val2.toString()) {
        return true;
    }
    if (val1.toString() === 'NA' && val2.toString() === 'NA') {
        return true;
    }
    if (val1.toString() === 'NA' && val2 == null || val1 == null && val2.toString() === 'NA') {
        return true;
    }
    return false;
}

/**
 * 将scope的值进行解析，为空标记为N, 单个值标记为O，范围值标记为S（并处理上下界以及步长问题），离散值标记为D（并解析为数组，以英文逗号分隔）
 * 解析后返回值结构：
 {
     'valType': ***,
     'valScope': {       // valType==S
        'step': ***,
        'startFlag': true/false,
        'endFlag': true/false,
        'startNum': ***,
        'endNum': ***
     },
     //'valScope': [],   // valType==D
     // 'valScope': ***,   // valType==O
 }
 */
function _parseValueScope(scopeStr) {
    const resMap = {};
    if (!scopeStr || scopeStr === 'ANY') {
        resMap['valType'] = 'N';
        return resMap;
    }

    const val = scopeStr.toString().trim();
    const startChar = val.charAt(0);
    let endChar = val.charAt(val.length - 1);

    if (startChar === '(' || startChar === '[') {
        resMap['valType'] = 'S';
        const valMap = {};
        let realScope, tmpArr;

        if (endChar === ')' || endChar === ']') {
            realScope = val;
            valMap['step'] = '1';

        } else {
            tmpArr = val.split('/');
            realScope = tmpArr[0];
            valMap['step'] = tmpArr[1];
            endChar = realScope.charAt(realScope.length - 1);
        }

        if (startChar === '(') {
            valMap['startFlag'] = false;
        } else {
            valMap['startFlag'] = true;
        }

        if (endChar === ')') {
            valMap['endFlag'] = false;
        } else {
            valMap['endFlag'] = true;
        }

        realScope = realScope.substring(1, realScope.length - 1);
        tmpArr = realScope.split(',');
        valMap['startNum'] = tmpArr[0] === '$' ? -Infinity : parseFloat(tmpArr[0]);
        valMap['endNum'] = tmpArr[1] === '$' ? Infinity : parseFloat(tmpArr[1]);

        resMap['valScope'] = valMap;

    } else if (val.indexOf(',') > -1) {
        resMap['valType'] = 'D';
        let valArr = [];
        for (let tmp of val.split(',')) {
            if (ISLOGICAL(val)) {
                valArr.push(_realValue(tmp, 'B').toString());

            } else {
                valArr.push(tmp);
            }
        }
        resMap['valScope'] = valArr;

    } else {
        resMap['valType'] = 'O';
        if (ISLOGICAL(val)) {
            resMap['valScope'] = _realValue(val, 'B').toString();

        } else {
            resMap['valScope'] = val || '';
        }
    }

    return resMap;
}

/* 处理公式问题，例如字符串拼接 & 需要修改为JS支持的 +，YES、NO转化为JS的true、false   */
function _dealFormularStr(valStr) {
    if (valStr == null || valStr == undefined) {
        return '';

    } else if (ISLOGICAL(valStr)) {
        return _realValue(valStr, 'B');

    } else {
        return valStr.replace(/&/g, '+');
    }
}

/* 从表达式中抽取出涉及到的全部变量，方法是使用计算符号分隔，并去除函数名、数字、字符串常量，剩余的可认为是公式中的变量   */
function _extractParamArr(formularExpress) {
    if (!formularExpress || formularExpress.length == 0) {
        return [];
    }

    formularExpress = formularExpress.toString();

    let resArr = new Set();

    // 此处正则表达式存在奇怪的问题，replace(/[()*+-\/,&]/g, " ")执行正确 但  replace(/[()+-*\/,&]/g, " ")错误
    let specialChars = new Set(['(', ')', '+', '-', '*', '/', '&', ',']);
    let charArr = [];
    for (let c of formularExpress) {
        if (specialChars.has(c)) {
            charArr.push(' ');
        } else {
            charArr.push(c);
        }
    }

    let innerFunctionNames = new Set(GLOBALFUNCTIONS);
    let expressArr = charArr.join('').split(' ');
    for (let word of expressArr) {
        // 空字符串
        if (word.length == 0) {
            continue;
        }
        // 原生字符串，被引号圈定
        if (word.charAt(0) === '"' || word.charAt(0) === "'") {
            continue;
        }
        // 数字
        if (!isNaN(word)) {
            continue;
        }
        // 内部函数名
        if (innerFunctionNames.has(word)) {
            continue;
        }
        resArr.add(word);
    }
    return [...resArr];
}

//-----------------------------------------------------------
// 以下两个函数非工具类，目的是支持公式中两个特殊的函数
/*
 * 此函数中只能使用eval中动态声明的变量，包括当前环境的所有输入输出参数，和模板对应的table对象
 * tableObj需要eval调用此函数之前赋值（此处使用的全部非传入变量都认为是全局变量）
 */
function _queryTableFunction(TNo, RNo, inputParaArr, is3DFlag) {
    let queryRsultArr = [];

    let tplName = usedTemplateNameStack[usedTemplateNameStack.length-1];
    let tableObj = templateXYTableMap[tplName];

    let innerTableObj = tableObj[TNo];
    let conArr = innerTableObj['conditionArray'];
    let resArr = innerTableObj['resultArray'];

    try {
        // 获取table所需参数，并依据eval传入的参数进行赋值
        let conParamValObj = {};
        if (conArr.length > 0) {
            for (let pname in conArr[0]) {
                let tmpObj = _getParamObj(tplName, pname);
                if(tmpObj==null){
                    continue;
                }
                conParamValObj[pname] = tmpObj['value'];
            }
        }

        let flag = false;
        // 没有参数使用条件结果表格获取值（excel中有灰色）
        if (inputParaArr.length == 0) {
            for (let pindex = 0; pindex < conArr.length; pindex++) {
                flag = true;
                for (let pname in conArr[pindex]) {
                    let realVal = conParamValObj[pname];
                    let scopeVal = conArr[pindex][pname];
                    if (scopeVal.startsWith('@')) {
                        let tmpObj = _getParamObj(tplName, scopeVal.substring(1));
                        scopeVal = tmpObj['value'];
                    }

                    flag = _checkParam(realVal, scopeVal);
                    if (!flag) {
                        break;
                    }
                }

                if (flag) {
                    if (is3DFlag) {
                        queryRsultArr.push(resArr[pindex][RNo]);
                    } else {
                        return resArr[pindex][RNo];
                    }
                }
            }


        } else {
            for (let conObj of conArr) {
                flag = true;
                for (let inputObj of inputParaArr) {
                    let pname = inputObj['target'];
                    let realVal = inputObj['src'];
                    if (inputObj['type'] && inputObj['type'] === 'map') {
                        let tmpObj = _getParamObj(tplName, realVal);
                        realVal = tmpObj['value'];
                    }

                    let scopeVal = conObj[pname];
                    if (scopeVal && scopeVal.startsWith('@')) {
                        let tmpObj = _getParamObj(tplName, scopeVal.substring(1));
                        scopeVal = tmpObj['value'];
                    }

                    flag = _checkParam(realVal, scopeVal);
                    if (!flag) {
                        break;
                    }
                }

                if (flag) {
                    if (is3DFlag) {
                        queryRsultArr.push(conObj[RNo]);

                    } else {
                        return conObj[RNo];
                    }
                }
            }
        }

        if (is3DFlag) {
            if (queryRsultArr.length == 0) {
                return UNSTANDARDFLAG;
            }
            return queryRsultArr;
        }

    } catch (err) {
        console.log(`Error at --> TNo: ${TNo}; RNo: ${RNo}; inputParaArr: ${inputParaArr}`);
        console.log(err);
        return UNSTANDARDFLAG;
    }

    return UNSTANDARDFLAG;
}

// 此处需要能访问到全局的模板
function _callInnerChildTemplate(DNum, Para, inputParaArr) {
    let options = {
        "tplName": DNum,
        "inputParameters": inputParaArr,
        "childFlag": true,
        "outParameters": Para
    };

    // 没有传入Para则返回非标
    if (!Para) {
        return UNSTANDARDFLAG;
    }

    let resMap = M_calResultByRule(options);

    if (Para.indexOf(',') > -1) {
        let paraArr = Para.split(',');
        let resArr = [];

        for (let pname of paraArr) {
            if (resMap[pname] == null) {
                resArr.push(UNSTANDARDFLAG);

            } else {
                resArr.push(resMap[pname]);
            }
        }
        return resArr;

    } else {
        if (resMap[Para] == null) {
            return UNSTANDARDFLAG;
        }
        return resMap[Para];
    }
}

//--以下是公式中使用的公式-------------------------------------------------
//======4.2=get-info====================================================
function GetValueFromGL(DNum, Para, InputParalist) {
    return _callInnerChildTemplate(DNum, Para, _parseGLParamter(InputParalist));
}

function GetValuesFromGL(DNum, Para, InputParalist) {
    return _callInnerChildTemplate(DNum, Para, _parseGLParamter(InputParalist));
}

function QueryTable(TNo, RNo, QCol) {
    return _queryTableFunction(TNo, RNo, _parseGLParamter(QCol), false);
}

function QueryTable3D(TNo, RNo, QCol) {
    return _queryTableFunction(TNo, RNo, _parseGLParamter(QCol), true);
}

//======4.3=Array====================================================
function ConvertTo3D(...values) {
    let resArr = [];
    for (let val of values) {
        if (ISNUMBER(val)) {
            resArr.push(parseFloat(val));

        } else if (ISLOGICAL(val)) {
            if (val.toUpperCase() == 'YES' || val.toUpperCase() == 'TRUE') {
                resArr.push(true);

            } else {
                resArr.push(false);
            }

        } else {
            resArr.push(val);
        }
    }
    return resArr;
}

function CTo3D(valArr, separator) {
    if (separator == undefined || ISNUMBER(valArr)) {
        return [];
    }

    let charArr = [];
    for (let c of valArr) {
        if (separator === c) {
            charArr.push('@A@');

        } else {
            charArr.push(c);
        }
    }

    return charArr.join('').split('@A@');
}

//======4.5=logic====================================================
function E_AND(...conditions) {
    if (conditions.length == 0) {
        return false;
    }

    for (let c of conditions) {
        if (!c || !ISLOGICAL(c) || c.toString().toupperCase() == 'NO' || c.toString().toupperCase() == 'FALSE') {
            return false;
        }
    }
    return true;
}

function E_OR(...conditions) {
    if (conditions.length == 0) {
        return false;
    }

    for (let c of conditions) {
        if (c && ISLOGICAL(c) && (c.toString().toupperCase() == 'YES' || c.toString().toupperCase() == 'TRUE')) {
            return true;
        }
    }
    return false;
}

function E_NOT(condition) {
    if (!condition || !ISLOGICAL(condition) || condition.toString().toupperCase() == 'NO' || condition.toString().toupperCase() == 'FALSE') {
        return true;
    }
    return false;
}

function E_IF(condition, trueVal, falseVal) {
    let flag = true;
    if (!condition || !ISLOGICAL(condition) || condition.toString().toupperCase() == 'NO' || condition.toString().toupperCase() == 'FALSE') {
        flag = false;
    }
    return flag ? trueVal : falseVal;
}

//======4.6=math===================================================
function ABS(val) {
    return Math.abs(parseFloat(val));
}

function ACOS(val) {
    return Math.acos(parseFloat(val));
}

function ASIN(val) {
    return Math.asin(parseFloat(val));
}

function ATAN(val) {
    return Math.atan(parseFloat(val));
}

function COS(val) {
    return Math.cos(parseFloat(val));
}

function SIN(val) {
    return Math.sin(parseFloat(val));
}

function TAN(val) {
    return Math.tan(parseFloat(val));
}

function PI() {
    return Math.PI;
}

function DEGREES(val) {
    if (!ISNUMBER(val)) {
        return NaN;
    }
    return parseFloat(val) * 180.0 / Math.PI;
}

function RADIANS(val) {
    if (!ISNUMBER(val)) {
        return NaN;
    }
    return parseFloat(val) * Math.PI / 180.0;
}

function ROUND(val, precision) {
    if (!ISNUMBER(val) || !ISNUMBER(precision)) {
        return NaN;
    }

    val = parseFloat(val);
    precision = parseFloat(precision);
    const flag = val > 0 ? 1 : -1;
    const tmp = Math.pow(10, precision);
    return flag * Math.round(Math.abs(val) * tmp) / tmp;
}

function ROUNDUP(val, precision) {
    if (!ISNUMBER(val) || !ISNUMBER(precision)) {
        return NaN;
    }

    val = parseFloat(val);
    precision = parseFloat(precision);
    const flag = val > 0 ? 1 : -1;
    const tmp = Math.pow(10, precision);
    const correctVal = 0.5 / tmp;
    return flag * Math.round((Math.abs(val) + correctVal) * tmp) / tmp;
}

function ROUNDDOWN(val, precision) {
    if (!ISNUMBER(val) || !ISNUMBER(precision)) {
        return NaN;
    }

    val = parseFloat(val);
    precision = parseFloat(precision);
    const flag = val > 0 ? 1 : -1;
    const tmp = Math.pow(10, precision);
    const correctVal = 0.5 / tmp;
    return flag * Math.round((Math.abs(val) - correctVal) * tmp) / tmp;
}

function INT(val) {
    const tmp = ROUNDDOWN(val, 0);
    return tmp <= val ? tmp : tmp - 1;
}

function LN(val) {
    return Math.log(parseFloat(val));
}

function LOG(val, base) {
    return Math.log(parseFloat(val)) / Math.log(parseFloat(base) || 10);
}

function MAX(...numbers) {
    if (numbers.length == 0) {
        return 0;
    }

    let maxNum = -Infinity;
    for (let num of numbers) {
        if (ISNUMBER(num) && num > maxNum) {
            maxNum = parseFloat(num);
        }
    }
    return maxNum;
}

function MIN(...numbers) {
    if (numbers.length == 0) {
        return 0;
    }

    let minNum = Infinity;
    for (let num of numbers) {
        if (ISNUMBER(num) && num < minNum) {
            minNum = parseFloat(num);
        }
    }
    return minNum;
}

function POWER(val, powerNum) {
    return Math.pow(parseFloat(val), parseFloat(powerNum));
}

function SQRT(val) {
    val = parseFloat(val);
    return Math.sqrt(val);
}

function EMOD(val, divisor) {
    if (!ISNUMBER(val) || !ISNUMBER(divisor)) {
        return NaN;
    }

    val = parseFloat(val);
    divisor = parseFloat(divisor);
    return val - INT(val / divisor) * divisor;
}

function CEILING(val, significance) {
    if (!ISNUMBER(val) || !ISNUMBER(significance) || _isEqual(significance, 0)) {
        return NaN;
    }

    val = parseFloat(val);
    significance = parseFloat(significance);

    if (val > 0 && significance < 0) {
        return NaN;
    }

    if (_isEqual(val, 0)) {
        return 0;
    }

    if (val * significance > 0) {
        const flag = val > 0 ? 1 : -1;

        const nval = val > 0 ? val : -1 * val;
        const nsignificance = significance > 0 ? significance : -1 * significance;

        const times = Math.round(nval / nsignificance);
        const lower = times * nsignificance;
        const upper = (times + 1) * nsignificance;

        if (lower > nval || _isEqual(lower, nval)) {
            return flag * lower;
        } else {
            return flag * upper;
        }

    } else if (val < 0 && significance > 0) {
        return FLOOR(val, -1 * significance);
    }

    return NaN;
}

function FLOOR(val, significance) {
    if (!ISNUMBER(val) || !ISNUMBER(significance) || _isEqual(significance, 0)) {
        return NaN;
    }

    val = parseFloat(val);
    significance = parseFloat(significance);

    if (val > 0 && significance < 0) {
        return NaN;
    }

    if (_isEqual(val, 0)) {
        return 0;
    }

    if (val * significance > 0) {
        const flag = val > 0 ? 1 : -1;

        const nval = val > 0 ? val : -1 * val;
        const nsignificance = significance > 0 ? significance : -1 * significance;

        const times = Math.round(nval / nsignificance);
        const lower = (times - 1) * nsignificance;
        const upper = times * nsignificance;

        if (upper < nval || _isEqual(upper, nval)) {
            return flag * upper;
        } else {
            return flag * lower;
        }

    } else if (val < 0 && significance > 0) {
        return CEILING(val, -1 * significance);
    }

    return NaN;
}


//======4.9=judge===================================================
function ISNUMBER(val) {
    if (parseFloat(val).toString() === "NaN") {
        return false;
    }
    return !isNaN(val);
}

function ISLOGICAL(val) {
    if (_isNull(val)) {
        return false;
    }

    const realVal = _isString(val) ? val.toUpperCase() : '';

    if (realVal === 'YES' || realVal === 'TRUE' || realVal === 'NO' || realVal === 'FALSE') {
        return true;
    }
    return false;
}

function ISTEXT(val) {
    return !ISNUMBER(val) && !ISLOGICAL(val);
}

function ISNA(val) {
    if (val == undefined || val == null) {
        return true;
    }
    if (val.toString() === 'NA' || val.toString() === 'NaN' || val.toString() === '') {
        return true;
    }

    return false;
}

//======4.10=change===================================================
function CSTR(val) {
    if (val == null) {
        return '';
    }
    return '' + val;
}

function CNUM(val) {
    return parseFloat(val);
}

function CBOOL(val) {
    const realVal = val && _isString(val) ? val.toUpperCase() : val;

    if (realVal === 'YES' || realVal === 'TRUE' || realVal) {
        return true;
    }
    if (realVal === 'NO' || realVal === 'FALSE' || !realVal) {
        return false;
    }
    return false;
}


module.exports = {
    M_getAllTemplateNames,
    M_getTemplateDataByName,
    M_initGlobalTemplateMap,
    M_calResultByRule
};