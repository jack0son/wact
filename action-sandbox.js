class Base {
	constructor() {
		this.junk = true;
		this.create_symbol_directory();
		this.constructor.prototype.methodToSymbol = this.methodToSymbol;
		this.constructor.prototype.symbolToMethod = this.symbolToMethod;
	}

	static getMethodToSymbol(method) {
		return this.methodToSymbol.get(method);
	}

	static getSymbolToMethod(symbol) {
		return this.symbolToMethod[symbol];
	}

	base_method() {}

	get_method_names() {
		const myMethods = Object.getOwnPropertyNames(this.constructor.prototype).filter(
			(p) => typeof this[p] === 'function' && p !== 'constructor'
		);
		//console.log('Child methods: ', myMethods);
		return myMethods;
	}

	get_actions() {
		return this.get_method_names().reduce(
			(actions, n) => {
				actions[n] = this[n];
				return actions;
			},
			{ ...Base.symbolToMethod }
		);
	}

	create_symbol_directory() {
		this.methodToSymbol = new Map();
		this.symbolToMethod = this.get_method_names().reduce((symbolToMethod, method) => {
			const actionSymbol = Symbol(method);
			this.methodToSymbol.set(this[method], Symbol(method));
			symbolToMethod[actionSymbol] = this[method];
			this[actionSymbol] = this[method];
			return symbolToMethod;
		}, {});
	}

	create_actions() {}
}

class Actions extends Base {
	constructor(directoryRef) {
		super();
		//this.get_methods();
	}

	action_do() {
		console.log('action_do: this', this);
	}

	action_stop() {
		console.log(Actions.getMethodToSymbol);
		return Actions.getMethodToSymbol(Actions.action_do);
	}
}

const actions = new Actions();
//console.log(actions.get_actions());
//console.dir(actions);

//console.log(actions.methodToSymbol);
console.log(Actions.getMethodToSymbol);

function MyActor() {
	return {
		actions: { ...new Actions().get_actions() },
	};
}

const actor = MyActor();
//console.dir(actor);

actions.action_stop();
//actor.actions.action_do();

function base() {
	console.dir(Base.prototype);
	const base = new Base();
	console.dir(base);
	const b = { ...actions.get_actions() };
}

const MyActions = () => new Actions();
