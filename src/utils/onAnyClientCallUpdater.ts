import { ObservedCall } from '../ObservedCall';
import { ObservedClient } from '../ObservedClient';
import { CallUpdater } from './CallUpdater';

export class OnAnyClientCallUpdater implements CallUpdater {
	private _minClientJoinedTimestamp?: number;
	private _maxClientLeftTimestamp?: number;
	
	public constructor(
		private _observedCall: ObservedCall
	) {
		this._onNewObservedClient = this._onNewObservedClient.bind(this);
		this._onCallEmpty = this._onCallEmpty.bind(this);

		this._observedCall.once('close', () => {
			this._observedCall.off('empty', this._onCallEmpty);
			this._observedCall.off('newclient', this._onNewObservedClient);
		});
		this._observedCall.on('newclient', this._onNewObservedClient);
		this._observedCall.on('empty', this._onCallEmpty);
	}

	public onClientUpdate() {
		this._observedCall.update();
	}

	private _onNewObservedClient(observedClient: ObservedClient) {
		const onJoined = () => this._onClientJoined(observedClient);
		const onLeft = () => this._onClientLeft(observedClient);
	
		observedClient.once('close', () => {
			observedClient.off('joined', onJoined);
			observedClient.off('left', onLeft);
		});
		observedClient.on('joined', onJoined);
		observedClient.on('left', onLeft);
	}
	
	private _onClientJoined(observedClient: ObservedClient) {
		if (!observedClient.joinedAt) return;
	
		if (!this._minClientJoinedTimestamp || observedClient.joinedAt < this._minClientJoinedTimestamp) {
			this._minClientJoinedTimestamp = observedClient.joinedAt;
		}
	}
	
	private _onClientLeft(observedClient: ObservedClient) {
		if (!observedClient.leftAt) return;
	
		if (!this._maxClientLeftTimestamp || observedClient.leftAt > this._maxClientLeftTimestamp) {
			this._maxClientLeftTimestamp = observedClient.leftAt;
		}
	}
	
	private _onCallEmpty() {
		this._observedCall.started = this._minClientJoinedTimestamp;
		this._observedCall.ended = this._maxClientLeftTimestamp;
	}
}