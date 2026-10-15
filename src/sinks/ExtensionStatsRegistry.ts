import type { SinkConstructor, SinkCreateSettings, SinkRegistry } from './SinkRegistry';
import { createLogger } from '../common/logger';

const logger = createLogger('ExtensionStats');

/** The settings of `createExtensionStats` on an observer, a call or a mediasoup router. */
export type CreateExtensionStatsSettings<C extends SinkConstructor> = {

	/** Unique per observer: it is also the id of the sink that receives the stats. */
	id: string,

	/** What `sinks.create` takes; the sink is created under `id` (an `id` in its settings is ignored). */
	createSink?: [SinkClass: C, settings: Omit<SinkCreateSettings<C>, 'id'>],
};

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

	public create<C extends SinkConstructor>(settings: CreateExtensionStatsSettings<C>): InstanceType<C> | undefined {
		if (this.closed) {
			logger.warn('Attempted to create extension stats %s on closed %s', settings.id, this.id);

			return undefined;
		}
		if (this.values.has(settings.id)) {
			logger.warn('Extension stats with id %s already exists on %s', settings.id, this.id);

			return undefined;
		}

		this.values.set(settings.id, undefined);

		if (!settings.createSink) return undefined;

		const [ SinkClass, sinkSettings ] = settings.createSink;

		this._sinks.get(settings.id)?.end();

		return this._sinks.create(SinkClass, { ...sinkSettings, id: settings.id } as SinkCreateSettings<C>);
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
