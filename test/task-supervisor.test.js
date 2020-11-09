const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
chai.use(chaiAsPromised);
const should = chai.should();

const { TaskSupervisor } = require('../src/actors');
const {
	bootstrap,
	start_actor,
	dispatch,
	query,
	block,
	stop,
} = require('../src/actor-system');
const { matchEffects, subsumeEffects, Pattern } = require('../src/reducers');
const Deferral = require('../src/lib/deferral');
const { adapt } = require('../src/definition');

const {
	Statuses: { TaskStatuses: Statuses },
} = TaskSupervisor;

const noEffect = () => {};

const SimpleTaskDefinition = (doneCallback = noEffect) => (task, supervisor) => {
	const effect_done = (state, msg, ctx) => {
		dispatch(
			supervisor,
			{
				type: 'update',
				task: { ...task, status: Statuses.done },
			},
			ctx.self
		);
		doneCallback(state, msg, ctx);
	};

	const patterns = [Pattern(() => true, effect_done)];

	return {
		properties: {
			initialState: {
				task, //  task metadata
				supervisor,
			},
		},
		actions: {
			work: matchEffects(patterns),
		},
	};
};

function action_ping(_, __, ctx) {
	dispatch(ctx.sender, 'pong', ctx.self);
}

const aliveAndUnblocked = (actor) =>
	block(actor, { type: 'ping' }).should.eventually.equal('pong');

// Simple sequential task with some async stages
const TaskDefinition = (task, supervisor) => {
	// Whatever state we want the supervisor to keep track of
	const extractStateToPersist = ({ a, b, c }) => ({ a, b, c });

	const Receivers = ({ state, msg, ctx }) => ({
		update_task: (status) => {
			const { task } = state;
			// extract task metadata
			dispatch(
				supervisor,
				{
					type: 'update',
					task: { ...task, state: extractStateToPersist(state), status },
				},
				ctx.self
			);
		},
	});

	const WORK_TIME = 1;
	const do_work = (state, _, ctx) => {
		setTimeout(() => {
			dispatch(ctx.self, { type: 'work' }, ctx.self);
		}, WORK_TIME);
		return state;
	};

	const effect_pending = (state, _, ctx) => {
		ctx.receivers.update_task(Statuses.pending);
		return do_work(state, _, ctx);
	};

	const effect_done = (state, _, ctx) => {
		ctx.receivers.update_task(Statuses.done);
	};

	const patterns = [
		Pattern(
			({ a, b, c }) => !a && !b && !c, // predicate
			(state, _, ctx) => ({ ...effect_pending(state, _, ctx), a: true }) // effect
		),
		Pattern(
			({ a, b }) => !!a && !b,
			(state, _, ctx) => ({ ...do_work(state, _, ctx), b: true })
		),
		Pattern(
			({ b, c }) => !!b && !c,
			(state, _, ctx) => ({ ...effect_done(state, _, ctx), c: true })
		),
	];

	// Swap out for tracing
	function action_logWork(state, msg, ctx) {
		console.log(state);
		const next = matchEffects(patterns)(state, msg, ctx);
		console.log(next);
		return next;
	}

	return {
		properties: {
			Receivers,
			initialState: {
				task, //  task metadata
				supervisor,
			},
		},
		actions: {
			work: matchEffects(patterns),
		},
	};
};

function Supervisor(effects, makeTask = TaskDefinition, _properties) {
	const getId = (t) => t.foreginId;
	const isValidTask = (t) => !!t.foreginId;

	let idx = 1;
	const newTaskName = (i) => `task-${(idx++).toString().padStart(3, '0')}`;

	// Receiver
	const start_task = ({ state, msg, ctx }) => (task) => {
		const a_task = start_actor(ctx.self)(newTaskName(), makeTask(task, ctx.self), {});
		dispatch(a_task, { type: 'work' }, ctx.self);
		ctx.debug.d(msg, `Started task: ${task.taskId}`);
	};

	const reportStatus = (state, msg, ctx) => {
		return state;
	};

	const defaultEffects = {
		[Statuses.ready]: (state, msg, ctx) => {
			const { task } = msg;
			ctx.receivers.start_task(task);

			return state;
		},
	};

	// Keep reference to effects object
	Object.getOwnPropertySymbols(defaultEffects).forEach((status) => {
		if (!effects[status]) effects[status] = defaultEffects[status];
	});

	// Fill the supervisor state with some failed or hanging tasks
	function action_mockRecovery(state, msg, ctx) {
		const { taskRepo, tasksByStatus } = state;
		const { tasks } = msg;

		tasks.forEach((task) => {
			if (isValidTask(task)) {
				taskRepo.set(task.taskId, task);
				tasksByStatus[task.status].set(task.taskId, task);
			} else {
				throw new Error(
					`Filling supervisor memory with invalid task objects makes this test meaningless`
				);
			}
		});

		return { ...state, taskRepo, tasksByStatus };
	}

	const action_getState = (state, msg, ctx) => {
		dispatch(ctx.sender, state, ctx.self);
	};

	return adapt(
		{
			actions: {
				recovery: action_mockRecovery,
				get_state: action_getState,
				default_action: action_ping,
			},
			properties: {
				receivers: [start_task],
				..._properties,
			},
		},
		TaskSupervisor.Definition([getId, isValidTask, { effects }])
	);
}

context('TaskSupervisor', function () {
	let director, a_supervisor, a_stub; // actor instances
	let fId = 1;

	const TaskSpec = () => ({
		foreginId: (fId++).toString().padStart(5, 0),
		recipient: 'jack',
	});

	beforeEach(function start_actors() {
		director = bootstrap();
	});

	afterEach(function stop_actors() {
		director.stop();
	});

	describe('Task', function () {
		it('should complete a task', function (done) {
			const effects = {
				[Statuses.done]: () => {
					done();
				},
			};

			// const supervisor = Supervisor(effects);
			//console.log(supervisor.actions);

			a_supervisor = director.start_actor('supervisor', Supervisor(effects));
			dispatch(a_supervisor, { type: 'submit', task: TaskSpec() });
		});

		it('should process several tasks', async function () {
			const effects = {
				[Statuses.done]: (state, { task: { taskId } }) => {
					state.taskRepo.get(taskId).deferred.resolve();
				},
			};
			a_supervisor = director.start_actor('supervisor', Supervisor(effects));

			const NUM_TASKS = 5;
			const submitMessages = [...Array(NUM_TASKS)].reduce(
				(tasks) => [
					...tasks,
					{ type: 'submit', task: { ...TaskSpec(), deferred: new Deferral() } },
				],
				[]
			);

			await Promise.all(
				submitMessages.map((msg) => {
					dispatch(a_supervisor, msg);
					return msg.task.deferred.promise;
				})
			);
		});

		it('should restart tasks after recovery', async function () {
			const tasks = [
				{
					taskId: '10001',
					foreginId: '00001',
					status: Statuses.ready,
					deferred: new Deferral(),
				},
				{
					taskId: '10002',
					foreginId: '00002',
					status: Statuses.init,
					deferred: new Deferral(),
				},
				{
					taskId: '10003',
					foreginId: '00003',
					status: Statuses.pending,
					deferred: new Deferral(),
				},
			];

			const effects = {
				[Statuses.done]: (state, { task: { taskId } }) => {
					state.taskRepo.get(taskId).deferred.resolve();
				},
			};

			a_supervisor = director.start_actor('supervisor-restart', Supervisor(effects));
			dispatch(a_supervisor, { type: 'recovery', tasks });

			// @TODO could assert that state is correcly recovered
			// const state = await query(a_supervisor, { type: 'log' }, 1000);

			dispatch(a_supervisor, { type: 'restart' });

			await Promise.all(tasks.map((t) => t.deferred.promise));
		});

		it('should allow custom taskId generation', function () {
			this.skip();
		});

		it('should discard invalid status updates', function () {});
	});

	describe('Persistence', function () {
		it('recovery:bug: tasks being updated with undefined status', function () {
			this.skip();
		});

		it('piped actions should persist correct message type', function () {
			this.skip();
		});
	});

	describe('Effect', function () {
		it('should perform tasks with no effects', function (done) {
			a_supervisor = director.start_actor(
				'supervisor',
				Supervisor(
					{}, // no effects
					SimpleTaskDefinition(() => done())
				)
			);
			dispatch(a_supervisor, { type: 'submit', task: TaskSpec() });
		});

		it('should throw if an effect damages supervisor state', async function () {
			const deferred = new Deferral();

			const effects = {
				[Statuses.done]: (state) => ({ junk: 'supervisor state is damaged' }),
			};

			function onCrash(msg, error, ctx) {
				error.should.not.be.undefined; // @TODO too general
				deferred.reject(error);
			}

			a_supervisor = director.start_actor(
				'supervisor',
				Supervisor(effects, SimpleTaskDefinition(), { onCrash })
			);
			dispatch(a_supervisor, { type: 'submit', task: TaskSpec() });

			await deferred.promise.should.be.rejectedWith(TaskSupervisor.errors.EffectError);
		});

		it('should allow effect to return void state', async function () {
			const effects = {
				[Statuses.done]: noEffect,
			};

			a_supervisor = director.start_actor(
				'supervisor',
				Supervisor(effects, SimpleTaskDefinition())
			);
			dispatch(a_supervisor, { type: 'submit', task: TaskSpec() });

			await aliveAndUnblocked(a_supervisor);
			const state = await query(a_supervisor, { type: 'get_state' }, 1000);
			state.should.not.be.undefined;
			state.should.not.be.null;
		});

		it('should allow effects to return a promise', async function () {
			this.skip();
		});

		it('should have actor context as "this"', async function () {
			const deferred = new Deferral();

			function effect_done(_, _, ctx) {
				ctx.should.deep.equal(this);
				deferred.resolve();
			}

			const effects = {
				[Statuses.done]: effect_done,
			};

			a_supervisor = director.start_actor(
				'supervisor',
				Supervisor(effects, SimpleTaskDefinition())
			);
			dispatch(a_supervisor, { type: 'submit', task: TaskSpec() });

			await deferred.promise;
		});
	});
});
