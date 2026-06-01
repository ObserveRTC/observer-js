# Logging in `@observertc/observer-js`

`observer-js` writes diagnostic logs from its internal modules (the `Observer`, each
`Observed*` entity, the updaters, etc.). All of that output is routed through a single,
swappable sink so that the host application stays in full control of *where* logs go,
*what level* is kept, and *how* they are formatted. This document explains the model and
gives copy-paste recipes for funneling the logs into `pino`, `winston`, plain `console`,
or nothing at all.

## TL;DR

```ts
import { setObserverLogger } from '@observertc/observer-js';

// Funnel every observer-js log line into your own logger.
setObserverLogger({
  trace: (module, ...args) => myLogger.trace(`[${module}]`, ...args),
  debug: (module, ...args) => myLogger.debug(`[${module}]`, ...args),
  info:  (module, ...args) => myLogger.info(`[${module}]`, ...args),
  warn:  (module, ...args) => myLogger.warn(`[${module}]`, ...args),
  error: (module, ...args) => myLogger.error(`[${module}]`, ...args),
});
```

That's the whole integration surface. The rest of this document is detail.

## The model

There are two interfaces and two functions, all exported from the package root:

```ts
import {
  createLogger,        // (moduleName: string) => Logger
  setObserverLogger,   // (logger: ObserverLogger) => void
  type Logger,
  type ObserverLogger,
} from '@observertc/observer-js';
```

- **`Logger`** — what each internal module holds. Five level methods, each variadic:
  `trace`, `debug`, `info`, `warn`, `error`, all `(...args: any[]) => void`.
- **`ObserverLogger`** — the single *sink* every `Logger` forwards to. Same five levels,
  but each receives the originating **module name** as the first argument:
  `(module: string, ...args: any[]) => void`.

Internally, each file does:

```ts
const logger = createLogger('ObservedPeerConnection');
// ...
logger.warn('Received sample without callId. %o', sample);
```

`createLogger(moduleName)` returns a `Logger` whose every call forwards to the process-wide
`ObserverLogger`, injecting `moduleName`. So the line above ultimately calls:

```ts
observerLogger.warn('ObservedPeerConnection', 'Received sample without callId. %o', sample);
```

`setObserverLogger(...)` replaces that process-wide sink. One call reroutes **all** logging
from **every** `Observer` instance in the process.

```
ObservedCall ─┐
ObservedClient ┤  createLogger('<module>')  ──►  the single ObserverLogger  ──►  your logger
Observer ──────┘        (per module)               (set via setObserverLogger)
```

## Default behavior (important)

If you never call `setObserverLogger`, the built-in sink writes to `console`:

| Level | Default destination |
|-------|---------------------|
| `trace` | dropped (no-op) |
| `debug` | `console.log`   |
| `info`  | `console.info`  |
| `warn`  | `console.warn`  |
| `error` | `console.error` |

…each prefixed with `"[LEVEL] <module>"`. This means **the default is fairly verbose
(`debug` and up go to the console).** For anything beyond local experimentation you should
install your own sink with an appropriate level — see below.

## Message format

Internal log calls use Node/`console`-style printf placeholders (`%s`, `%o`, `%d`, `%j`)
followed by the substitution values, and sometimes a trailing object:

```ts
logger.warn('Observed Call with id %s already exists; returning the existing instance', callId);
logger.warn('Received sample without clientId %o', sample);
```

Your `ObserverLogger` receives these as `(module, formatString, ...values)`. A logger that
understands printf placeholders (`console`, `pino`) can pass them straight through; for
others, format them yourself with `util.format` (recipe below).

## When can I call `setObserverLogger`?

Any time. The sink is read on every log call, not captured at import, so a later
`setObserverLogger(...)` immediately affects all subsequent logs. There is no ordering
requirement relative to constructing an `Observer`. Note it is **global/process-wide**:
the last call wins and applies to all `Observer` instances.

---

## Recipes

### 1. Silence everything

```ts
import { setObserverLogger } from '@observertc/observer-js';

const noop = () => undefined;
setObserverLogger({ trace: noop, debug: noop, info: noop, warn: noop, error: noop });
```

### 2. Console, but only `warn` and above

```ts
import { setObserverLogger } from '@observertc/observer-js';

setObserverLogger({
  trace: () => undefined,
  debug: () => undefined,
  info:  () => undefined,
  warn:  (module, ...args) => console.warn(`[WARN] ${module}`, ...args),
  error: (module, ...args) => console.error(`[ERROR] ${module}`, ...args),
});
```

### 3. pino (recommended for servers)

`observer-js` does not depend on `pino` — you bring your own. pino understands printf
placeholders, and passing `{ module }` as the merging object keeps the module name as a
structured field (so you can filter by it later).

```ts
import pino from 'pino';
import { setObserverLogger, type ObserverLogger } from '@observertc/observer-js';

const root = pino({ level: 'warn', name: 'observer-js' });

const adapter: ObserverLogger = {
  trace: (module, ...args) => root.trace({ module }, ...args),
  debug: (module, ...args) => root.debug({ module }, ...args),
  info:  (module, ...args) => root.info({ module }, ...args),
  warn:  (module, ...args) => root.warn({ module }, ...args),
  error: (module, ...args) => root.error({ module }, ...args),
};

setObserverLogger(adapter);
```

Level filtering is handled by pino (`level: 'warn'` above), so the dropped levels cost
almost nothing. If you prefer a dedicated child logger per module:

```ts
const children = new Map<string, pino.Logger>();
const child = (module: string) =>
  children.get(module) ?? children.set(module, root.child({ module })).get(module)!;

const adapter: ObserverLogger = {
  trace: (m, ...a) => child(m).trace(...a),
  debug: (m, ...a) => child(m).debug(...a),
  info:  (m, ...a) => child(m).info(...a),
  warn:  (m, ...a) => child(m).warn(...a),
  error: (m, ...a) => child(m).error(...a),
};
setObserverLogger(adapter);
```

### 4. winston

winston's level methods don't do printf substitution the same way, so format the message
with `util.format` first:

```ts
import { format } from 'node:util';
import { createLogger as createWinston, transports, format as wformat } from 'winston';
import { setObserverLogger, type ObserverLogger } from '@observertc/observer-js';

const w = createWinston({
  level: 'warn',
  transports: [new transports.Console()],
  format: wformat.json(),
});

const adapter: ObserverLogger = {
  trace: (module, ...args) => w.silly(format(...args), { module }),
  debug: (module, ...args) => w.debug(format(...args), { module }),
  info:  (module, ...args) => w.info(format(...args), { module }),
  warn:  (module, ...args) => w.warn(format(...args), { module }),
  error: (module, ...args) => w.error(format(...args), { module }),
};

setObserverLogger(adapter);
```

### 5. Generic / any logger (`util.format`)

The most portable adapter — works with any logger that takes a single string:

```ts
import { format } from 'node:util';
import { setObserverLogger, type ObserverLogger } from '@observertc/observer-js';

const toLine = (module: string, args: unknown[]) => `[${module}] ${format(...args)}`;

const adapter: ObserverLogger = {
  trace: (module, ...args) => myLogger.trace(toLine(module, args)),
  debug: (module, ...args) => myLogger.debug(toLine(module, args)),
  info:  (module, ...args) => myLogger.info(toLine(module, args)),
  warn:  (module, ...args) => myLogger.warn(toLine(module, args)),
  error: (module, ...args) => myLogger.error(toLine(module, args)),
};

setObserverLogger(adapter);
```

### 6. Filter or re-route specific modules

Because the sink receives the module name, you can route or drop per module:

```ts
const NOISY = new Set(['ObservedPeerConnection']);

setObserverLogger({
  trace: () => undefined,
  debug: (module, ...args) => { if (!NOISY.has(module)) root.debug({ module }, ...args); },
  info:  (module, ...args) => root.info({ module }, ...args),
  warn:  (module, ...args) => root.warn({ module }, ...args),
  error: (module, ...args) => root.error({ module }, ...args),
});
```

## Reusing the funnel for your own modules

`createLogger` is exported, so your application code can emit through the same sink and
inherit whatever routing/level you configured with `setObserverLogger`:

```ts
import { createLogger } from '@observertc/observer-js';

const logger = createLogger('my-app:ingest');
logger.info('accepted %d samples in %dms', count, elapsedMs);
```

## Notes & caveats

- **Global, not per-instance.** `setObserverLogger` sets one process-wide sink shared by
  every `Observer`. There is currently no per-`Observer` logger override.
- **Level filtering belongs in your logger.** `observer-js` always calls the sink for
  `debug`/`info`/`warn`/`error` (and `trace`, though the default drops it); decide what to
  keep inside your `ObserverLogger` (or, with pino/winston, via their `level`).
- **No bundled transport.** `observer-js` never imports `pino`, `winston`, or any logging
  library — you wire in whichever you already use.
- **`trace`** is intended for very high-frequency, per-sample diagnostics; keep it dropped
  in production.

## Type reference

```ts
interface Logger {
  trace(...args: any[]): void;
  debug(...args: any[]): void;
  info(...args: any[]): void;
  warn(...args: any[]): void;
  error(...args: any[]): void;
}

interface ObserverLogger {
  trace(module: string, ...args: any[]): void;
  debug(module: string, ...args: any[]): void;
  info(module: string, ...args: any[]): void;
  warn(module: string, ...args: any[]): void;
  error(module: string, ...args: any[]): void;
}

function createLogger(moduleName: string): Logger;
function setObserverLogger(logger: ObserverLogger): void;
```
