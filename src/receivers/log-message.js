const defaultFormatter = (msg) => `${msg.type.toString()} >>> `;

const logMessage = (formatter = defaultFormatter) => {
  return function logMessage({ msg, ctx }) {
    const debug = (message) => ctx.log.debug(`${formatter(msg)}${message}`);
    return {
      trace: (message) => ctx.log.trace(`${formatter(msg)}${message}`),
      debug,
      d: debug,
      info: (message) => ctx.log.info(`${formatter(msg)}${message}`),
      warn: (message) => ctx.log.warn(`${formatter(msg)}${message}`),
      critical: (message) => ctx.log.critical(`${formatter(msg)}${message}`),
      error: (message) => ctx.log.error(`${formatter(msg)}${message}`),
    };
  };
};

module.exports = logMessage;
