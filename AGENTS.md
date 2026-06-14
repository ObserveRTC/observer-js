# AGENTS.md — `@observertc/observer-js`

Guidance for AI coding agents (and humans) working **in this repository**. It describes how to
build, test, and extend the library, and the conventions to preserve. For *using* the library as a
dependency, read [`README.md`](./README.md); for an LLM-oriented map of the docs, see
[`llms.txt`](./llms.txt).

---

## What this project is

A **server-side Node.js library for monitoring WebRTC sessions**. A WebRTC app (typically an SFU or
a stats backend) feeds it `ClientSample` objects via a single method, and the library maintains a
live in-memory model of every call/client/peer-connection/stream, derives per-interval and
cumulative metrics, and emits one unified, typed event stream. Written in TypeScript; ships a dual
**ESM + CommonJS** build from a single entry.

- Runtime: **Node.js ≥ 22**, server-side only (no browser target).
- Language: TypeScript (strict). Package manager: **Yarn** (a `yarn.lock` is committed).
- Entry point: `src/index.ts` → built to `dist/` by `tsup`.

---

## Setup & commands

```bash
yarn install            # install deps (use --frozen-lockfile in CI)

yarn build              # tsup → dist/ : dual ESM (.mjs) + CJS (.js), single entry, .d.ts/.d.mts + sourcemaps
yarn typecheck          # tsc --noEmit
yarn lint               # eslint -c .eslintrc.json "src/**/*.ts"
yarn format             # prettier --write "src/**/*.ts"
yarn test               # jest (ts-jest)
yarn test:coverage      # jest --coverage (enforces the coverage thresholds in jest.config.js)
```

(`npm run <script>` works too.) **Before opening a PR**, run `yarn lint && yarn typecheck && yarn test`.
`prepublishOnly` runs lint + typecheck; `prepare` runs the build.

CI (`.github/workflows/ci.yml`) runs lint + typecheck + **build** + `test:coverage` on every push/PR.
Publishing (`.github/workflows/publish.yaml`) uses npm **Trusted Publishing (OIDC) + provenance** on
pushes to `master` (prerelease versions publish under the `beta` dist-tag).

---

## Architecture (the mental model)

Five ideas describe the whole library:

1. **One ingestion method.** `observer.accept(sample, context?)` is the only way data gets in.
   Calls, clients, and peer connections are created **lazily** the first time their id appears — never
   pre-create them in normal flow.
2. **A live entity tree.** `Observer → ObservedCall → ObservedClient → ObservedPeerConnection →`
   sub-stats (inbound/outbound RTP, remote inbound/outbound RTP, inbound/outbound tracks, codecs,
   data channels, ICE transports/candidates/candidate-pairs, certificates, media sources, media
   playouts, peer-connection transports). Each node holds current + cumulative metrics and is
   reachable by id through `Map`s on its parent.
3. **One event bus.** Everything worth subscribing to is emitted on the **`Observer`** itself. Each
   payload is an object carrying the **full ancestry** of its subject. Internal-only coordination
   uses **local** EventEmitter events on the component (and must be `off`-ed on close).
4. **Pull or react.** Read fields off entities at any time, and/or subscribe to events. `*-updated`
   events fire each processing tick.
5. **Warn, don't throw.** Operational/edge conditions never throw; they warn through the pluggable
   logger and degrade (return `undefined`, or emit `sample-rejected`).

---

## Project layout (`src/`)

- `Observer.ts` — root: `accept()`, config, lifecycle, the observer-level event emission, the
  `acceptMiddlewares` chain, and `createObservedMediasoupRouter()`.
- `ObservedCall.ts`, `ObservedClient.ts`, `ObservedPeerConnection.ts` — the main tree nodes; each has
  an `accept()`/`update()` path that accumulates metrics and emits events.
- `Observed*.ts` — the per-stat classes (RTP, tracks, codecs, ICE, data channels, transports, …).
- `ObserverEvents.ts` — the **typed event map** + the `Observed*Scope` ancestry payload types.
- `ObservedMediasoupRouter.ts` — server-side mediasoup observation (attaches to a live `Router`).
- `detectors/` — `Detector` interface + `Detectors` registry (server-side extension point).
- `scores/` — `ScoreCalculator`.
- `updaters/` — update-policy strategies (event-driven; no timers).
- `utils/` — `RemoteTrackResolver` + built-in strategy factories.
- `common/` — `logger`, `Middleware`/`MiddlewareProcessor`, shared utils.
- `schema/` — sample / event / meta / mediasoup-router types (`ClientSample`, `MediasoupRouterSample`, …).
- `sinks/` — `ClientSampleSink` base class + `JsonlFileSink` / `InMemorySink`.
- `index.ts` — the single public entry; **all public exports live here**.

Tests live in `tests/` (one spec per concern) with shared fixtures/helpers in `tests/helpers/`.

---

## Conventions to follow (do not regress these)

- **Single event bus.** New consumer-facing events go in `ObserverEvents.ts` as
  `'<name>': [<Scope> & { …subject }]`, and are emitted from the owning component via
  `this._notify('<name>', { ...this.eventScope, …subject })`. Every component has a precomputed
  `eventScope` and a thin `_notify` wrapper around the correct emitter. Keep purely internal
  coordination as **local** EventEmitter events, and `off` them on close.
- **Warn, don't throw.** Use the logger for operational problems. `create*` / `getOrCreate*` return
  `T | undefined` (closed parent → `undefined` + warn; duplicate id → existing instance + warn).
  Missing `callId`/`clientId` or a closed observer → a `sample-rejected` event, not an exception.
- **Counter-reset-safe deltas.** When deriving a per-tick delta from a cumulative counter, never emit
  a negative value (guard `curr >= prev`) so it survives counter resets / SSRC reuse. Reset per-tick
  fields at the top of the relevant `update()`.
- **`appData` vs `context`.** `appData` is application-owned, fixed at creation, never mutated by the
  library (use `settings.appData` or the `createCallAppData` / `createClientAppData` factories).
  `context` (2nd arg to `accept`) is transient/per-accept and is carried only to that pass's
  `*-updated` events — never written into `appData`.
- **No internal timers.** Update cadence is event-driven via update policies
  (`update-on-any-…` / `update-when-all-…` / `none`). With `none`, the app calls the public
  `observer.update()` / `observedCall.update()`. Do not add `setInterval`/`setTimeout`-based
  aggregation (auto-teardown timers via `closeClientIfIdleForMs` / `closeCallIfEmptyForMs` are the
  only timers and are opt-in).
- **Explicit accumulation.** The per-sample metric accumulation in `accept()` is intentionally
  explicit and not abstracted — match that style rather than introducing clever indirection.
- **Detectors are server-side.** Add cross-client detectors on `ObservedCall.detectors`; do not
  re-implement signals the client already reports (those arrive as `clientIssues` → `client-issue`).
- **Public surface goes through `index.ts`.** If you add a public class/type, export it there.
- **Injection lifecycle (`ObservedClient.inject*`).** The `inject*` methods (attachment / event /
  issue / metaData / extensionStat) must preserve three guarantees: (1) when called **during**
  `accept()` (i.e. `_activeSample` is set — e.g. from a `client-updated` handler), apply to the
  current sample immediately (append to `_activeSample` + run the same processing as the merge path);
  (2) when called **between** samples, buffer in `_pendingInjections` for the next `accept()`; (3) on
  `close()`, `_flushPendingInjections()` drains the buffer to state **and** the sink **before**
  `closed` is set (because `_mergeInjections` / `add*` short-circuit once closed). The sink write
  lives at the **end** of `accept()` so it persists the final injection-merged sample — don't move it
  back to the top, and don't drop the close-time flush.
- **Style.** Tab indentation; Prettier + ESLint config in the repo (`.eslintrc.json`). Provide
  explicit return types on public methods where inference can become circular (e.g. methods that
  `return this._notify(...)` need an explicit `: void`).

---

## How to extend (recipes)

- **Add an event:** add `'<name>': [<Scope> & { … }]` to `ObserverEvents.ts`; emit from the owning
  component with `this._notify('<name>', { ...this.eventScope, … })`. Document it in the README event
  table.
- **Add a per-stream metric:** add the field to the relevant `Observed*Rtp`/track class, populate it
  in that class's `update()` (reset at the top if it's per-tick), and read it from a `*-updated`
  handler. Keep deltas counter-reset-safe.
- **Add a server-side detector:** implement `Detector { readonly name; update(): void }`, register on
  `call-added` via `observedCall.detectors.add(...)`, and surface findings with
  `observedCall.addIssue(...)` (emits `call-issue`).
- **Add a sink:** subclass the abstract `ClientSampleSink` (a typed EventEmitter) and implement
  `write(sample): boolean` and `end(): void`; emit `close` when flushed. Wire it via
  `ObserverConfig.createClientSink`.
- **Add a remote-track strategy:** build a `RemoteTrackResolver` with custom
  publisher/subscriber id resolvers, or add a factory next to the existing ones in `utils/`.
- **Add mediasoup coverage:** extend the `schema/MediasoupRouter.ts` sample types and wire the
  matching mediasoup `observer` listeners in `ObservedMediasoupRouter.ts`.

---

## Testing

- Jest + `ts-jest`; specs in `tests/*.spec.ts`, fixtures/helpers in `tests/helpers/` (sample builders
  and a silenced logger via `setObserverLogger`). Use fake timers for teardown/policy tests.
- Add or update a spec for any behavior change; keep `yarn test:coverage` above the thresholds in
  `jest.config.js`.
- Because specs are type-checked by `ts-jest`, a type error anywhere reachable from a spec fails the
  whole suite — keep `yarn typecheck` green.

---

## Gotchas

- **`observedClient.attachments` is populated from the first `accept()`, not at creation.** Reading it
  in creation-time hooks (`client-added`, `createClientSink`, `createClientAppData`) yields
  `undefined`. Read it on `client-updated`, or capture a live `observedClient` reference (e.g. from
  `client-sink-created`) for use at close time. It is latest-wins (a sample without `attachments`
  resets it).
- **Don't store cross-entity associations implicitly.** Mediasoup router ↔ peer-connection matching is
  delivered as the `mediasoup-router-matched-with-peer-connection` event; the observer stores nothing
  on the call. Keep that loosely-coupled, event-driven shape for new correlations.
- **mediasoup is a heavy peer-ish dependency.** Its type defs can require `skipLibCheck`; keep
  mediasoup usage isolated to `ObservedMediasoupRouter.ts` / `schema/MediasoupRouter.ts` and avoid
  pulling Node/mediasoup globals into the core path.

---

## Commits & PRs

See [`CONTRIBUTING.md`](./CONTRIBUTING.md). Keep changes focused, update the README/docs and
`CHANGELOG.md` for any public-API change, and ensure lint + typecheck + tests pass before review.
