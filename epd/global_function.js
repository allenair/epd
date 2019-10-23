"use strict";

const UNSTANDARDFLAG = '_';
const GLOBALFUNCTIONS = ['GetValueFromGL', 'GetValuesFromGL', 'QueryTable', 'QueryTable3D', 'ConvertTo3D', 'CTo3D', 'E_AND', 'E_OR', 'E_NOT', 'E_IF', 'ABS', 'ACOS', 'ASIN', 'ATAN', 'COS', 'SIN', 'TAN', 'PI', 'DEGREES', 'RADIANS', 'ROUND', 'ROUNDUP', 'ROUNDDOWN', 'INT', 'LN', 'LOG', 'MAX', 'MIN', 'POWER', 'SQRT', 'EMOD', 'CEILING', 'FLOOR', 'ISNUMBER', 'ISLOGICAL', 'ISTEXT', 'ISNA', 'CSTR', 'CNUM', 'CBOOL'];

//======Inner Function====================================================
function _isUnStandard(val) {
    return val == UNSTANDARDFLAG;
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

// 解析模板中的变量，并生成内部对象返回
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

// 解析模板中的XY表，并生成内部对象返回
function _parseTemplateXYTable(tplObj) {
    let resObj = {};

    const xyObj = tplObj['CPARA_XYTable'];
    for (let obj of xyObj) {
        let innerObj = {
            'tbNum': obj['TNo'],
            'conditionArray': [],
            'resultArray': []
        };

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

// 解析模板中的判断逻辑，并生成内部对象返回
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

// 依照模板的执行单元循环情况，编制执行顺序，目的是将同一个循环单元放置在一个cell中执行，同一个执行单元所需执行的步骤存储在step中，
// 内容是模板执行单元的数组序号
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

// 解析GetValueFromGL的第三个特殊参数格式
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
            srcParamName = srcParamName.substring(2);
            innerMap['src'] = _realValue(srcParamName);
            innerMap['type'] = 'value';

        } else {
            innerMap['src'] = srcParamName;
            innerMap['type'] = 'map';
        }
        resArr.push(innerMap);
    }
    return resArr;
}

// 根据模板指定，标定参数的所属类型，对照关系是：
// Text --> S   Number --> N   Yes/No --> B
// 3DText --> 3DS   3DNumber --> 3DN  3DYes/No --> 3DB
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

// 计算小数位数，目的是解决准确计算问题，一般需要将浮点转换为整数计算，例如1.5, 0.15, 0.00015这三个数都需要转换为15，
// 此函数就是得到转换到15，三个数都需要乘以几个10（10的幂数），以便与其同时计算的其他数字扩大相同倍数
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
    if (val1 && val2 && val1.toString() === val2.toString()) {
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

// 根据scope类型，对val进行是否满足scope要求进行判断，val为空值为不符合，scope的类型为N则符合，其他根据要求进行判断
function _checkParam(val, scopeStr) {
    if (!val || _isUnStandard(val)) {
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

// 将scope的值进行解析，为空标记为N, 单个值标记为O，范围值标记为S（并处理上下界以及步长问题），离散值标记为D（并解析为数组，以英文逗号分隔）
function _parseValueScope(scopeStr) {
    const resMap = {};
    if (!scopeStr || scopeStr === 'ANY') {
        resMap['valType'] = 'N';
        return resMap;
    }

    const val = scopeStr.toString();
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
            resMap['valScope'] = _realValue(valStr, 'B').toString();
        } else {
            resMap['valScope'] = val || '';
        }
    }

    return resMap;
}

// 依据传入的字符串得到真正的数值
function _realValue(valStr, dataType) {
    if (valStr == null || valStr == undefined || valStr.toString() === "NaN") {
        return UNSTANDARDFLAG;
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
        if (dataType === 'B') {
            return valStr.toUpperCase() === 'YES' || valStr.toUpperCase() === 'TRUE';
        }
        if (dataType === 'N') {
            return parseFloat(valStr);
        }
        return valStr;

    } else {
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

// 处理公式问题，例如字符串拼接 & 需要修改为JS支持的 +，YES、NO转化为JS的true、false
function _dealFormularStr(valStr) {
    if (valStr == null || valStr == undefined) {
        return '';

    } else if (ISLOGICAL(valStr)) {
        return _realValue(valStr, 'B');

    } else {
        return valStr.replace(/&/g, '+');
    }
}

// 从表达式中抽取出涉及到的全部变量，方法是使用计算符号分隔，并去除函数名、数字、字符串常量，剩余的可认为是公式中的变量
function _extractParamArr(formularExpress) {
    if (!formularExpress || formularExpress.length == 0) {
        return [];
    }

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

// 判断公式中所有参数是否存在非标值或NA，存在则该公式值直接为非标或NA
function _isUnStandardExpress(paramValMap, formularExpress) {
    let params = _extractParamArr(formularExpress);

    for (let pname of params) {
        if (_isUnStandard(paramValMap[pname]['value'])) {
            return UNSTANDARDFLAG;
        }
    }

    for (let pname of params) {
        if (paramValMap[pname]['value'] === 'NA') {
            return 'NA';
        }
    }

    return '';
}

// 此函数中只能使用eval中动态声明的变量，包括当前环境的所有输入输出参数，和模板对应的table对象
// tableObj需要eval调用此函数之前赋值（此处使用的全部非传入变量都认为是全局变量）
function _queryTableFunction(TNo, RNo, inputParaArr, is3DFlag) {
    let queryRsultArr = [];

    let innerTableObj = tableObj[TNo];
    let conArr = innerTableObj['conditionArray'];
    let resArr = innerTableObj['resultArray'];

    try {
        // 获取table所需参数，并依据eval传入的参数进行赋值
        let conParamValObj = {};
        if (conArr.length > 0) {
            for (let pname in conArr[0]) {
                conParamValObj[pname] = eval(pname);
            }
        }

        let flag = false;
        // 没有参数使用条件结果表格获取值（excel中有灰色）
        if (inputParaArr.length == 0) {
            for (let pindex in conArr) {
                flag = true;
                pindex = Number.parseInt(pindex);
                for (let pname in conArr[pindex]) {
                    let realVal = conParamValObj[pname];
                    let scopeVal = conArr[pindex][pname];
                    if (scopeVal.startsWith('@')) {
                        scopeVal = eval(scopeVal.substring(1));
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
                        realVal = eval(realVal);
                    }

                    let scopeVal = conObj[pname];
                    if (scopeVal && scopeVal.startsWith('@')) {
                        scopeVal = eval(scopeVal.substring(1));
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
        console.log(err);
        return UNSTANDARDFLAG;
    }

    return UNSTANDARDFLAG;
}

// _outerFunction
// 此处需要能访问到全局的模板
function _callInnerChildTemplate(DNum, Para, inputParaArr) {















    return '';
}


//======4.2=get-info====================================================
function GetValueFromGL(DNum, Para, InputParalist) {
    const innerCalMap = _callInnerChildTemplate(DNum, Para, _parseGLParamter(InputParalist));
    return innerCalMap[Para];
}

function GetValuesFromGL(DNum, Para, InputParalist) {
    const resArr = [];
    const innerCalMap = _callInnerChildTemplate(DNum, Para, _parseGLParamter(InputParalist));

    const paraArr = Para.split(',');
    for (let pName of paraArr) {
        resArr.push(innerCalMap[pName]);
    }
    return resArr;
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
    if (separator == undefined || ISNUMBER(val)) {
        return [];
    }

    let charArr = [];
    for (let c of valArr) {
        if (separator === c) {
            charArr.push(' ');
        } else {
            charArr.push(c);
        }
    }

    return charArr.join('').split(' ');
}

//======4.5=logic====================================================
function E_AND(...conditions) {
    if (conditions.length == 0) {
        return false;
    }

    for (let c of conditions) {
        if (!c) {
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
        if (c) {
            return true;
        }
    }
    return false;
}

function E_NOT(condition) {
    return !condition;
}

function E_IF(condition, trueVal, falseVal) {
    return condition ? trueVal : falseVal;
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
    if (!val) {
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
    if (val == undefined) {
        return null;
    }
    return '' + val;
}

function CNUM(val) {
    return parseFloat(val);
}

function CBOOL(val) {
    const realVal = val && _isString(val) ? val.toUpperCase() : val;

    if (realVal === 'YES' || realVal === 'TRUE' || realVal === true) {
        return true;
    }
    if (realVal === 'NO' || realVal === 'FALSE' || realVal === false) {
        return false;
    }
    return null;
}