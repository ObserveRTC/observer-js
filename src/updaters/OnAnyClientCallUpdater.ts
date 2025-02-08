import { ObservedCall } from '../ObservedCall';
import { ObservedClient } from '../ObservedClient';
import { Updater } from './Updater';

export class OnAnyClientCallUpdater implements Updater {
	readonly name = 'OnAnyClientCallUpdater';
	readonly description = 'Call the update() method of the ObservedCall when any of the client has been updated';

	public constructor(
		private _observedCall: ObservedCall
	) {
		this._onNewObservedClient = this._onNewObservedClient.bind(this);

		this._observedCall.once('close', () => {
			this._observedCall.off('newclient', this._onNewObservedClient);
		});
		this._observedCall.on('newclient', this._onNewObservedClient);
	}
	
	public close(): void {
		// do nothing, as close once emitted unsubscription happened
	}

	private _onNewObservedClient(observedClient: ObservedClient) {
		const onUpdate = () => this._observedCall.update();

		observedClient.once('close', () => {
			observedClient.off('update', onUpdate);
		});
		observedClient.on('update', onUpdate);
	}
}