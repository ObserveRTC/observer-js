import { ClientSample, SfuSample } from '@observertc/sample-schemas-js';

export type ObservedSfuSourceConfig = {
	readonly serviceId: string;
	readonly mediaUnitId: string;
	readonly sfuId: string;
	readonly joined: number;

	timeZoneId?: string;
};

export interface ObservedSfuSource extends ObservedSfuSourceConfig {
	readonly closed: boolean;

	accept(...samples: SfuSample[]): void;

	// when you close this, client is disposed. so this triggers the client to dispose
	// therefore this triggers the call to be disposed
	// peer connections, and tracks the creation is evented by the client,
	// the close of those object is evented by the observer or closing this
	// call the close of this is mandatory, as only this closes the client inside the observer
	close(): void;
}
