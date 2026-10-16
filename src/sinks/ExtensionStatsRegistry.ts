import type { SinkRegistry } from './SinkRegistry';
import type { Sink, SinkDestination } from './Sink';
import { createLogger } from '../common/logger';

const logger = createLogger('ExtensionStats');

/**
 * The settings of `createExtensionStats` on an observer, a call or a mediasoup router: the `id`,
 * and at most one of `jsonlPath` and `sink` (a `SinkDestination`).
 */
export type CreateExtensionStatsSettings<T = unknown> = {

	/** Unique per observer: it is also the id of the sink that receives the stats. */
	id: string,
} & (SinkDestination<T> | { jsonlPath?: never, sink?: never });

/**
 * The extension stats of one object — `observer.extensionStats`, `observedCall.extensionStats`,
 * `observedMediasoupRouter.extensionStats`: the last data per id (`values`), written to the
 * object's sink with the same id. The owner closes it when it closes.
 */
export class ExtensionStatsRegistry {
	/** The last data accepted for each extension stats id. */
	public readonly values = new Map<string, unknown>();
	public closed = false;

	public constructor(
		/** The owner's id (call id, router id, or `observer`), used in log messages. */
		public readonly id: string,
		private readonly _sinks: SinkRegistry,
	) {
	}

	/**
	 * Refuse further `create` / `accept`, and end the extension stats' sinks (the sinks whose id is
	 * an extension stats id). Other sinks of the owner, e.g. client sample sinks, are left to the
	 * owner's `sinks.clear()`. Called by the owner when it closes.
	 */
	public close(): void {
		if (this.closed) return;

		this.closed = true;

		for (const id of this.values.keys()) {
			this._sinks.get(id)?.end();
		}
	}

	public create<T = unknown>(settings: CreateExtensionStatsSettings<T>): Sink<T> | undefined {
		const { id, jsonlPath, sink } = settings as { id: string, jsonlPath?: string, sink?: Sink<T> };
		// A given sink is the owner's from here: refused, it is ended rather than left open.
		const refuse = (reason: string) => {
			logger.warn('Extension stats %s on %s: %s', id, this.id, reason);
			sink?.end();

			return undefined;
		};

		if (this.closed) return refuse('the owner is closed');
		if (this.values.has(id)) return refuse('the id already exists');
		if (jsonlPath !== undefined && sink) return refuse('give either jsonlPath or sink, not both');
		if (sink && sink.id !== id) return refuse(`the sink id ${sink.id} differs from the extension stats id`);

		this.values.set(id, undefined);

		if (jsonlPath === undefined && !sink) return undefined;

		// Replace a sink this owner holds under the id; never one of a descendant's.
		if (this._sinks.owns(id)) this._sinks.get(id)?.end();

		return this._sinks.createFromDestination<T>(id, settings as SinkDestination<T>);
	}

	public accept(id: string, data: unknown): void {
		if (this.closed) {
			logger.debug('Extension stats %s dropped: %s is closed', id, this.id);

			return;
		}

		this.values.set(id, data);

		try {
			this._sinks.get(id)?.write(data);
		} catch (err) {
			logger.warn('Failed to write extension stats %s to sink: %o', id, err);
		}
	}

	public get<T>(id: string): T | undefined {
		return this.values.get(id) as T | undefined;
	}
}
