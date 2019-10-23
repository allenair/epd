function _isNumber(obj) {
    return (typeof obj == 'number') && obj.constructor == Number;
}

function test() {
    if (innerObj == undefined) {
        console.log(111111)
    }
    let obj = {};
    try {

        obj['name'] = eval(innerObj);
        obj['aa'] = eval(aa);

    } catch (err) {
        // console.log(err);
        // return false;
    }
    // console.log(obj['name']);
    return false;
}


// console.log(_isNumber(12))
// console.log(_isNumber('12'))
// console.log(JSON.stringify({aa:"123",bb:456}))

let res = eval('var innerObj={aa:"asd",bb:123}; test();')
console.log(res)
// 