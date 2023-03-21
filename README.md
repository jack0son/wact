# 📬 Wact

wAct is an actor composition framework for [Nact](https://github.com/ncthbrt/nact) that provides
message and actor structure, common actor behaviour (like state machines), and
supervision policies.

_**Wactors** are made out of **Nactors**._

Nact is a compact message-oriented middleware which facilitates message based
communication between isolated entities called actors. The actor model
enables functional programming as it relegates all state mutations to the edge
of the domain logic by using a sequential execution lifecycle within each actor.

Actors protect against concurrency problems caused by shared state and
side-effects; essentially by treating your application as a distributed system.

You can use Wact with an existing Nact system by passing the nact `system` object
to `wact.bootstrap()`.

**Outcomes**

- Failure isolation
- State encapsulation
- Reduced coupling
- Recovery-oriented computing

All credit to [Nick Cuthbert](https://github.com/ncthbrt) for the core of this
package.

**Where to start?**

Wact's core specification is contained in
`src/actor-system.js`. See [Nact's javascript
documentation](https://nact.io/en_uk/lesson/javascript/introduction) for more
details.

**Contents**

- [1. Actor Lifecycle](#1-actor-lifecycle)
- [2. Framework](#2-framework)
  - [Actor Definitions](#actor-definitions)
    - [Actions](#actions)
      - [Receivers](#receivers)
      - [Reducers](#reducers)
      - [Effects](#effects)
    - [Actor Composition](#actor-composition)
      - [Adapters](#adapters)
  - [Message Protocol](#message-protocol)
  - [Usage Hints](#usage-hints)
- [3. Future Work](#3-future-work)
- [4. Rationale](#4-rationale)

## 1. Actor Lifecycle

Messages to an actor are stored in a FIFO queue and operated on sequentially.

Actors execute a target function only upon receipt of a message. Stateful actors
may mutate their own encapsulated state by returning the new state which will be
fed to the target function on its next execution. Deterministic behaviour using
function composition is achieved naturally within the target function - similar
to a redux reducer.

**NB** Some rules which are not enforced by the library must be followed to
maintain the reactive and side-effect resistant characteristics of actors. For
example, messages should not contain functions which reference the state of
another actor.

## 2. Framework

wAct builds actors using an action matching pattern which is structured
similarly to a Redux or React hooks reducer. Instead of passing the message
directly to the target function, wAct peforms a switch on the message type.

Where Nact's core features and metadata are contained within the parent actor
system and actor context/members, wAct describes its features using common
attributes on actor state and messages. It behaves more like a mixin or
framework extension in this sense.

For example, the `sink` action defines a standardised type for
response messages, allowing response parsing to be easily shared between actors
using a single action method definition, as opposed to a blocking query or test
of message contents in the target function.

wAct supports persistence and is completely compatible with actors built using
Nact's actor primitive, as wActors actors are just Nactors with some wrapping
code to build the target function at spawn time. wAct also makes the API for
spawning Nactors available - `spawn()`, `spawnStateless()`, etc.

### Actor Definitions

An actor definition is a plain object containing an actions `property` and
a `properties` property.

#### Actions

Actions are simply Nact target functions: functions with the signature
`function(state, msg, ctx)`.

##### Receivers

Functions can be made available in the actor context object to give all actions in
an actor convenient access to common functions like replies.

Receivers are specified as a higher order function which accepts the message
bundle `{ state, msg, ctx }` as its only argument.

Receivers are specified as an array of receiver functions.

```js
// Reply receiver HOF
const reply = ({ state, msg, ctx }) => (message) =>
  dispatch(ctx.sender, message, ctx.self);

const actor = {
  properties: {
    receivers: [reply],
  },
  actions: {
    report: (msg, state, ctx) => {
      ctx.receivers.reply(makeReport(state));
    },
  },
};
```

> ##### Reducers

> ##### Effects

#### Actor Composition

Actors can be composed by manually merging their definitions (actions and
properties), commonly using the spread operator, or by passing their definitions
to the `adapt()` or `compose()` methods, creating a new definition.

Constructing actor definitions using simple bags of properties simplifies
inheritance and code reuse between actors.

##### Adapters

Adapters are actor defintion mixins, usually included using the spread operator.

```js
// My actor's unique properites
const actions = {...}; const properties = {...};

// ex1. Simple actions adapter
const myActorDefn = { actions: { ...actions, ...AdapterActions() }, properties };

// ex2. Adapter with complete defintion, actions & properties
const actorDefn = wact.adapt({ actions, properties }, AdapterDefinition());
```

If you want an actor, or a set of actions to be able to address messages to
specific action methods, regardless of the addressee actor's external
API, you can build an action directory.

```js
const directory = action.buildDirectory({ action_send, action_queue });

function action_send(state, msg, ctx) => {
	dispatch(ctx.self, { type: directory.address(action_queue) }, ctx.self);
}

function action_queue(state, msg, ctx) => {
	return [...state, ctx.sender];
}
```

The directory maps methods to Symbols allowing the actions to be addressed by
their method name. The directory can be exposed in the definition to be used by
inheritors, or as a module used by other actors to address messages.

**Why use closures instead of classes to define actors?**
Interface composition over inheritence. It also allows actions to consistently use `this` to refer to the message context, while
also sharing some enclosing context.

### Message Protocol

wAct provides a basic message protocol to facilitate common communication
patterns such as:

- issuing actions
- request-response (sink/source)
- pub-sub

### Supervision

- Using wact to define service interface boundaries

### Usage Hints

- Actor definitions should use named functions for actions if they
  require access to the actor context. This can be useful for reducing code
  verbosity, but if you don't use `this` you're less likely to shoot yourself in
  the foot when piping actions / effects.

## 3. Future Work

Build wAct as a system extension (using the
extension structure used to implement ctx.log and the persistence engine).

## 4. Rationale

Decoupled modules are easy to change. _Temporal decoupling_ is difficult.

Actors break the modules of an application into a set of microservices that
are able to make clear promises to other parts of the system and manage fatal
errors within their own bounded fault context.

> Services offer a clear contract with respect to their interface and errors.

**For example**, a transaction management service might promise to ensure the
transaction is processed by a remote system, managing any network availability
issues, thus requiring the caller to have less knowledge of the transaction
system and minimise its failure modes - it may only need to be aware of errors
with the transaction's arguments, and avoids exposure to any system crash
encountered by the service.

This helps achieve fault tolerance, particularly when some components of the
system have many or random failure modes - perhaps an unreliable data source or
buggy dependency. It also clearly delineates error handling from the domain
logic, separating control flow into two coexistent architectures:

1. **Domain**: Message oriented services - _Flat structure_
2. **Fault management**: Supervision tree - _Hierarchical structure_

In other words, the system _*does its job*_ by passing messages among several
encapsulated modules, and _*manages failure*_ by structuring these modules into
a tree of execution contexts in which each node may defer to its parent to make
decisions about faults (supervision policy).

Supervision policies can be easily shared between different services for common
failure patterns such as API rate-limits or excessive runtime.

By confining faults to a supervision context (fault localisation) it becomes
much easier to model and manage failure scenarios. System intent is also clearer
as domain logic is less interleaved with error handling. Read more at [The
Reactive Manifesto](https://www.reactivemanifesto.org/).

**Notes**

- [Let it
  crash](http://stratus3d.com/blog/2020/01/20/applying-the-let-it-crash-philosophy-outside-erlang/#:~:text=Let%20it%20crash%20is%20a%20fault%20tolerant%20design%20pattern.&text=That's%20a%20good%2C%20terse%2C%20description,program%20ought%20to%20handle%20them.)
  philosophy
- Message-based thread communication / similar to Communicating Sequential
  Processes
- Redux on the server
- Object concurrency model

**Checklist**

- [ ] Care must be taken when constructing action methods using closures, if the
      methods are intended to be used for composition of other actors.
- [ ] adapt and compose are not pure so they may mutate passed
      actor definitions leading to inscrutable state sharing issues.
- [ ] Typescript type definition for receivers
