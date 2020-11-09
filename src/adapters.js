// Adapters are actor definition mixins. They return an actions object that
// can be included in other actor definitions.
const { dispatch } = require('nact');
const { matchSinkHandler } = require('./receivers');

/**
 * Call matching handler for received sink message and apply reducer if
 * one is specified.
 * @dev Supervisor steps (return ctx.stop etc) must be handled in effects not
 * sink handlers.
 *
 * @param {(Bundle) => state} reducer - Reducer function
 * @return {Action} Sink action method
 */
function SinkReduce(reducer) {
	return {
		sink: (state, msg, ctx) => {
			const nextState = matchSinkHandler({ state, msg, ctx })(ctx.sender)(
				state,
				msg,
				ctx
			);
			return reducer ? reducer(nextState, msg, ctx) : nextState;
		},
	};
}

/**
 * Apply sink handler to state and commit state before triggering a reducer or
 * other arbitrary action.
 *
 * Decouples mutation due to sink from mutation due to effects
 *
 * @param {String | Symbol} messageType - Message type
 * @param {options} opts - Specify message payload and parties
 * @return {Action} Sink action method
 */
function SinkDispatch(messageType, { recipient, sender, payload }) {
	return {
		sink: (state, msg, ctx) => {
			dispatch(
				recipient || ctx.self,
				{ type: messageType || 'reduce', ...payload },
				sender || ctx.self
			);
			return matchSinkHandler({ state, msg, ctx })(ctx.sender)(state, msg, ctx);
		},
	};
}

// @TODO more sensible constructor for adapting sink protocol (including
// required state)
function SinkDefinition(sinkHandlers) {
	return {
		properties: {
			initialState: { sinkHandlers },
		},

		actions: {
			sink: (state, msg, ctx) => {
				matchSinkHandler({ state, msg, ctx })(ctx.sender)(state, msg, ctx);
			},
		},
	};
}

module.exports = { SinkReduce, SinkDispatch, SinkDefinition };
