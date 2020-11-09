const { labelActions } = require('./action');
const { merge } = require('./lib/utils');

// Create an actor defintion
function MakeDefinition(Actions, Properties) {
	function Definition(actionArgs, propertyArgs = [], ...properties) {
		return {
			actions: Actions(...actionArgs),
			properties: Properties(...propertyArgs.concat(properties)),
		};
	}
	Definition.prototype.Actions = Actions;
	Definition.prototype.Properties = Properties;

	return Definition;
}

const adapt = (definition, { actions, properties }, opts) =>
	compose(definition, actions, properties, opts);

// @TODO make sure definition is deep cloned first
// Some actor defintions are getting mutated between tests causing actor
// references with stopped directors to hang around
function compose(definition, _actions, _properties, opts = {}) {
	const { labeling, debug } = opts;

	const dir = (o) => debug && console.dir(o, { depth: 1 });
	const log = (...args) => debug && console.log(...args);

	const receivers = [
		...((definition.properties && definition.properties.receivers) || []),
		...((_properties && _properties.receivers) || []),
	];

	const actions = labelActions(merge(_actions, definition.actions), labeling);

	// Values from definition take precedence (merge(x, y) => overwrite x)
	const properties = merge(_properties, {
		...definition.properties,
		receivers,
	});

	return { ...definition, actions, properties };
	//return Object.assign(definition, { actions, properties });
}

module.exports = { MakeDefinition, adapt, compose };
