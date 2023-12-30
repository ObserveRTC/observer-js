import { PartialBy } from '../common/utils';
import { ObservedClientSource, ObservedClientSourceConfig } from './ObservedClientSource';

export type ObservedCallSourceConfig<T extends Record<string, unknown>> = {
	readonly appData: T
	readonly serviceId: string;
	readonly mediaUnitId: string;
	readonly roomId: string;
	readonly callId: string;
};

export interface ObservedCallSource<T extends Record<string, unknown> = Record<string, unknown>> extends ObservedCallSourceConfig<T> {
	readonly closed: boolean;
	readonly clients: ReadonlyMap<string, ObservedClientSource>;

	createClientSource<U extends Record<string, unknown> = Record<string, unknown>>(
		context: PartialBy<ObservedClientSourceConfig<U>, 'joined' | 'mediaUnitId' | 'serviceId' | 'callId' | 'roomId'>
	): ObservedClientSource;

	// automatically close every
	close(): void;
}
