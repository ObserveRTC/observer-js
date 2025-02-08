import { ObservedCall } from '../ObservedCall';
import { Observer } from '../Observer';
import { Updater } from './Updater';

export class OnAllCallObserverUpdater implements Updater {
	public readonly name = 'OnAllCallObserverUpdater';
	public readonly description = 'Call Observer\'s update() method when all of the ObservedCalls are updated';
	
	private readonly _updatedCalls = new Set<string>();

	public constructor(
		private observer: Observer
	) {
		this._onNewObservedCall = this._onNewObservedCall.bind(this);

		this.observer.once('close', () => {
			this.observer.off('newcall', this._onNewObservedCall);
		});
		this.observer.on('newcall', this._onNewObservedCall);
	}

	close(): void {
		// do nothing, because we unsubscribe once close is emitted from observer
	}

	private _onNewObservedCall(observedCall: ObservedCall) {
		const onUpdate = () => this._onObservedCallUpdated(observedCall);

		observedCall.once('close', () => {
			observedCall.off('update', onUpdate);
			this._updatedCalls.delete(observedCall.callId);
		});
		observedCall.on('update', onUpdate);
	}

	private _onObservedCallUpdated(observedCall: ObservedCall) {
		if (observedCall.closed) return;

		this._updatedCalls.add(observedCall.callId);

		if (this._updatedCalls.size < this.observer.observedCalls.size) return;

		this._updatedCalls.clear();
		this.observer.update();
	}
}