// @TODO reducers replace all this functionality

// An effect behaves like a function pipeline
// -- it receives the original state of the actor as well as the latest sate
// from the previous effect or action function
// -- effects have the same function signature as an action

//'action_name': applyPostEffect(state, msg, ctx)(dispatchSinks)(action)
const applyPostEffect = (state, msg, ctx) => (effect) => (action) => {
	const nextState = action(state, msg, ctx);
	const effectState = effect(msg, ctx, nextState);
	return effectState ? effectState : nextState;
};

// @TODO this could be creating some memory inefficiencies
//	i.e. if states are being copied instead of referenced
const withEffect = (state, msg, ctx) => (action_a) => (action_b) => {
	const orig = { ...state }; // preserve original state

	const state_a = action_a(state, msg, ctx);
	const nextState = state_a ? state_a : state;

	const state_b = action_b({ ...nextState, _state: orig }, msg, ctx);
	return state_b ? state_b : nextState;
};

module.exports = {
	withEffect,
};
