import { ClientSample } from '@observertc/sample-schemas-js';
import { PartialBy } from '../common/utils';
import { ObservedClientSource, ObservedClientSourceConfig } from './ObservedClientSource';

export type ObservedCallConfig = {
	readonly serviceId: string,
	readonly mediaUnitId: string,
	readonly roomId: string,
	readonly callId: string,
}

export interface ObservedCallSource extends ObservedCallConfig {
	
	readonly closed: boolean;

	createClientSource(context: PartialBy<ObservedClientSourceConfig, 'joined' | 'mediaUnitId' | 'serviceId' | 'callId' | 'roomId'>): ObservedClientSource;

	// automatically close every 
	close(): void;
}