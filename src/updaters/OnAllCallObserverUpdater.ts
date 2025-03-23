import { ObservedCall } from '../ObservedCall';
import { Observer } from '../Observer';
import { Updater } from './Updater';

export class OnAllCallObserverUpdater implements Updater {
	public readonly name = 'OnAllCallObserverUpdater';
	public readonly description = 'Call Observer\'s update() method when all of the ObservedCalls are updated';
	
	private readonly _updatedCalls = new Set<string>();
	public closed = false;

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
		if (this.closed) return;
		this.closed = true;

		this._updatedCalls.clear();
	}

	private _onNewObservedCall(observedCall: ObservedCall) {
		if (this.closed) return;
		
		const onUpdate = () => this._onObservedCallUpdated(observedCall);

		observedCall.once('close', () => {
			observedCall.off('update', onUpdate);
			this._updatedCalls.delete(observedCall.callId);

			this._updateIfEveryCallUpdated();
		});
		observedCall.on('update', onUpdate);
	}

	private _onObservedCallUpdated(observedCall: ObservedCall) {
		if (observedCall.closed) return;

		this._updatedCalls.add(observedCall.callId);

		this._updateIfEveryCallUpdated();
	}

	private _updateIfEveryCallUpdated() {
		if (this._updatedCalls.size < this.observer.observedCalls.size) return;
		else if (this.closed) return;

		this._updatedCalls.clear();
		this.observer.update();
	}
}