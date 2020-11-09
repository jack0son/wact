const {
	start,
	query,
	stop,
	spawn,
	spawnStateless,
	configurePersistence,
	spawnPersistent,
	dispatch,
} = require('nact');
const { block } = require('./lib/nact-utils');
const { buildReceiversHOF } = require('./receivers');
const action = require('./action');
const { merge } = require('./lib/utils');
const { parse_bool } = require('@packages/lib/utils');
const MessageDebugger = require('./lib/message-debugger');

// Whether revovery stage in persistent actor should print debug logs
const DEBUG_RECOVERY = parse_bool(process.env.DEBUG_RECOVERY);

const DEFAULT_ACTION_KEY = 'default_action';

// @TODO Use class/prototype instead of closure pattern for actor wrapper
// - so many being instantiated, memory is being exhausted

/**
 * Make receiver functions available to actor actions by binding them to the
 * message bundle.
 *
 * @function bind_receivers
 * @param {(Bundle) => receiver: string -> fn} receivers - Make receivers HOF
 * @param {Message} msg - Received message
 * @param {object} state - Actor state
 * @param {Context} ctx - Actor context
 * @return {receiver: string -> fn} Receivers map
 */
const bind_receivers = (receivers) => (state, msg, ctx) =>
	receivers && receivers({ state, msg, ctx });

const validateReceivers = (receivers) => {
	if (typeof receivers !== 'array') {
		throw new Error(`Property 'receivers' must be an array`);
		console.log(receivers);
	}
	return true;
};

/**
 * Spawn a stateful actor
 *
 * @function spawn_actor
 * @param {System} _parent - Parent system
 * @param {string} _name - Actor name
 * @param {action: string -> Action} _actionsMap - Mapping of action names to functions
 * @param {object} _initialState - Actor's inital state
 * @param {Propertiesj} _properties - Actor properties
 * @return {Actor} Actor instance
 */
const spawn_actor = (_parent, _name, _actionsMap, _initialState, _properties) => {
	const { Receivers, receivers, initialState, ...properties } = _properties; // never reference actor definition
	const _receivers = bind_receivers(receivers ? buildReceiversHOF(receivers) : Receivers);
	const action = route_action(_actionsMap);
	const debug = MessageDebugger(_name);

	properties.initialState = merge(initialState, _initialState);
	return spawn(
		_parent,
		//(state = _initialState, msg, context) => {
		(state, msg, context) => {
			//console.log('spawn_actor:state', state);
			//if (!state) console.log('undefined state for actor: ', context.self);
			context.debug = debug; // provide debug to receiver context
			context.receivers = _receivers(state, msg, context);
			return action(state, msg, context);
		},
		_name,
		properties
	);
};

/**
 * Spawn an actor which can persist its state to a storage repository
 *
 * @function spawn_actor
 * @param {System} _parent - Parent system
 * @param {string} _name - Actor name
 * @param {action: string -> Action} _actionsMap - Mapping of action names to
 *		handler functions.
 * @param {object} _initialState - Actor's inital state
 * @param {Propertiesj} _properties - Actor properties
 * @return {Actor} Actor instance
 */
const spawn_persistent = (_parent, _name, _actionsMap, _initialState, _properties) => {
	if (!_properties || !_properties.persistenceKey) {
		throw new Error(`Persistent actor must define 'persistenceKey' property`);
	}

	const {
		persistenceKey,
		Receivers,
		receivers,
		initialState,
		...properties
	} = _properties; // never reference actor definition
	properties.initialState = merge(initialState, _initialState);

	const action = route_action(_actionsMap);
	const _receivers = bind_receivers(receivers ? buildReceiversHOF(receivers) : Receivers);
	const debug = MessageDebugger(_name);
	debug.control.enabledByApp = debug.control.enabled();

	let recovering = false;
	const target = debug.control.enabledByApp
		? (state, msg, context) => {
				context.debug = debug;
				if (context.recovering) {
					if (!recovering) {
						recovering = true;
						debug.log(`----- Recovering persisted state...`);
						if (!DEBUG_RECOVERY) {
							debug.control.disable();
						}
					}
				} else if (recovering) {
					recovering = false;
					if (!debug.control.enabled()) {
						debug.control.enable();
					}
					debug.log(`----- ... recovery complete.`);
				}
				context.receivers = _receivers(state, msg, context);
				return action(state, msg, context);
		  }
		: (state, msg, context) => {
				context.debug = debug;
				context.receivers = _receivers(state, msg, context);
				return action(state, msg, context);
		  };

	return spawnPersistent(_parent, target, persistenceKey, _name, properties);
};

const isAction = (action) => action && typeof action == 'function';
const isSystem = (system) => !!system && !!system.name;
const isPersistentSystem = (system) => isSystem(system); // @TODO define persistent properties

/**
 * Pass message bundle to action handler
 *
 * @async
 * @function route_action
 * @param {action: string -> Action} _actionsMap - Mapping of action names to functions
 * @param {object} _state - Actor state
 * @param {Message} _msg - Received message
 * @param {Context} _ctx - Actor context
 * @return {Promise<state: object>} Next actor state
 */
const route_action = (_actionsMap) => async (_state, _msg, _ctx) => {
	const action = _actionsMap[_msg.type] || _actionsMap[DEFAULT_ACTION_KEY];
	if (!isAction(action)) {
		console.warn(`${_ctx.name} ignored unknown message:`, _msg);
		return _state;
	}

	// Undefined next state indicates that action has no effect on state
	const nextState = await action.call(_ctx, _state, _msg, _ctx);
	return nextState !== undefined ? nextState : _state;
	// return action.call(_ctx, _state, _msg, _ctx);
	// if (!nextState)
	// 	_ctx.debug.warn(
	// 		_msg,
	// 		`Action type:${_msg.type}, method:${action.name}() returned undefined state`
	// 	);
	//return nextState;
};

/**
 * Spawn an actor instance using an actor definition
 * @param {System} _parent - Parent system
 * @return {fn} Actor constructor
 */
function start_actor(_parent) {
	/**
	 * @param {string} _name - Actor name
	 * @param {Definition} _definition - Actor definition
	 * @param {object} _initialState - Actor's inital state
	 * @return {Actor} Actor instance
	 */
	return (_name, _definition, _initialState) => {
		if (!isSystem(_parent)) {
			throw new Error(`Parent actor must be provided`);
		}
		const { actions, properties } = _definition;
		if (!actions) {
			throw new Error(`No actions defined for '${_name}' actor`);
		}

		return spawn_actor(_parent, _name, actions, _initialState, properties);
	};
}

/**
 * Spawn a persistent actor instance using an actor definition
 * @param {System} _parent - Parent system
 * @return {fn} Actor constructor
 */
const start_persistent = (_persistentSystem) => (_name, _definition, _initialState) => {
	if (!isPersistentSystem(_persistentSystem)) {
		throw new Error(`Persistent system must be provided`);
	}
	const { actions, properties } = _definition;
	if (!actions) {
		throw new Error(`No actions defined for {${_name}} actor`);
	}

	return spawn_persistent(_persistentSystem, _name, actions, _initialState, properties);
};

/**
 * Instantiate a nact actor system
 *
 * @param {PersistenceEngine} _persistenceEngine - Persistence engine
 * @return {Director} Nact actor system with bound methods
 */
function bootstrap(_opts = {}, _persistenceEngine) {
	const system = _persistenceEngine
		? start(_opts, configurePersistence(_persistenceEngine))
		: start(_opts);
	return {
		start_actor: start_actor(system),
		start_persistent: _persistenceEngine && start_persistent(system),
		stop: () => stop(system),
		dispatch,
		system,
	};
}

module.exports = {
	bootstrap,
	spawn_actor,
	spawnStateless,
	start_actor,
	start_persistent,
	dispatch,
	query,
	block,
	stop,
	action,
};
