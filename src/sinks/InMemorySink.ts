import { ClientSampleSink } from './ClientSampleSink';
import type { ClientSample } from '../schema/ClientSample';

/**
 * A `ClientSampleSink` that collects the accepted sample objects into an array. Useful for
 * tests and offline replay; works in any environment (no `fs`). Emits `close` on `end()`.
 */
export class InMemorySink extends ClientSampleSink {
	public constructor(public readonly samples: ClientSample[] = []) {
		super();
	}

	public write(sample: ClientSample): boolean {
		this.samples.push(sample);

		return true;
	}

	public end(): void {
		this.emit('close');
	}
}

export function createInMemorySink(samples?: ClientSample[]): InMemorySink {
	return new InMemorySink(samples);
}
