const { dispatch } = require('../../actor-system');
const { buildDirectory } = require('../../action');
const { TaskStatuses: Statuses, isStatus, parseStatus } = require('./statuses');
const { TaskError, EffectError } = require('./errors');

const isEffect = (effect) => effect && typeof effect === 'function';
const isReducer = (reducer) => reducer && typeof reducer === 'function';
const isVoidState = (state) => state === undefined || state === null;

function Task(taskId, task) {
	return {
		...task,
		taskId,
		status: Statuses.init,
		state: null,
		error: null,
		reason: null,
	};
}

const RESTART_ON = [Statuses.init, Statuses.ready, Statuses.pending];

// Instead of merging every state update by effects, perform this check
const isValidState = ({ taskRepo, tasksByStatus }) => !!taskRepo && !!tasksByStatus;

// @TODO new task function should be primary parameter
// Task manager actions
function Actions(
	getId,
	isValidTask,
	{ ignoreTask, effects, reducer, restartOn, effect_startTask }
) {
	if (!isReducer(reducer)) reducer = (state) => state;

	const actions = {
		action_submit,
		action_update,
		action_restart,
		action_abort,
	};

	const directory = buildDirectory(actions);

	function action_submit(state, msg, ctx) {
		const { taskRepo, tasksByStatus } = state;
		const { task: _task } = msg;

		const taskId = getId(_task);
		if (!isValidTask(_task)) throw new Error(`New task ${taskId} is not a valid task`);

		// Ignore task if ignoreTask predicate defined
		const ignoreReason = ignoreTask && ignoreTask(_task);
		if (ignoreReason) {
			ctx.debug.d(msg, `Ignoring task ID: ${taskId}, ${ignoreReason}`);
			return state;
		}

		// Ignore task if it already exists
		if (taskRepo.has(taskId)) return state;

		const task = taskRepo.set(taskId, Task(taskId, _task)).get(taskId);
		tasksByStatus[task.status].set(taskId, task);
		return action_update.call(
			ctx,
			{
				...state,
				taskRepo,
			},
			{ type: msg.type, task: { ...task, status: Statuses.ready } },
			ctx
		);
	}

	async function action_update(_state, _msg, ctx) {
		const { taskRepo, tasksByStatus } = _state;
		const { task: _task } = _msg;

		if (!_task) throw new Error(`action:updateTask expects msg[task]`);
		const taskId = _task.taskId || getId(_task);

		if (!taskRepo.has(taskId))
			throw new Error(`Attempt to update task ${taskId} which does not exist`);

		if (!isStatus(_task.status)) {
			console.log(_msg);
			throw new Error(`Unspecified task status for taskId ${taskId}: ${_task.status}`);
		}

		if (ctx.persist && !ctx.recovering) {
			await ctx.persist({ ..._msg });
		}

		const prev = taskRepo.get(taskId);
		if (_task.status === prev.status) {
			!ctx.recovering &&
				ctx.debug.d(
					_msg,
					`Task ID: ${taskId} already has status ${_task.status.toString()}`
				);
			return _state;
		} else {
			ctx.debug.d(
				_msg,
				`task: ${taskId}, ${prev.status.toString()} -> ${_task.status.toString()}`
			);
		}

		const task = { ...prev, ..._task };

		if (task.error) {
			ctx.debug.error(task.error);
		}

		taskRepo.set(taskId, task);
		tasksByStatus[prev.status].delete(taskId);
		tasksByStatus[task.status].set(taskId, task);
		const state = _state;
		//const state = { ..._state, taskRepo, tasksByStatus };

		const effect = effects[task.status];

		// Task actors should not reference the taskRepo
		const msg = { task: { ...task } }; // use a copy of the task
		const nextState = await (!ctx.recovering && isEffect(effect)
			? reducer.call(ctx, effect.call(ctx, state, msg, ctx))
			: reducer.call(ctx, state, msg, ctx));

		// @TODO supervisor could ensure state is preserved by adding taskRepo etc in
		// to nextState object

		if (isVoidState(nextState)) {
			return state;
		} else if (!isValidState(nextState)) {
			ctx.debug.warn(msg, `Damaged state contents: `, Object.keys(nextState));
			// @TODO Should check reducer returned state as well. For now assume reducer is correct
			throw new EffectError(
				task,
				`${
					isEffect(effect) ? 'Effect' : 'Reducer'
				} on task status ${task.status.toString()} damaged supervisor state: ${nextState}`
			);
		}

		return nextState;
	}

	// Simple restart functionality
	// Just go back to ready state
	function action_restart(_state, msg, ctx) {
		const { tasksByStatus } = _state;
		const { taskId } = msg;

		const restartMsgType = directory.symbols.get(action_update);
		if (!restartMsgType)
			throw new Error(`No symbol found for action: ${action_update.name}`);

		// @fix action function does not now action type that identifies its calling
		// actor
		const restartMsg = (taskId) => ({
			//type: ActionDirectry[ActionSymbols.update], // @TODO
			type: restartMsgType, // @TODO
			task: { taskId, status: Statuses.ready },
		});

		const initMsg = (taskId) => ({
			type: 'restart',
			task: { taskId, status: Statuses.init },
		});

		if (taskId) return action_update.call(ctx, _state, restartMsg(taskId), ctx);

		const tasks = (restartOn || RESTART_ON).reduce((tasks, status) => {
			tasksByStatus[status].forEach((t) => {
				tasks.push(t);
			});
			return tasks;
		}, []);

		return tasks.reduce((state, task) => {
			dispatch(ctx.self, restartMsg(task.taskId), ctx.self); // queue the restart
			return {
				...state,
				...action_update.call(ctx, state, initMsg(task.taskId), ctx),
			};
		}, _state);
	}

	// @TODO: unused
	function action_resume(state, msg, ctx) {
		// @fix will not update statuses to pending
		// 	tasksByStatus[Statuses.pause].forEach((task) =>
		// 		effects[status]({ task }, ctx, state)
		// 	)
		return state;
	}

	function action_abort(state, msg, ctx) {
		const { taskId, status, blocking } = msg;

		const abortMsg = (task, type) => ({
			type,
			task: { taskId: task.taskId, status: Statuses.abort },
		});

		// Abort a single task by taskId
		if (taskId) return action_update.call(ctx, state, abortMsg(taskId, 'abort'), ctx);

		const statusSymbol = parseStatus(status);
		if (!statusSymbol) {
			ctx.debug.warn(msg, `Abort expects a taskId or task status symbol`);
			return;
		}

		if (!blocking) {
			tasksByStatus[statusSymbol].values.forEach((task) =>
				dispatch(ctx.self, abortMsg(task, symbolDirectory(action_update)), ctx.self)
			);
			return;
		}

		// @TODO use parent.stopChildren

		//tasksByStatus[status].forEach(({taskId}) => dispatch(ctx.self, abortMsg(taskId)));
		// Abort all tasks in provided status
		return tasksByStatus[statusSymbol].values.reduce(
			// @note using reduce ties execution path for all task effects together
			//	- pipe behaviour
			// error will cause state changes from preceeding tasks to be lost
			(state, task) =>
				action_update.call(ctx, state, abortMsg(task.taskId, 'abort'), ctx),
			state
		);
	}

	actions._directory = directory;
	return Object.assign(actions, directory.actions);
}

module.exports = Actions;
//module.exports = { Actions, ...ActionSymbols };
