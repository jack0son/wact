const { dispatch } = require('nact');

const terminate = (msg, err, ctx) => {
	console.log(
		`${ctx.path.toString()}: onCrash: The following error was raised when processing message %O:\n%O\nTerminating faulted actor`,
		msg,
		err
	);
	return ctx.stop;
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Retry processing a message in a delayed loop until it does not throw,
 * increasing the delay exponentially with subsequent attempts.
 *
 * @function exponentialRetry
 * @param {number} factor - Delay = 2^(crash_count) * factor
 * @param {number} maxAttempts - Number of attempts before actor terminates
 * @return {SupervisionAction} Supervision action to take
 */
const exponentialRetry = (factor, maxAttempts) => {
	let count = 1;
	return async (msg, error, ctx) => {
		console.log(error);
		console.log(`Exponential retry ${count}:${ctx.self.name}`);
		// Only increment delay after first crash.
		// Will stop incrementing counter once a reliable delay is found.
		// Crashing on a new message will use previous delay.
		if (msg._crashed) count++;

		if (!maxAttempts || count <= maxAttempts) {
			await delay((2 ** count - 1) * factor);
			msg._crashed = count;
			dispatch(ctx.self, msg, ctx.sender);
			return ctx.resume;
		}
		return ctx.stop;
	};
};

module.exports = { terminate, exponentialRetry };
