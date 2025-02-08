import { ObservedCall } from '../ObservedCall';
import { Observer } from '../Observer';
import { Updater } from './Updater';

export class OnAnyCallObserverUpdater implements Updater {
	public readonly name = 'OnAnyCallObserverUpdater';
	public readonly description = 'Call Observer\'s update() method on any of the ObservedCall is updated';
	
	public constructor(
		private observver: Observer
	) {
		this._onNewObservedCall = this._onNewObservedCall.bind(this);

		this.observver.once('close', () => {
			this.observver.off('newcall', this._onNewObservedCall);
		});
		this.observver.on('newcall', this._onNewObservedCall);
	}

	close(): void {
		// do nothing, because we unsubscribe once close is emitted from observer
	}

	private _onNewObservedCall(observedCall: ObservedCall) {
		const onUpdate = () => this.observver.update();

		observedCall.once('close', () => {
			observedCall.off('update', onUpdate);
		});
		observedCall.on('update', onUpdate);
	}
}