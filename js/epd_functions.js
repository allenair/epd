"use strict";

//======inner functions===================================================
const epdtool = {
    // 此函数是一个桩函数，目的是内外建立关联，使用时候外部需要定义此函数并传入
    _outerFunction: function (DNum, Para, inputParaArr) {
        return '';
    },

    // 此函数中只能使用eval中动态声明的变量，包括当前环境的所有输入输出参数，和模板对应的table对象
    _queryTableFunction: function (TNo, RNo, inputParaArr, is3DFlag) {
        console.log(tableObj);
        let queryRsultArr = [];

        let innerTableObj = tableObj[TNo];
        let conArr = innerTableObj['conditionArray'];
        let resArr = innerTableObj['resultArray'];

        let conParamObj = {};
        if (conArr.length > 0) {
            for (let pname in conArr[0]) {
                conParamObj[pname] = eval(pname);
            }
        }

        let flag = false;
        // 没有参数使用条件结果表格获取值（excel中有灰色）
        if (inputParaArr.length == 0) {
            for (let pindex in conArr) {
                flag = true;
                pindex = Number.parseInt(pindex);
                for (let pname in conArr[pindex]) {
                    let realVal = conParamObj[pname];
                    let scopeVal = conArr[pindex][pname];
                    if (scopeVal.startsWith('@')) {
                        scopeVal = eval(scopeVal.substring(1));
                    }

                    flag = this._checkParam(realVal, scopeVal);
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

                    flag = this._checkParam(realVal, scopeVal);
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
            return queryRsultArr;
        }
        return NaN;
    },

    _isString: function (str) {
        return (typeof str == 'string') && str.constructor == String;
    },

    _isNumber: function (obj) {
        return (typeof obj == 'number') && obj.constructor == Number;
    },

    _isEqual: function (val1, val2) {
        if (Math.abs(val1 - val2) < 1e-8) {
            return true;
        }
        return false;
    },

    // 根据模板指定，标定参数的所属类型，对照关系是：
    // Text --> S   Number --> N   Yes/No --> B
    // 3DText --> 3DS   3DNumber --> 3DN  3DYes/No --> 3DB
    _paramType: function (typeName) {
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
    },

    // 计算小数位数，目的是解决准确计算问题，一般需要将浮点转换为整数计算，例如1.5, 0.15, 0.00015这三个数都需要转换为15，
    // 此函数就是得到转换到15，三个数都需要乘以几个10（10的幂数），以便与其同时计算的其他数字扩大相同倍数
    _calFloatDigitsCount: function (val) {
        if (!val) {
            return 0;
        }

        const valStr = val.toString();
        if (valStr.indexOf('.') < 0) {
            return 0;
        }
        return valStr.length - valStr.indexOf('.') - 1;
    },

    // 根据scope类型，对val进行是否满足scope要求进行判断，val为空值为不符合，scope的类型为N则符合，其他根据要求进行判断
    _checkParam: function (val, scopeStr) {
        if (!val || val === 'NA') {
            return false;
        }

        const scopeMap = this._parseValueScope(scopeStr);
        // 没有指定范围
        if (scopeMap['valType'] === 'N') {
            return true;
        }

        // 只有一个取值
        if (scopeMap['valType'] === 'O') {
            let varOne = scopeMap['valScope'].toString();
            if (varOne == val.toString()) {
                return true;
            }

        } else if (scopeMap['valType'] === 'D') { // 离散取值
            let varArr = scopeMap['valScope'];
            for (let s of varArr) {
                if (s == val.toString()) {
                    return true;
                }
            }

        } else { // 范围取值
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
                let stepDigits = this._calFloatDigitsCount(step);
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
    },

    // 将scope的值进行解析，为空标记为N, 单个值标记为O，范围值标记为S（并处理上下界以及步长问题），离散值标记为D（并解析为数组，以英文逗号分隔）
    _parseValueScope: function (scopeStr) {
        const resMap = {};
        if (!scopeStr || scopeStr === 'NA' || scopeStr === 'ANY') {
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
                    valArr.push(this._realValue(tmp, 'B').toString());
                } else {
                    valArr.push(tmp);
                }
            }
            resMap['valScope'] = valArr;

        } else {
            resMap['valType'] = 'O';
            if (ISLOGICAL(val)) {
                resMap['valScope'] = this._realValue(valStr, 'B').toString();
            } else {
                resMap['valScope'] = val || '';
            }
        }

        return resMap;
    },

    // 解析GetValueFromGL的第三个特殊参数格式
    _parseGLParamter: function (paramStr) {
        if (!paramStr) {
            return [];
        }

        const resArr = [];
        const paramArr = paramStr.split(',');

        for (let val of paramArr) {
            let innerMap;
            let innerTmpArr, srcParamName, targetParamName;

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
                innerMap['src'] = this._realValue(srcParamName);
                innerMap['type'] = 'value';

            } else {
                innerMap['src'] = srcParamName;
                innerMap['type'] = 'map';
            }
            resArr.push(innerMap);
        }
        return resArr;
    },

    // 依据传入的字符串得到真正的数值
    _realValue: function (valStr, dataType) {
        if (valStr == null || valStr == undefined || valStr.toString() === "NaN") {
            return 'NA';
        }

        if (dataType || dataType.startsWith('3D')) {
            let valArr = valStr.split(',');
            let resArr = [];
            for (let val of valArr) {
                if (dataType === '3DB') {
                    resArr.push(this._realValue(val, 'B'));
                } else if (dataType === '3DN') {
                    resArr.push(this._realValue(val, 'N'));
                } else {
                    resArr.push(this._realValue(val, 'S'));
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


    },

    // 处理公式问题，例如字符串拼接 & 需要修改为JS支持的 +，YES、NO转化为JS的true、false
    _dealFormularStr: function (valStr) {
        if (valStr == null || valStr == undefined) {
            return '';
        } else if (ISLOGICAL(valStr)) {
            return this._realValue(valStr, 'B');

        } else {
            return valStr.replace(/&/g, '+');
        }
    }
};

//======4.2=get-info====================================================
function GetValueFromGL(DNum, Para, InputParalist) {
    const innerCalMap = epdtool._outerFunction(DNum, Para, epdtool._parseGLParamter(InputParalist));
    return innerCalMap[Para];
}

function GetValuesFromGL(DNum, Para, InputParalist) {
    const resArr = [];
    const innerCalMap = epdtool._outerFunction(DNum, Para, epdtool._parseGLParamter(InputParalist));

    const paraArr = Para.split(',');
    for (let pName of paraArr) {
        resArr.push(innerCalMap[pName]);
    }
    return resArr;
}

function QueryTable(TNo, RNo, QCol) {
    return epdtool._queryTableFunction(TNo, RNo, epdtool._parseGLParamter(QCol), false);
}

function QueryTable3D(TNo, RNo, QCol) {
    return epdtool._queryTableFunction(TNo, RNo, epdtool._parseGLParamter(QCol), true);
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
    if (!ISNUMBER(val) || !ISNUMBER(significance) || epdtool._isEqual(significance, 0)) {
        return NaN;
    }

    val = parseFloat(val);
    significance = parseFloat(significance);

    if (val > 0 && significance < 0) {
        return NaN;
    }

    if (epdtool._isEqual(val, 0)) {
        return 0;
    }

    if (val * significance > 0) {
        const flag = val > 0 ? 1 : -1;

        const nval = val > 0 ? val : -1 * val;
        const nsignificance = significance > 0 ? significance : -1 * significance;

        const times = Math.round(nval / nsignificance);
        const lower = times * nsignificance;
        const upper = (times + 1) * nsignificance;

        if (lower > nval || epdtool._isEqual(lower, nval)) {
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
    if (!ISNUMBER(val) || !ISNUMBER(significance) || epdtool._isEqual(significance, 0)) {
        return NaN;
    }

    val = parseFloat(val);
    significance = parseFloat(significance);

    if (val > 0 && significance < 0) {
        return NaN;
    }

    if (epdtool._isEqual(val, 0)) {
        return 0;
    }

    if (val * significance > 0) {
        const flag = val > 0 ? 1 : -1;

        const nval = val > 0 ? val : -1 * val;
        const nsignificance = significance > 0 ? significance : -1 * significance;

        const times = Math.round(nval / nsignificance);
        const lower = (times - 1) * nsignificance;
        const upper = times * nsignificance;

        if (upper < nval || epdtool._isEqual(upper, nval)) {
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

    const realVal = epdtool._isString(val) ? val.toUpperCase() : '';

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
    const realVal = val && epdtool._isString(val) ? val.toUpperCase() : val;

    if (realVal === 'YES' || realVal === 'TRUE' || realVal === true) {
        return true;
    }
    if (realVal === 'NO' || realVal === 'FALSE' || realVal === false) {
        return false;
    }
    return null;
}