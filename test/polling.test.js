const assert = require('assert');
const { bootstrap, dispatch } = require('../src/actor-system');
const { Polling } = require('../src/actors');

const actorStub = {
	properties: {},
	actions: {
		callback: (state, msg, ctx) => {
			msg.callback(state, msg, ctx);
		},
	},
};

context('Polling', function () {
	let director, a_polling, a_stub; // actor instances
	let stop_polling;

	beforeEach(function start_actors(done) {
		director = bootstrap();
		a_polling = director.start_actor('polling_service', Polling);
		a_stub = director.start_actor('stub', actorStub);

		stop_polling = (done) => {
			dispatch(a_polling, { type: 'stop' });
			done();
		};

		done();
	});

	afterEach(function stop_actors() {
		director.stop();
	});

	describe('#poll', function () {
		describe('When set to non-blocking', function () {
			it('should dispatch the target action after a delay', function (done) {
				const [delay, tolerance] = [20, 3]; // ms
				let count = 0;

				const callback = () => {
					++count;
					if (count == 1) {
						setTimeout(() => {
							assert(count < 2, 'Action called too early');
						}, delay - tolerance);
						setTimeout(() => {
							assert(count >= 2, 'Action called too late');
							done();
						}, delay + tolerance);
					}
				};

				dispatch(a_polling, {
					type: 'poll',
					target: a_stub,
					action: 'callback',
					period: delay,
					args: { callback },
				});
			});

			it('should not wait for previous action to complete', function (done) {
				const [delay, tolerance] = [10, 2]; // ms
				let count = 0;

				const callback = (state, msg, ctx) => {
					const myCount = ++count;
					setTimeout(() => {
						if (myCount <= 3)
							assert(
								count > myCount,
								'Polling appears to have blocked until previous action completed'
							);
						if (myCount == 3) stop_polling(done);
						dispatch(ctx.sender, { type: 'complete' }, ctx.self);
					}, delay * 3); // wait longer than polling interval
				};

				dispatch(a_polling, {
					type: 'poll',
					target: a_stub,
					action: 'callback',
					period: delay,
					args: { callback },
				});
			});
		});

		describe('When set to blocking', function () {
			it('should wait for previous action to complete', function (done) {
				const [delay, tolerance] = [10, 2]; // ms
				let count = 0;

				const callback = (state, msg, ctx) => {
					const myCount = ++count;
					setTimeout(() => {
						assert(
							count == myCount,
							'Polling did not block until previous action complete'
						);
						dispatch(ctx.sender, { type: 'complete' }, ctx.self);
						if (myCount == 3) {
							stop_polling(done);
						}
					}, delay * 3); // wait longer than polling interval
				};

				dispatch(a_polling, {
					type: 'poll',
					target: a_stub,
					action: 'callback',
					period: delay,
					args: { callback },
					blockTimeout: delay * 5, // comfortable buffer
				});
			});

			it('should resume polling if blocking times out', function (done) {
				const [delay, tolerance] = [10, 2]; // ms
				const failAt = 4;
				let count = 0;

				const callback = (state, msg, ctx) => {
					const myCount = ++count;
					let myDelay = delay;
					if (myCount < failAt) myDelay *= myCount;
					setTimeout(() => {
						dispatch(ctx.sender, { type: 'complete' }, ctx.self);
						if (count >= failAt) {
							stop_polling(done);
						} else {
							assert(
								count == myCount,
								'Polling did not block until previous action complete'
							);
						}
					}, myDelay); // wait longer than blocking timeout
				};

				dispatch(a_polling, {
					type: 'poll',
					target: a_stub,
					action: 'callback',
					period: delay,
					args: { callback },
					blockTimeout: delay * (failAt - 1),
				});
			});
		});
	});

	describe('#interupt', function () {
		it('should stop polling', function (done) {
			const [delay, tolerance] = [10, 1]; // ms
			let count = 0;
			let maxCalls = 5;

			const callback = () => {
				++count;
			};

			dispatch(a_polling, {
				type: 'poll',
				target: a_stub,
				action: 'callback',
				period: delay,
				args: { callback },
			});

			setTimeout(() => {
				dispatch(a_polling, { type: 'interupt' });
			}, delay * (maxCalls - 1) - tolerance); //tolerance);

			setTimeout(() => {
				if (count > maxCalls) {
					assert(false, 'Action called after interupt');
				}
				done();
			}, delay * maxCalls + tolerance);
		});
	});
});
