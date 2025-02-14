import { ObservedCall } from '../ObservedCall';
import { ObservedClient } from '../ObservedClient';
import { Updater } from './Updater';
 
export class OnAllClientCallUpdater implements Updater {
	readonly name = 'OnAllClientCallUpdater';
	readonly description = 'Call the update() method of the ObservedCall once all client has been updated';

	private readonly _updatedClients = new Set<string>();

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
		const onUpdate = () => this._onClientUpdate(observedClient);

		observedClient.once('close', () => {
			observedClient.off('update', onUpdate);
			this._updatedClients.delete(observedClient.clientId);
		});
		observedClient.on('update', onUpdate);
	}

	private _onClientUpdate(observedClient: ObservedClient) {
		this._updatedClients.add(observedClient.clientId);

		if (this._updatedClients.size < this._observedCall.observedClients.size) {
			return;
		}
		this._updatedClients.clear();
		this._observedCall.update();
	}

}	