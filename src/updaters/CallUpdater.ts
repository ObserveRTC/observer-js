import { ObservedClient } from '../ObservedClient';

export interface CallUpdater {
	onClientUpdate(observedClient: ObservedClient): void;
}