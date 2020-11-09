const Actions = require('./actions');
const Properties = require('./properties');
// const Definition = require('../../definition').MakeDefinition(Actions, Properties);
const Statuses = require('./statuses');

function Definition(actionArgs, propertyArgs = [], ..._properties) {
	const actions = Actions(...actionArgs);
	const properties = Properties(actions, ...propertyArgs.concat(_properties));
	return {
		actions,
		properties,
	};
}
Definition.prototype.Actions = Actions;
Definition.prototype.Properties = Properties;

module.exports = {
	Actions,
	Properties,
	Definition,
	Statuses: Statuses,
	TaskStatuses: Statuses.TaskStatuses,
	errors: require('./errors'),
};
