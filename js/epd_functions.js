"use strict";

//======inner functions===================================================
var epdtool = {
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
    _calFloatDigitsCount: function (val) {
        if (!val) {
            return 0;
        }

        var valStr = val.toString();
        if (valStr.indexOf('.') < 0) {
            return 0;
        }
        return valStr.length - valStr.indexOf('.') - 1;
    },
    _checkParam: function (val, scopeStr) {
        if (!val) {
            return false;
        }

        var scopeMap = this._parseValueScope(scopeStr);
        // 没有指定范围
        if (scopeMap['valType'] === 'N') {
            return true;
        }

        // 只有一个取值
        if (scopeMap['valType'] === 'O') {
            var varOne = scopeMap['valScope'].toString();
            if (varOne == val.toString()) {
                return true;
            }
        }

        // 离散取值
        if (scopeMap['valType'] === 'D') {
            var varArr = scopeMap['valScope'];
            for (let s of varArr) {
                if (s == val.toString()) {
                    return true;
                }
            }

        } else { // 范围取值
            var realVal = parseFloat(val);
            var varMap = scopeMap['valScope'];
            var step = varMap['step'];
            var startNum = varMap['startNum'];
            var endNum = varMap['endNum'];
            var startFlag = varMap['startFlag'];
            var endFlag = varMap['endFlag'];

            if (startFlag && realVal < startNum || !startFlag && realVal <= startNum || endFlag && realVal > endNum || !endFlag && realVal >= endNum) {
                return false;
            }

            if (step === '1') {
                return true;

            } else {
                var stepDigits = this._calFloatDigitsCount(step);
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
    _parseValueScope: function (scopeStr) {
        var resMap = {};
        if (!scopeStr || scopeStr === 'NA') {
            resMap['valType'] = 'N';
            return resMap;
        }

        var val = scopeStr.toString();
        var startChar = val.charAt(0);
        var endChar = val.charAt(val.length - 1);

        if (startChar === '(' || startChar === '[') {
            resMap['valType'] = 'S';
            var valMap = {};
            var realScope, tmpArr;

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
            resMap['valScope'] = val.split(',');

        } else {
            resMap['valType'] = 'O';
            resMap['valScope'] = val || '';
        }

        return resMap;
    }

};











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
    return Math.abs(val);
}

function ACOS(val) {
    return Math.acos(val);
}

function ASIN(val) {
    return Math.asin(val);
}

function ATAN(val) {
    return Math.atan(val);
}

function COS(val) {
    return Math.cos(val);
}

function SIN(val) {
    return Math.sin(val);
}

function TAN(val) {
    return Math.tan(val);
}

function PI() {
    return Math.PI;
}

function DEGREES(val) {
    if (!ISNUMBER(val)) {
        return NaN;
    }
    return val * 180.0 / Math.PI;
}

function RADIANS(val) {
    if (!ISNUMBER(val)) {
        return NaN;
    }
    return val * Math.PI / 180.0;
}

function ROUND(val, precision) {
    if (!ISNUMBER(val) || !ISNUMBER(precision)) {
        return NaN;
    }

    var flag = val > 0 ? 1 : -1;
    var tmp = Math.pow(10, precision);
    return flag * Math.round(Math.abs(val) * tmp) / tmp;
}

function ROUNDUP(val, precision) {
    if (!ISNUMBER(val) || !ISNUMBER(precision)) {
        return NaN;
    }

    var flag = val > 0 ? 1 : -1;
    var tmp = Math.pow(10, precision);
    var correctVal = 0.5 / tmp;
    return flag * Math.round((Math.abs(val) + correctVal) * tmp) / tmp;
}

function ROUNDDOWN(val, precision) {
    if (!ISNUMBER(val) || !ISNUMBER(precision)) {
        return NaN;
    }

    var flag = val > 0 ? 1 : -1;
    var tmp = Math.pow(10, precision);
    var correctVal = 0.5 / tmp;
    return flag * Math.round((Math.abs(val) - correctVal) * tmp) / tmp;
}

function INT(val) {
    var tmp = ROUNDDOWN(val, 0);
    return tmp <= val ? tmp : tmp - 1;
}

function LN(val) {
    return Math.log(val);
}

function LOG(val, base) {
    return Math.log(val) / Math.log(base || 10);
}

function MAX(...numbers) {
    if (numbers.length == 0) {
        return 0;
    }

    var maxNum = -Infinity;
    for (let num of numbers) {
        if (ISNUMBER(num) && num > maxNum) {
            maxNum = num;
        }
    }
    return maxNum;
}

function MIN(...numbers) {
    if (numbers.length == 0) {
        return 0;
    }

    var minNum = Infinity;
    for (let num of numbers) {
        if (ISNUMBER(num) && num < minNum) {
            minNum = num;
        }
    }
    return minNum;
}

function POWER(val, powerNum) {
    return Math.pow(val, powerNum);
}

function SQRT(val) {
    return Math.sqrt(val);
}

function EMOD(val, divisor) {
    if (!ISNUMBER(val) || !ISNUMBER(divisor)) {
        return NaN;
    }

    var tmp = INT(val / divisor);
    return val - tmp * divisor;
}

function CEILING(val, significance) {
    if (!ISNUMBER(val) || !ISNUMBER(significance) || epdtool._isEqual(significance, 0)) {
        return NaN;
    }

    if (val > 0 && significance < 0) {
        return NaN;
    }

    if (epdtool._isEqual(val, 0)) {
        return 0;
    }

    if (val * significance > 0) {
        var flag = val > 0 ? 1 : -1;

        var nval = val > 0 ? val : -1 * val;
        var nsignificance = significance > 0 ? significance : -1 * significance;

        var times = Math.round(nval / nsignificance);
        var lower = times * nsignificance;
        var upper = (times + 1) * nsignificance;

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

    if (val > 0 && significance < 0) {
        return NaN;
    }

    if (epdtool._isEqual(val, 0)) {
        return 0;
    }

    if (val * significance > 0) {
        var flag = val > 0 ? 1 : -1;

        var nval = val > 0 ? val : -1 * val;
        var nsignificance = significance > 0 ? significance : -1 * significance;

        var times = Math.round(nval / nsignificance);
        var lower = (times - 1) * nsignificance;
        var upper = times * nsignificance;

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
    return true;
}

function ISLOGICAL(val) {
    if (!val) {
        return false;
    }

    var realVal = epdtool._isString(val) ? val.toUpperCase() : '';

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
    if (val.toString() === 'NA' || val.toString() === 'NaN') {
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
    var realVal = val && epdtool._isString(val) ? val.toUpperCase() : val;

    if (realVal === 'YES' || realVal === 'TRUE' || realVal === true) {
        return true;
    }
    if (realVal === 'NO' || realVal === 'FALSE' || realVal === false) {
        return false;
    }
    return null;
}