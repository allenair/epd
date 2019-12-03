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
// 所有可能在公式中出现的函数名称，用于在表达式参数提取时，作为参数名称的排除项
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
let allParamsValues = {}; // 此处为本次运算的参数池，包括所有用户输入、本次计算主模板的输入和输出参数
let childParamValues = {}; // 结构与全局相同，主要目的是存储子模板调用中的子模板的变量，单独出来的原因是避免两个模板变量名称相同的问题

let usedTemplateNameStack = []; // 此处使用栈结构存储所有使用的模板名称, 两个作用：1-避免循环调用；2-用于获取迭代计算中当前的模板名称（栈顶元素值）


/**
 * 得到当前已经装载的模板名列表
 * 由于同一模板会拆分为变量、逻辑、XY表三种结构，一般认为至少会存在逻辑部分（否则没有意义），因此可使用逻辑部分作为模板存在性的判断方法
 */
function M_getAllTemplateNames() {
    let tplNameArr = [];
    for (let tplName in templateLogicUnitMap) {
        tplNameArr.push(tplName);
    }

    return tplNameArr;
}

/**
 * 根据上传的初始化模板名称，删除不在此名称范围内的缓存模板
 * 此处以模板文件夹中存在的模板文件为准，清理哪些已经从磁盘删除但是还存在于内存对象的模板内容
 */
function M_cleanDeletedTemplate(allTplNames) {
    for (let tplName in templateLogicUnitMap) {
        if (!allTplNames.includes(tplName)) {
            delete(templateLogicUnitMap[tplName]);
            delete(templateParamterMap[tplName]);
            delete(templateXYTableMap[tplName]);
            delete(templateExcuteStep[tplName]);
        }
    }
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
    if (usedTemplateNameStack.includes(tplName)) {
        console.log('Template calling is LOOP!! templateName: ' + tplName);
        return {};
    }

    // 模板检查没有问题则将名称入栈
    usedTemplateNameStack.push(tplName);

    // 依据初始调用的模板或执行中迭代调用的模板这两种情况，需要区分输入参数初始化的方式
    if (options['childFlag']) {
        _setInputsValue(tplName, options['inputParameters'], true);

    } else {
        allParamsValues = {};
        _setInputsValue(tplName, options['inputParameters'], false);
    }

    // 进行实际计算，此处依照该模板已经编排好的执行逻辑进行计算，目前不支持循环嵌套，今后如需支持此处需要修改
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

    // 该模板执行完毕后，名称出栈
    usedTemplateNameStack.pop();

    // 整理模板输出，迭代中的子模板输出按照函数中的要求，类型也不做修改（保持JS类型）以便后续计算，
    // 最终输出需要将全局变量池全部信息都输出，并且需要进行一些规范化处理（例如, true转换为YES，以及数组处理）
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
        for (let pname in childParamValues[tplName]) {
            if (inputParamObj[pname]) {
                // 此时是需要使用src代表的参数的值给target参数赋值,值为map则需要取src所代表的变量的值，否则则直接使用src的值
                let val = inputParamObj[pname]['src'];
                if (inputParamObj[pname]['type'] === 'map') {
                    childParamValues[tplName][pname]['value'] = allParamsValues[val]['value'];

                } else {
                    childParamValues[tplName][pname]['value'] = _realValue(val, childParamValues[tplName][pname]['dataType']);
                }

            } else if (allParamsValues[pname]) {
                childParamValues[tplName][pname]['value'] = allParamsValues[pname]['value'];
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
 * 提供统一的取值方式，以便应对主模板计算和迭代计算两种情况下的取值来源不同的问题
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
 * 用于支持模板中逻辑部分的条件行匹配检查功能，需要支持单行匹配以及3D变量的多重匹配问题
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
 * 实际计算逻辑单元的值,此处为引擎中的核心部分，其余函数基本上都为此核心函数提供功能服务
 * 函数执行的逻辑是基于给定的逻辑单元进行条件判断和表达式执行，逻辑分为以下几种情况：
 * 1、没有条件直接在行上指定表达式
 * （1）对应GetValuesFromGL函数（#开头）
 * （2）普通表达式函数
 * 2、使用条件判断需要执行表达式的行
 * （1）参数不存在3D变量
 * （2）参数存在3D变量
 * 所有执行都需要判断表达式的参数中是否有非标和NA的情况
 * 在动态执行表达式时使用try-catch包裹，以便应对动态执行中参数异常问题，存在异常则认为最终值为非标（因为肯定存在不符合模板要求的问题）
 * 获取的值都需要update到当前模板环境中，以便支持后续的逻辑运算
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
                        for (let nindex = 0; nindex < nameArr.length; nindex++) {
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
 * eval执行中，可以理解JS会产生一个独立的作用域，因此表达式中的变量值需要在eval环境中进行声明赋值，否则表达式会找不到变量的值
 * 因此在执行前，需要将表达式可能使用到的变量拼成一个赋值字符串，与表达式一起执行
 * 此处需要注意对字符串、非标、数组进行特殊处理
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
            valStr = `= null`;

        } else if (dataType === 'S') {
            valStr = `= '${value}'`;

        } else {
            valStr = `= ${value}`;
        }
        paramArr.push(`var ${pname} ${valStr}`);
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

        } else if (dataType === '3DS') {
            if (Array.isArray(value)) {
                valStr = "= [";
                for (let val of value) {
                    valStr = valStr + `'${val}',`;
                }
                valStr = valStr.substring(0, valStr.length - 1) + "]";
            } else {
                valStr = '= null';
            }

        } else if (dataType === '3DN') {
            valStr = ` = [${value}]`;

        } else if (dataType === '3DB') {
            valStr = ` = [${value}]`;

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
/** 
 * 此函数直接调用JS的eval函数进行表达式运算，引擎其他需要动态运算的地方均需要调用此函数
 * 以便于今后需要对动态执行的方法进行统一处理
 */
function _evalExpress(expressStr) {
    return eval(expressStr);
}

/** 
 * 引擎判断非标的方法
 */
function _isUnStandard(val) {
    return val === UNSTANDARDFLAG;
}

/**
 * 解析模板中的变量，并生成内部对象返回 
 * 全部数据均来源于JSON模板，仅获取模板的输入输出变量部分，重点是获取变量范围定义与变量类型信息
 * 此数据获取后如无重载需求会常驻后台以备使用
 */
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

/**
 * 解析模板中的XY表，并生成内部对象返回 
 * 全部数据均来源于JSON模板，仅获取XY表部分，以应对查表函数的调用
 * 此数据获取后如无重载需求会常驻后台以备使用
 */
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

/**
 * 解析模板中的判断逻辑，并生成内部对象返回 
 * 目的是处理成引擎可处理的结构，全部数据均来源于JSON模板，仅获取引擎关心部分，不会修改模板内容
 * 此数据获取后如无重载需求会常驻后台以备使用
 */
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

/**
 * 引擎不会改变模板中的所有内容，对于循环的情况，引擎使用一个数据结构进行执行逻辑的编排方式应对
 * 此编排方式完全依赖模板中读取的逻辑内容，当前编排的方式不支持循环嵌套的情况，如果今后有此情况仅修改此处编排逻辑和执行部分即可
 * 依照模板的执行单元循环情况，编制执行顺序，目的是将同一个循环单元放置在一个cell中执行，同一个执行单元所需执行的步骤存储在step中，
 * 内容是模板执行单元的数组序号
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

function _isNull(val) {
    if (val == null || val == undefined) {
        return true;
    }
    if (val.toString() == 'NaN') {
        return true;
    }
    return false;
}

/**
 * 此函数用于检查输入变量是否符合模板定义的范围要求，以及变量是否符合模板条件行判断使用
 * 根据scope类型，对val进行是否满足scope要求进行判断，val为空值为不符合，scope的类型为N则符合，其他根据要求进行判断 
 */
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

/**
 * 依据传入的字符串得到真正的数值
 * 此处作为获取输入值、计算中间值实际值的统一方式，以便正确进行后续计算
 * 转换规则按照dataType的指定进行，如果没有指定（某些初始输入值），则会根据值本身进行推断
 * 对于null、undefined、NaN、非标值，可能是输入也可能是中间计算结果，这四种情况都认为是非标（因为无法支持后续计算，此处可直接给出判定）
 * 对于数组类型的变量，此处需要依照类型进行转换，考虑到可能存在已经是数组再次进行值转换的问题，因此转换前需要进行判断
 */
function _realValue(valStr, dataType) {
    if (valStr == null || valStr == undefined || valStr.toString() === "NaN" || _isUnStandard(valStr)) {
        return UNSTANDARDFLAG;
    }

    if (valStr === 'NA') {
        return 'NA';
    }

    if (dataType && dataType.startsWith('3D')) {
        // 如果传入的就是数组，则说明是已经完成处理，可直接返回
        if (Array.isArray(valStr)) {
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

/** 
 * 判断公式中所有参数是否存在非标值或NA，存在则该公式值直接为非标或NA 
 * 如果公式为null或空字符串，则认为没有合适的公式，该值返回非标
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

/** 
 * JS中两个数字无法判断相等（精度偏差问题），因此两数差值小于某一个较小的数，可认为相等
 */
function _isEqual(val1, val2) {
    if (Math.abs(val1 - val2) < 1e-7) {
        return true;
    }
    return false;
}

function _isString(str) {
    return (typeof str == 'string') && str.constructor == String;
}


/**
 * 解析GetValueFromGL的第三个特殊参数格式 
 * 存在变量映射和直接赋值两种情况，表达式书写方式需要相应处理
 * */
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

/** 
 * 根据模板指定，标定参数的所属类型，后续引擎中逻辑判断使用转换后的类型名称
 * 对照关系是：
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
 * 此处应对的问题是范围检查时候，应对step是小数的问题，例如：(0,2.78]/0.04，由于浮点数处理小数有偏差，因此只能采用转换为整数进行后续处理的办法
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

/**
 * 判断两个值是否相等，
 * 正常值按照转换成字符串字面值进行比较，
 * 非正常的处理逻辑为：都为NA认为相同，一个为NA一个为null认为相等，都为null或undefined或NaN的为不相等
 */
function _checkParamValueEqual(val1, val2) {
    if (_isNull(val1) || _isNull(val2)) {
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
 * 将scope的值进行解析，为后一步判断给定变量的值是否在指定范围的逻辑操作进行条件预处理
 * 为空标记为N, 单个值标记为O，范围值标记为S（并处理上下界以及步长问题），离散值标记为D（并解析为数组，以英文逗号分隔）
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

/** 
 * 处理公式问题，例如字符串拼接 & 需要修改为JS支持的 +，YES、NO转化为JS的true、false   
 * */
function _dealFormularStr(valStr) {
    if (valStr == null || valStr == undefined) {
        return '';

    } else if (ISLOGICAL(valStr)) {
        return _realValue(valStr, 'B');

    } else {
        return valStr.replace(/&/g, '+');
    }
}

/** 
 * 从表达式中抽取出涉及到的全部变量，方法是使用计算符号分隔，并去除函数名、数字、字符串常量，剩余的可认为是公式中的变量   
 * 由于此处仅需要判断公式中的变量是否灿在非标或NA的情况，因此不需要公式解析，仅得到公式中的所有变量即可，
 * 此处要求是不能遗漏变量多一些没有影响（因为下一步中找不到变量对应的值不认为是非标）
 * */
function _extractParamArr(formularExpress) {
    if (!formularExpress || formularExpress.length == 0) {
        return [];
    }

    formularExpress = formularExpress.toString();

    let resArr = new Set();

    // 此处正则表达式存在奇怪的问题，replace(/[()*+-\/,&]/g, " ")执行正确 但  replace(/[()+-*\/,&]/g, " ")错误
    // 因此不能使用正则的方式进行处理
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
 * 此函数中用于查询XY表，tableObj数据来源于全局的XY表存储，模板名称tplName来源于当前正在起作用的模板（usedTemplateNameStack中最后一个）
 */
function _queryTableFunction(TNo, RNo, inputParaArr, is3DFlag) {
    let queryRsultArr = [];

    let tplName = usedTemplateNameStack[usedTemplateNameStack.length - 1];
    let tableObj = templateXYTableMap[tplName];

    let innerTableObj = tableObj[TNo];
    let conArr = innerTableObj['conditionArray'];
    let resArr = innerTableObj['resultArray'];

    try {
        let conParamValObj = {};
        if (conArr.length > 0) {
            for (let pname in conArr[0]) {
                let tmpObj = _getParamObj(tplName, pname);
                if (tmpObj == null) {
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

/** 
 * 此处进行递归调用，要求模板已经加载，并能够使用DNum从全局中取得模板内容，否则直接返回非标
 */
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

/**
 * 根据函数提供的分隔符进行数组转换，由于分隔符可能会是正则表达式特殊字符，因此此处没有使用正则的方式进行字符串拆分
 */
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
/**
 * 逻辑部分，epd中按照yes/no表示，此处按照js标准的true/flase进行进一步计算，因此一般方式是进行字符串的判断以便明确真实的值
 */
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
/**
 * 数学函数主要直接调用JS的标准函数，如果由于传入参数问题（不是数字），结果会返回JS的NaN，后续逻辑照此进一步处理（例如判定非标等）
 */
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

/**
 * 根据文档描述，此函数的逻辑与JS自带的函数有区别
 */
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

/**
 * 根据文档描述，此函数的逻辑与JS自带的函数有区别
 */
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

/**
 * 依据js的特点，将几种未声明的情况也作为满足NA的条件，在实际使用中根据业务要求需要有所变化
 */
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

/**
 * 对外暴露接口，仅在nodejs环境下使用，在html下会报没有声明module的错误，因此需要特殊判断
 */
if (typeof module == "undefined") {
    console.log('Now u in browser!');

} else {
    module.exports = {
        M_getAllTemplateNames,
        M_cleanDeletedTemplate,
        M_getTemplateDataByName,
        M_initGlobalTemplateMap,
        M_calResultByRule
    };
}