const TaskStatuses = {
	init: Symbol('init'),
	ready: Symbol('ready'),
	pending: Symbol('pending'),
	invalid: Symbol('invalid'),
	failed: Symbol('failed'),
	abort: Symbol('abort'),
	done: Symbol('done'),
};

const statusList = Object.values(TaskStatuses);
const statusLut = statusList.reduce((lut, status) => {
	lut[status] = true;
	return lut;
}, Object.create(null));

const StatusStrings = statusList.reduce((dict, symbol) => {
	dict[symbol.toString()] = symbol;
	return dict;
}, Object.create(null));

//const isStatus = (status) => statusList.includes(status);
const isStatus = (status) => !!statusLut[status];

const parseStatus = (status) =>
	typeof status === 'string' ? Statuses[status] : isStatus(status) ? status : null;

// @TODO encoder for message types
const encoder = (_msg) => {
	const msg = { ..._msg };
	if (msg.task) {
		msg.task = { ..._msg.task };
		if (msg.task.status) msg.task.status = msg.task.status.toString();
	}
	// console.log(encoded, msg);
	return msg;
};

const decoder = (msg) => {
	const { task } = msg;
	if (task && task.status) task.status = StatusStrings[task.status];
	// console.log('encoded', msg);
	return msg;
};

module.exports = { TaskStatuses, statusList, isStatus, parseStatus, encoder, decoder };
