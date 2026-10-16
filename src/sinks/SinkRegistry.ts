import type { Sink, SinkDestination } from './Sink';
import { JsonlFileSink } from './JsonlFileSink';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../common/logger';

const logger = createLogger('SinkRegistry');

/** A sink class `SinkRegistry.create` can construct: its constructor takes one settings object (with `id`). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SinkConstructor = new(settings: any) => Sink<any>;

/** The settings `create` takes for `SinkClass`: its constructor's, with `id` optional. */
export type SinkCreateSettings<C extends SinkConstructor> = Omit<ConstructorParameters<C>[0], 'id'> & { id?: string };

/**
 * The sinks of one object, ended by that object's lifecycle. `create(SinkClass, settings)` builds a
 * sink and registers it; `sink.end()` closes it and removes it; the owner calls `clear()` when it
 * closes, ending whatever is left.
 *
 * Registries form a tree like the issue registries: `observer.sinks` is the parent of every
 * `observedCall.sinks` and `observedMediasoupRouter.sinks`. **A sink id is unique per observer**:
 * `create` refuses an id that any registry of the tree holds. Each registry sees its own sinks and
 * its descendants', so `get`, `write` and `clear` on a parent reach a child's sinks too.
 *
 * A client's sample sink is the one under its client id in its call's registry.
 */
export class SinkRegistry {
	// This registry's sinks and its descendants'.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private readonly _sinks = new Map<string, Sink<any>>();

	// The ids of the sinks added to this registry itself (not to a descendant).
	private readonly _ownIds = new Set<string>();

	public constructor(
		public readonly parent?: SinkRegistry,
	) {
	}

	/** Number of open sinks in this registry and its descendants. */
	public get size(): number {
		return this._sinks.size;
	}

	public keys(): IterableIterator<string> {
		return this._sinks.keys();
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public values(): IterableIterator<Sink<any>> {
		return this._sinks.values();
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public get<T extends Sink<any> = Sink>(id: string): T | undefined {
		return this._sinks.get(id) as T | undefined;
	}

	/**
	 * Construct `new SinkClass(settings)` and register it. The id (`settings.id`, generated when
	 * omitted) is checked first, so nothing is constructed — no file is opened — when it is taken:
	 * `undefined` is returned and a warning logged.
	 */
	public create<C extends SinkConstructor>(SinkClass: C, settings: SinkCreateSettings<C>): InstanceType<C> | undefined {
		const lineage = this._lineage();
		const id = settings.id ?? uuidv4();

		if (lineage[lineage.length - 1]._sinks.has(id)) {
			logger.warn('Sink id %s is already in use; sink ids must be unique per observer. No sink was created', id);

			return undefined;
		}

		const sink = new SinkClass({ ...settings, id }) as InstanceType<C>;

		this._register(sink, lineage);

		return sink;
	}

	/**
	 * Register a sink constructed elsewhere, under its own `id`. Returns `false`, registering nothing,
	 * when the id is already in use in the observer (the sink is then the caller's to end). Prefer
	 * `create` when the sink opens a resource on construction: it checks the id first.
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public add(sink: Sink<any>): boolean {
		const lineage = this._lineage();

		if (lineage[lineage.length - 1]._sinks.has(sink.id)) {
			logger.warn('Sink id %s is already in use; sink ids must be unique per observer. The sink was not added', sink.id);

			return false;
		}

		this._register(sink, lineage);

		return true;
	}

	/**
	 * Register the sink a `SinkDestination` describes, under `id`: for `jsonlPath`, a `JsonlFileSink`
	 * is created (the id is checked before the file is opened); a `sink` is added, and its `id` must
	 * be `id`. Returns `undefined` when the id is taken, the ids differ, or both are given (possible
	 * from JavaScript); a given `sink` that is not registered is ended.
	 */
	public createFromDestination<T>(id: string, destination: SinkDestination<T>): Sink<T> | undefined {
		const { jsonlPath, sink } = destination as { jsonlPath?: string, sink?: Sink<T> };
		const refuse = (reason: string, ...args: unknown[]) => {
			logger.warn(`Sink ${id}: ${reason}`, ...args);
			sink?.end();

			return undefined;
		};

		if (jsonlPath !== undefined && sink) return refuse('give either jsonlPath or sink, not both');
		if (jsonlPath !== undefined) return this.create(JsonlFileSink<T>, { id, path: jsonlPath });
		if (!sink) return undefined;
		if (sink.id !== id) return refuse('the sink id %s must be %s; it is ended', sink.id, id);
		if (!this.add(sink)) return refuse('the id is already in use; the sink is ended');

		return sink;
	}

	/** Whether the sink `id` was added to this registry itself, rather than to a descendant. */
	public owns(id: string): boolean {
		return this._ownIds.has(id);
	}

	/** Write `record` to the sink `id`. `false` when there is no such sink, or on backpressure. */
	public write(id: string, record: unknown): boolean {
		const sink = this._sinks.get(id);

		if (!sink) {
			logger.debug('No sink %s; record dropped', id);

			return false;
		}

		return sink.write(record);
	}

	/** End every sink of this registry and of its descendants. */
	public clear(): void {
		// Snapshot first: each `end()` removes its sink from the map.
		for (const [ id, sink ] of [ ...this._sinks.entries() ]) {
			try {
				sink.end();
			} catch (err) {
				logger.warn('Sink %s failed to end: %o', id, err);
			}
		}
	}

	/** This registry and its ancestors, up to the root. */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private _register(sink: Sink<any>, lineage: SinkRegistry[]): void {
		const id = sink.id;

		// An EventEmitter 'error' with no listener throws; a failing destination must not crash the process.
		const onError = (err: Error) => logger.warn('Sink %s failed: %o', id, err);

		sink.on('error', onError);
		sink.once('close', () => sink.off('error', onError));
		sink.once('ended', () => {
			if (this._sinks.get(id) === sink) this._ownIds.delete(id);
			for (const registry of lineage) {
				if (registry._sinks.get(id) === sink) registry._sinks.delete(id);
			}
		});
		this._ownIds.add(id);
		for (const registry of lineage) registry._sinks.set(id, sink);
	}

	private _lineage(): SinkRegistry[] {
		return [ this, ...(this.parent?._lineage() ?? []) ];
	}
}
