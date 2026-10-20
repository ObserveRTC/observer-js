import { EventEmitter } from 'node:events';
import type { Sink, SinkEvents, SinkSettings } from './Sink';
import type { ClientSample } from '../schema/ClientSample';

export declare interface InMemorySink {
	on<E extends keyof SinkEvents>(event: E, listener: (...args: SinkEvents[E]) => void): this;
	once<E extends keyof SinkEvents>(event: E, listener: (...args: SinkEvents[E]) => void): this;
	off<E extends keyof SinkEvents>(event: E, listener: (...args: SinkEvents[E]) => void): this;
	emit<E extends keyof SinkEvents>(event: E, ...args: SinkEvents[E]): boolean;
}

/**
 * A client sample sink that collects the accepted sample objects into an array. Useful for tests
 * and offline replay. Emits `ended` and `close` on `end()`.
 */
export class InMemorySink extends EventEmitter implements Sink<ClientSample> {
	public readonly id: string;
	public readonly samples: ClientSample[];

	private _ended = false;

	public constructor(settings: Partial<SinkSettings> & { samples?: ClientSample[] } = {}) {
		super();
		this.id = settings.id ?? 'in-memory';
		this.samples = settings.samples ?? [];
	}

	public get ended(): boolean {
		return this._ended;
	}

	public write(sample: ClientSample): boolean {
		if (this._ended) return false;
		this.samples.push(sample);

		return true;
	}

	public end(): void {
		if (this._ended) return;

		this._ended = true;
		this.emit('ended');
		this.emit('close');
	}
}

export function createInMemorySink(samples?: ClientSample[]): InMemorySink {
	return new InMemorySink({ samples });
}
