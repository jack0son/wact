// map(symbol => method)
const ActionDirectory = (actions) =>
	Object.keys(actions).reduce((dir, actionName) => {
		const symbol = Symbol(actionName);
		dir[symbol] = actions[actionName];
		return dir;
	}, {});

// Map(method => Symbol)
const SymbolDirectory = (actionDirectory) =>
	Object.getOwnPropertySymbols(actionDirectory).reduce((dir, symbol) => {
		dir.set(actionDirectory[symbol], symbol);
		return dir;
	}, new Map());

const actionTypeEncoder = (actionDirectory) => (msg) => ({
	...msg,
	type: msg.type.toString(),
});

const actionTypeDecoder = (actionDirectory) => {
	const symbolStringLut = Object.getOwnPropertySymbols(actionDirectory).reduce(
		(lut, symbol) => {
			lut[symbol.toString()] = symbol;
			return lut;
		},
		{}
	);

	return (msg) => {
		const { type } = msg;
		if (
			msg.type &&
			msg.type.length &&
			msg.type.startsWith &&
			msg.type.startsWith('Symbol')
		) {
			msg.type = symbolStringLut[type];
		}
		return msg;
	};
};

const getMessageType = (symbolDirectory) => (actionFunc) =>
	symbolDirectory.get(actionFunc);

const buildDirectory = (actions) => {
	const actionDirectory = ActionDirectory(actions);
	const symbolDirectory = SymbolDirectory(actionDirectory);
	return {
		actions: actionDirectory,
		symbols: symbolDirectory,
		address: getMessageType(symbolDirectory),
		encoder: actionTypeEncoder(actionDirectory),
		decoder: actionTypeDecoder(actionDirectory),
	};
};

const defaultLabelOpts = { trim: true };
function labelActions(actions, _opts) {
	const opts = { ...defaultLabelOpts, ..._opts };

	if (opts.trim) {
		return Object.keys(actions).reduce((actions, label) => {
			if (label.startsWith('action_')) {
				const action = actions[label];
				delete actions[label];
				actions[label.replace('action_', '')] = action;
			}
			return actions;
		}, actions);
	}

	// Map(currentLabel => newLabel)
	if (opts.relabelMap) {
		return Object.keys(relabelMap).reduce((actions, currentLabel) => {
			const newLabel = relabelMap[currentLabel];
			if (!!actions[newLabel])
				throw new Error(
					`Attempt to relabel action ${currentLabel} to ${newLabel}, when action with label ${newLabel} already exists.`
				);
			actions[newLabel] = actions[currentLabel];
			delete actions[currentLabel];
		}, actions);
	}
}

module.exports = {
	ActionDirectory,
	SymbolDirectory,
	buildDirectory,
	labelActions,
};
