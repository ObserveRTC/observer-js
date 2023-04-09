import { ClientSample } from '@observertc/sample-schemas-js';

export type ObservedClientSourceConfig = {
	readonly serviceId: string,
	readonly mediaUnitId: string,
	readonly roomId: string,
	readonly clientId: string,
	readonly callId: string,
	readonly joined: number;
	
	marker?: string,
	userId?: string;
	timeZoneId?: string;
	
}

export interface ObservedClientSource extends ObservedClientSourceConfig {
	
	readonly closed: boolean;

	accept(...samples: ClientSample[]): void;

	// when you close this, client is disposed. so this triggers the client to dispose
	// therefore this triggers the call to be disposed
	// peer connections, and tracks the creation is evented by the client,
	// the close of those object is evented by the observer or closing this
	// call the close of this is mandatory, as only this closes the client inside the observer
	close(): void;
}