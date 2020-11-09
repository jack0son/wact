const { PostgresPersistenceEngine } = require('nact-persistence-postgres');
const repo = require('./lib/repo');
const debug = require('@packages/lib').Logger('persistence');

function PersistenceEngine(_conf) {
	const conn = repo.getConnectionString(_conf);
	debug.info(`Connection string: ${conn}`);
	const pEngine = new PostgresPersistenceEngine(conn);

	return pEngine;
}

module.exports = PersistenceEngine;
