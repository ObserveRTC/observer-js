import { Observer } from '../Observer';
import type { ObservedCallScope } from '../ObserverEvents';
import { Updater } from './Updater';

export class OnAnyCallObserverUpdater implements Updater {
	public readonly name = 'OnAnyCallObserverUpdater';
	public readonly description = 'Call Observer\'s update() method on any of the ObservedCall is updated';
	public closed = false;

	public constructor(
		private observver: Observer
	) {
		this._onNewObservedCall = this._onNewObservedCall.bind(this);

		this.observver.once('observer-closed', () => {
			this.observver.off('call-added', this._onNewObservedCall);
		});
		this.observver.on('call-added', this._onNewObservedCall);
	}

	public close(): void {
		if (this.closed) return;
		this.closed = true;
		// do nothing, because we unsubscribe once close is emitted from observer
	}

	private _onNewObservedCall({ observedCall }: ObservedCallScope) {
		if (this.closed) return;

		const onUpdate = () => {
			if (this.closed) return;

			this.observver.update();
		};

		observedCall.once('close', () => {
			observedCall.off('update', onUpdate);
		});
		observedCall.on('update', onUpdate);
	}
}