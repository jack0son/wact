class TaskError extends Error {
	constructor(task, message) {
		super(`taskId:${task.taskId}: ` + message);
		this.task = task;
	}
}

class EffectError extends TaskError {
	constructor(task, message) {
		super(task, message);
	}
}

module.exports = { TaskError, EffectError };
