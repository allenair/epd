"use strict";

var epd = {
    inputs: [],
    outputs: [],
    logicUnits: [],

    calResultByRule: function (options) {
        if (!options['justRun']) {
            this.justInit(options);
        }

        // 动态变量声明，在执行逻辑运算时，eval会自动执行，此时前提是公式字符串中的变量名称在程序上下文中已经定义，
        // 因此此处需要根据解析出的input和output来动态生成声明变量的语句并执行，此处声明后，变量作用域为本函数
        for (let obj in this.inputs) {
            eval("var " + obj['name'] + " = ''; ");
        }
        for (let obj in this.outputs) {
            eval("var " + obj['name'] + " = ''; ");
        }



        return epdtool._checkParam('2.2', '(1,3)/0.3');
    },

    justInit: function (options) {
        this._initInputsFromTemplate(options["template"]);
        this._initOutputsFromTemplate(options["template"]);
        this._initLogicUnitFromTemplate(options["template"]);
    },

    _initInputsFromTemplate: function (tplObj) {
        var inputObj = tplObj['CPARA_InputParameterValueList'];
        this.inputs = [];
        for (let index in inputObj) {
            var obj = inputObj[index];
            var inMap = {};
            inMap['name'] = obj['PropertyName'];
            inMap['scope'] = obj['ValueList'] || '';
            inMap['type'] = 'N';
            this.inputs.push(inMap);
        }
    },

    _initOutputsFromTemplate: function (tplObj) {
        var outputObj = tplObj['CPARA_InternalParameterValueList'];
        this.outputs = [];
        for (let index in outputObj) {
            var obj = outputObj[index];
            var inMap = {};
            inMap['name'] = obj['PropertyName'];
            inMap['scope'] = obj['ValueList'] || '';
            inMap['type'] = 'N';
            this.outputs.push(inMap);
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
};