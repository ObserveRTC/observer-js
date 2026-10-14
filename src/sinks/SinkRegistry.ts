import type { Sink } from './Sink';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../common/logger';

const logger = createLogger('SinkRegistry');

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
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public create<C extends new(settings: any) => Sink<any>>(
		SinkClass: C,
		settings: Omit<ConstructorParameters<C>[0], 'id'> & { id?: string },
	): InstanceType<C> | undefined {
		const lineage = this._lineage();
		const id = settings.id ?? uuidv4();

		if (lineage[lineage.length - 1]._sinks.has(id)) {
			logger.warn('Sink id %s is already in use; sink ids must be unique per observer. No sink was created', id);

			return undefined;
		}

		const sink = new SinkClass({ ...settings, id }) as InstanceType<C>;
		// An EventEmitter 'error' with no listener throws; a failing destination must not crash the process.
		const onError = (err: Error) => logger.warn('Sink %s failed: %o', id, err);

		sink.on('error', onError);
		sink.once('close', () => sink.off('error', onError));
		sink.once('ended', () => {
			for (const registry of lineage) {
				if (registry._sinks.get(id) === sink) registry._sinks.delete(id);
			}
		});
		for (const registry of lineage) registry._sinks.set(id, sink);

		return sink;
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
		for (const sink of [ ...this._sinks.values() ]) {
			try {
				sink.end();
			} catch (err) {
				logger.warn('Sink %s failed to end: %o', sink.id, err);
			}
		}
	}

	/** This registry and its ancestors, up to the root. */
	private _lineage(): SinkRegistry[] {
		return [ this, ...(this.parent?._lineage() ?? []) ];
	}
}
