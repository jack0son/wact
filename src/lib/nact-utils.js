const { query } = require('nact');

const FATAL_HANG_TIME = 1000 * 1000; //ms
/**
 * Blocking message dispatch. Wait for a response from the consumer.
 * Intended for use by actors in place of query which should generally
 * only be used by external callers to the actor system.
 *
 * Useful for identifing temporal dependencies between actors which
 * should seldom exist.
 *
 * @param {Actor} _consumer - Message recipient
 * @param {Message} _msg - Message to send
 * @return {Promise} Query timeout or resolution
 */
function block(_consumer, _msg) {
	return query(_consumer, _msg, FATAL_HANG_TIME).catch((error) => {
		throw new Error(
			`APPLICATION HANG: blocking query timed out (${FATAL_HANG_TIME}ms). Are you sure you want temporally coupled actors?`
		);
	});
}

module.exports = { block };
