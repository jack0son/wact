// Reducers receive the message bundle, apply effects then return the modified
// state. They are pure functions that must be applied last in the chain of
// functions called on a message.
const noEffect = (state) => state;

/**
 * Make pattern object. Here pattern refers to a pattern similar to an arm of
 * a Rust match expression - a predicate function which maps to an expression
 * that will execute if the predicate is truthy.
 *
 * @param {(state) => boolean} predicate - Expression to test
 * @param {Action} effect - Action handler function (accepts message bundle)
 * @return {Pattern} Pattern instance
 */
function Pattern(predicate, effect) {
	return { predicate, effect };
}

/**
 * Subsumption state reducer - apply last effect in patterns list with truthy
 * predicate:
 *  	1. actor receives message that mutates state
 *  	2. actor applies the state mutation
 *  	3. actor calls reduce
 *  	4. reduce applies predicates to the new state and returns an effect result
 * Patterns are listed in ascending order of precedence - i.e. apply the last
 * matching effect.
 *
 * @param {Pattern[]} patterns - List of Patterns to evaluate
 * @param {Action} defaultEffect - Default effect to apply
 * @return {Action} Reducer function
 */
const subsumeEffects = (patterns, defaultEffect = noEffect) => (state, msg, ctx) => ({
	...state,
	...patterns.reduce(
		(effect, pattern) => (pattern.predicate(state) ? pattern.effect : effect),
		defaultEffect
	)(state, msg, ctx),
});

/**
 *  Match reducer - apply first matching effect
 *
 * @param {Pattern[]} patterns - List of Patterns to evaluate
 * @param {Action} defaultEffect - Default effect to apply
 * @return {Action} Reducer function
 */
const matchEffects = (patterns, defaultEffect = noEffect) => (state, msg, ctx) => ({
	...state,
	...patterns
		.reverse()
		.reduce(
			(effect, pattern) => (pattern.predicate(state) ? pattern.effect : effect),
			defaultEffect
		)(state, msg, ctx),
});

/**
 * Apply all matching effects in a sequential pipline
 *
 * @function pipeEffects
 * @param {Pattern[]} patterns - List of Patterns to evaluate
 * @return {Action} Reducer function
 */
const pipeEffects = (patterns) => (state, msg, ctx) => ({
	...state,
	...patterns.reduce(
		(state, pattern) => (pattern.predicate(state) ? pattern.effect(state) : state),
		state
	)(state, msg, ctx),
});

/**
 * Imperative FSM engine. States and effects specified in effects map.
 *
 * @function effectFSM
 * @param {event: string -> stages: string[] -> Action} effectsMap - Finite
 * state machine definition
 * @return {Action} Reducer function
 */
const effectFSM = (effectsMap) => (state, msg, ctx) => {
	const { stage } = state;
	const { event } = msg;

	ctx.debug.info(msg, `Got <${event}> in stage ╢ ${stage} ╟`);
	const applicableStages = effectsMap[event];

	if (!applicableStages) {
		ctx.debug.warn(msg, `No applicable stages for event <${event}>`);
		return state;
	}

	const action = applicableStages[stage];
	if (!action) {
		ctx.debug.warn(msg, `Event <${event}> has no action in stage ╢ ${stage} ╟`);
		return state;
	}

	ctx.reduce = ctx.receivers.reduce;

	return { ...state, ...action.effect(state, msg, ctx) }; // next state
};

module.exports = {
	Pattern,
	noEffect,
	subsumeEffects,
	matchEffects,
	pipeEffects,
	effectFSM,
};
