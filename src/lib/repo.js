// Persistence repository configuration

const defaults = {
  USER: "wact",
  PWD: "wact-persist",
  DB: "wact",
  HOST: "localhost",
  PORT: 5433,
};

const defaultConf = {};
// Use environment parameters if defined
Object.keys(defaults).forEach(
  (key) => (defaultConf[key] = process.env[`POSTGRES_${key}`] || defaults[key])
);

// e.g. "postgresql://bot:botpass@docker_db:5432/app_name"
function getConnectionString(_conf) {
  const conf = { ...defaultConf, ..._conf };
  return `postgresql://${conf.USER}:${conf.PWD}@${conf.HOST}:${conf.PORT}/${conf.DB}`;
}

module.exports = {
  getConnectionString,
};
