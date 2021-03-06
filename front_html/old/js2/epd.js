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

// 此变量避免循环调用
let usedTemplateNameSet = new Set();

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

    templateParamterMap[tplName] = M_parseTemplateParamters(tplObj);
    templateXYTableMap[tplName] = M_parseTemplateXYTable(tplObj);
    templateLogicUnitMap[tplName] = M_parseTemplateLogicUnit(tplObj);
    templateExcuteStep[tplName] = M_arrangeTemplateLogicOrder(templateLogicUnitMap[tplName]);

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

    usedTemplateNameSet.add(tplName);

    if (options['childFlag']) {
        _setInputsValue(tplName, options['inputParameters'], true);

    } else {
        _setInputsValue(tplName, options['inputParameters'], false);
    }

    // 进行实际计算
    let logicUnits = templateLogicUnitMap[tplName];
    let logic;
    for (let cell of templateExcuteStep[tplName]) {
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
                    }
                }
            }

        } else {
            logic = logicUnits[cell['step'][0]];
            _realCalResult(tplName, logic['name'], logic['calUnit']);
        }
    }

    usedTemplateNameSet.delete(tplName);
    return _combineOutputs(tplName, options['outParameters']);
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

        for (let pname in templateParamterMap[tplName]) {
            if (inputParamObj[pname]) {
                childParamValues[tplName][pname] = {
                    'name': pname,
                    'dataType': templateParamterMap[tplName][pname]['dataType'],
                    'from': templateParamterMap[tplName][pname]['from'],
                    'value': M_UNSTANDARDFLAG
                };
                // 此时是需要使用src代表的参数的值给target参数赋值,值为map则需要取src所代表的变量的值，否则则直接使用src的值
                let val = inputParamObj[pname]['src'];
                if (inputParamObj[pname]['type'] === 'map') {
                    childParamValues[tplName][pname]['value'] = allParamsValues[val]['value'];

                } else {
                    childParamValues[tplName][pname]['value'] = M_realValue(val, childParamValues[tplName][pname]['dataType']);
                }

            } else {
                childParamValues[tplName][pname] = {
                    'name': pname,
                    'dataType': 'S',
                    'from': 'input',
                    'value': M_UNSTANDARDFLAG
                };
            }
        }

    } else {
        for (let pname in templateParamterMap[tplName]) {
            if (inputParamObj[pname]) {
                allParamsValues[pname] = {
                    'name': pname,
                    'dataType': templateParamterMap[tplName][pname]['dataType'],
                    'from': templateParamterMap[tplName][pname]['from'],
                    'value': M_UNSTANDARDFLAG
                };

                let val = inputParamObj[pname];
                allParamsValues[pname]['value'] = M_realValue(val, allParamsValues[pname]['dataType']);

            } else {
                allParamsValues[pname] = {
                    'name': pname,
                    'dataType': 'S',
                    'from': 'input',
                    'value': M_UNSTANDARDFLAG
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
        childParamValues[tplName][name]['value'] = M_realValue(value, childParamValues[tplName][name]['dataType']);
        return true;
    }
    if (allParamsValues[name]) {
        allParamsValues[name]['value'] = M_realValue(value, allParamsValues[name]['dataType']);
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
        return M_checkParam(realVal, templateParamterMap[tplName][name]['scope']);

    } else if (conStr.startsWith('@')) {
        let pobj = _getParamObj(tplName, conStr.substring(1));
        if (pobj == null) {
            return false;
        }
        return M_checkParam(realVal, pobj['value']);

    } else {
        return M_checkParam(realVal, conStr);
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

    // 先给定非标默认值，如果以下计算不满足条件则取默认值
    for (let pname of nameArr) {
        _updateValue(tplName, pname, M_UNSTANDARDFLAG);
    }

    // 没有条件直接根据公式计算结果
    if (conParamArr.length == 0) {
        // 此处对应GetValuesFromGL方法，此方法是会调用子模板，并返回结果对象，再依据变量顺序进行赋值
        if (valuesFromGlFlag) {
            // 预先检验表达式所包含的参数值是否存在NA和非标的情况,非标则直接退出
            let checkRes = M_checkExpress(childParamValues[tplName], allParamsValues, formulaArr2D[0][0]);
            if (M_isUnStandard(checkRes)) {
                return false;

            } else if (checkRes === 'NA') {
                for (let pname of nameArr) {
                    _updateValue(tplName, pname, 'NA');
                }

            } else {
                let paramValueArr = [];
                try {
                    paramValueArr = M_evalExpress(_getDeclareParamterStr(tplName, formulaArr2D[0][0]));

                    let minLen = Math.min(nameArr.length, paramValueArr.length);
                    for (let nindex = 0; nindex < minLen; nindex++) {
                        _updateValue(tplName, nameArr[nindex], paramValueArr[nindex]);
                    }
                } catch (err) {
                    console.log("Calculate is template name: " + tplName + "; formular: " + formulaArr2D[0][0]);
                    console.log(err);
                }
            }

        } else { // 此处对应直接计算变量值的情况，每一个变量对应excel一行中的公式区的一个公式
            for (let nindex in nameArr) {
                nindex = parseInt(nindex);
                let paramValue;

                let checkRes = M_checkExpress(childParamValues[tplName], allParamsValues, formulaArr2D[0][nindex]);
                if (M_isUnStandard(checkRes)) {
                    paramValue = M_UNSTANDARDFLAG;

                } else if (checkRes === 'NA') {
                    paramValue = 'NA';

                } else {
                    try {
                        paramValue = M_evalExpress(_getDeclareParamterStr(tplName, formulaArr2D[0][nindex]));

                    } catch (err) {
                        console.log("Calculate is template name: " + tplName + "; formular: " + formulaArr2D[0][nindex]);
                        console.log(err);
                        paramValue = M_UNSTANDARDFLAG;
                    }
                }

                if (loopFlag) {
                    if (M_isUnStandard(paramValue) || paramValue === 'NA') {
                        return false;
                    }
                    return M_realValue(paramValue, 'B');
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
                if (!pobj || M_isUnStandard(pobj['value'])) {
                    for (let pname of nameArr) {
                        _updateValue(tplName, pname, M_UNSTANDARDFLAG);
                    }
                    return false;
                }
            }

            // 按照行、列的顺序进行条件判定，先取定一行，再在此行中依次取条件变量进行条件判断，一行中遇到不满足的条件变量则直接跳到下一行进行判断，
            // 此行全部条件变量的值都符合条件，则寻找到，此时计算该行对应的公示区的公式，并将结果分别赋值
            for (let vindex in conValueArr2D) {
                let flag = false;
                for (let pindex in conParamArr) {
                    pindex = parseInt(pindex);
                    flag = _checkCondition(tplName, conParamArr[pindex], conValueArr2D[vindex][pindex], null);
                    if (!flag) {
                        break;
                    }
                }

                if (flag) {
                    for (let nindex in nameArr) {
                        nindex = parseInt(nindex);
                        let paramValue;

                        let checkRes = M_checkExpress(childParamValues[tplName], allParamsValues, formulaArr2D[vindex][nindex]);
                        if (M_isUnStandard(checkRes)) {
                            paramValue = M_UNSTANDARDFLAG;

                        } else if (checkRes === 'NA') {
                            paramValue = 'NA';

                        } else {
                            try {
                                paramValue = M_evalExpress(_getDeclareParamterStr(tplName, formulaArr2D[vindex][nindex]));

                            } catch (err) {
                                console.log("Calculate is template name: " + tplName + "; formular: " + formulaArr2D[vindex][nindex]);
                                console.log(err);
                                paramValue = M_UNSTANDARDFLAG;
                            }
                        }

                        if (loopFlag) {
                            if (M_isUnStandard(paramValue) || paramValue === 'NA') {
                                return false;
                            }
                            return M_realValue(paramValue, 'B');
                        }
                        _updateValue(tplName, nameArr[nindex], paramValue);
                    }
                    break;
                }
            }



        } else { // maxLen>1，包含3D变量
            for (let cname of conParamArr) {
                let pobj = _getParamObj(tplName, cname);
                if (!pobj || M_isUnStandard(pobj['value'])) {
                    for (let pname of nameArr) {
                        _updateValue(tplName, pname, M_UNSTANDARDFLAG);
                    }
                    return false;
                }
            }

            let valArr = {};
            let flag = false;
            for (let pos = 0; pos < maxLen; pos++) {
                flag = false;
                for (let vindex in conValueArr2D) {
                    flag = false;
                    for (let pindex in conParamArr) {
                        pindex = parseInt(pindex);
                        flag = _checkCondition(tplName, conParamArr[pindex], conValueArr2D[vindex][pindex], pos);
                        if (!flag) {
                            break;
                        }
                    }

                    if (flag) {
                        for (let nindex in nameArr) {
                            nindex = parseInt(nindex);
                            let pname = nameArr[nindex];
                            if (!valArr[pname]) {
                                valArr[pname] = [];
                            }

                            let paramValue;
                            let checkRes = M_checkExpress(childParamValues[tplName], allParamsValues, formulaArr2D[vindex][nindex]);
                            if (M_isUnStandard(checkRes)) {
                                paramValue = M_UNSTANDARDFLAG;

                            } else if (checkRes === 'NA') {
                                paramValue = 'NA';

                            } else {
                                try {
                                    paramValue = M_evalExpress(_getDeclareParamterStr(tplName, formulaArr2D[vindex][nindex]));

                                } catch (err) {
                                    console.log("Calculate is template name: " + tplName + "; formular: " + formulaArr2D[vindex][nindex]);
                                    console.log(err);
                                    paramValue = M_UNSTANDARDFLAG;
                                }
                            }

                            if (M_isUnStandard(paramValue)) {
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

        if (dataType === 'S') {
            valStr = " = '" + value + "'";

        } else {
            valStr = " = " + value + "";
        }
        paramArr.push("var " + pname + valStr);
        paramSet.add(pname);
    }

    for (let pname in allParamsValues) {
        if (paramSet.has(pname)) {
            continue;
        }
        let dataType = allParamsValues[pname]['dataType'];
        let value = allParamsValues[pname]['value'];
        let valStr;

        if (dataType === 'S') {
            valStr = " = '" + value + "'";

        } else {
            valStr = " = " + value + "";
        }
        paramArr.push("var " + pname + valStr);
        paramSet.add(pname);
    }

    resStr = paramArr.join('; ') + '; ';
    resStr = resStr + " var tableObj=" + JSON.stringify(templateXYTableMap[tplName]) + "; ";
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
            resParamters[pname] = resParamters[pname]['value'];
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