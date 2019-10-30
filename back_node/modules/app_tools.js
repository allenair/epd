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
    simplifyRuleTemplate
};