class Test{
	constructor(para1){
		this.para1 = para1;
	}
	myMethod(aa){
		console.log(`You input is ${aa}, inner has ${this.para1}`);
	}
}

let tt = new Test('Hello');
tt.myMethod('world');

let arr = ['a','b','c'];
arr.forEach((val, index)=>{
	console.log(index + '  '+val);
});

let str = "asdfg   "
console.log(`ss=${str.trim().toUpperCase()}`)