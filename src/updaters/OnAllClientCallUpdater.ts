import { ObservedCall } from '../ObservedCall';
import { ObservedClient } from '../ObservedClient';
import { Updater } from './Updater';
 
export class OnAllClientCallUpdater implements Updater {
	readonly name = 'OnAllClientCallUpdater';
	readonly description = 'Call the update() method of the ObservedCall once all client has been updated';

	private readonly _updatedClients = new Set<string>();
	public closed = false;

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
		if (this.closed) return;
		this.closed = true;
		// do nothing, as close once emitted unsubscription happened
		this._updatedClients.clear();
	}

	private _onNewObservedClient(observedClient: ObservedClient) {
		if (this.closed) return;
		
		const onUpdate = () => this._onClientUpdate(observedClient);

		observedClient.once('close', () => {
			observedClient.off('update', onUpdate);
			this._updatedClients.delete(observedClient.clientId);
			this._updateIfEveryClientUpdated();
		});
		observedClient.on('update', onUpdate);
	}

	private _onClientUpdate(observedClient: ObservedClient) {
		if (observedClient.closed) return;

		this._updatedClients.add(observedClient.clientId);
		this._updateIfEveryClientUpdated();
	}

	private _updateIfEveryClientUpdated() {
		if (this._updatedClients.size < this._observedCall.observedClients.size) {
			return;
		} else if (this.closed) {
			return;
		}

		this._updatedClients.clear();
		this._observedCall.update();
	}

}	