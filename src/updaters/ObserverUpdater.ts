import { ObservedCall } from '../ObservedCall';

export interface ObserverUpdater {
	onCallUpdate(observedCall: ObservedCall): void;
}