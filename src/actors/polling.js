const { dispatch, query } = require("nact");

// Cron-like behaviour
const pollingActor = {
  properties: {
    initialState: {
      halt: false,
      blockTimeout: null,
    },

    onCrash: (msg, error, ctx) => {
      switch (msg.type) {
        case "perform": {
          //const { target, action, period, args } = msg;
          //setTimeout(() => dispatch(ctx.self, msg, ctx.sender), period);
          dispatch(ctx.self, msg, ctx.sender);
          return ctx.resume;
        }

        default:
          return ctx.stop;
      }
    },
  },

  actions: {
    poll: (state, msg, ctx) => {
      const {
        target, // target actor
        action, // target action type
        period, // how often to poll
        blockTimeout,
        rateLimit,
        args,
      } = msg;

      if (!period || period < 0) {
        throw new Error("Polling period must be non-zero");
      }

      ctx.debug.info(
        `Start ${blockTimeout ? "sync-" : ""}polling {${
          target.name
        }:${action}} every ${period}ms...`
      );
      const performMessage = {
        type: "perform",
        target,
        period,
        action,
        args,
        impetus: ctx.sender,
      };
      dispatch(ctx.self, performMessage, ctx.sender);

      // @brokenwindow
      // @TODO wasting memory
      return {
        ...state,
        halt: false,
        blockTimeout,
        period,
        target,
        action,
        currentAction: performMessage,
      };
    },

    perform: async (state, msg, ctx) => {
      const { halt, blockTimeout } = state;
      const { target, action, period, args } = msg;

      ctx.debug.info(`Peforming {${target.name}:${action}} ...`);
      if (!halt) {
        if (blockTimeout) {
          //await query(target, {type: action, sender: ctx.sender, ...args}, blockTimeout)
          await query(target, { type: action, ...args }, blockTimeout);
        } else {
          dispatch(target, { type: action, ...args }, ctx.sender);
        }

        setTimeout(
          () =>
            dispatch(
              ctx.self,
              { type: "perform", target, period, action, args },
              ctx.sender
            ),
          period
        );
      }

      return state;
    },

    resume: (state, msg, ctx) => {
      const { currentAction } = state;
      if (!currentAction) {
        throw new Error(`No action being polled`);
      }
      ctx.debug.info(
        msg,
        `Resuming polling of {${state.target.name}:${state.action}}`
      );
      dispatch(ctx.self, currentAction, currentAction.impetus);
      state.halt = false;
      return state;
    },

    interupt: (state, msg, ctx) => {
      ctx.debug.info(
        `Interupting polling of {${state.target.name}:${state.action}}`
      );
      state.halt = true;
      return state;
    },

    stop: (state, msg, ctx) => {
      ctx.debug.info(
        `Stopping polling of {${state.target.name}:${state.action}}`
      );
      return ctx.stop;
    },
  },
};

module.exports = pollingActor;
