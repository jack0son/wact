const { TaskStatuses, statusList, encoder, decoder } = require('./statuses');

module.exports = (actions) => ({
	initialState: {
		taskRepo: new Map(),
		tasksByStatus: statusList.reduce(
			(dict, status) => ({ ...dict, [status]: new Map() }),
			{}
		),
	},
	encoder: (msg) => encoder(actions._directory.encoder(msg)),
	decoder: (msg) => decoder(actions._directory.decoder(msg)),
});
