import { iteratorConverter } from '../common/utils';
import { ObservedCall, ObservedCallBuilder } from './ObservedCall';

export interface ObservedCalls {
	callIds(): IterableIterator<string>;
	clientIds(): IterableIterator<string>;
	peerConnectionIds(): IterableIterator<string>;
	inboundAudioTrackIds(): IterableIterator<string>;
	inboundVideoTrackIds(): IterableIterator<string>;
	outboundAudioTrackIds(): IterableIterator<string>;
	outboundVideoTrackIds(): IterableIterator<string>;

	observedCalls(): IterableIterator<ObservedCall>;
	getObservedCall(callId: string): ObservedCall | undefined;
}

export class ObservedCallsBuilder {
	private _builders = new Map<string, ObservedCallBuilder>();
	public constructor() {
		// nothing
	}

	public getOrCreateObservedCallBuilder(
		callId: string,
		configSupplier: () => ConstructorParameters<typeof ObservedCallBuilder>[0]
	) {
		let result = this._builders.get(callId);

		if (!result) {
			const config = configSupplier();

			result = new ObservedCallBuilder(config);
			this._builders.set(callId, result);
		}
		
		return result;
	}

	public build(): ObservedCalls {
		const observedCalls = new Map<string, ObservedCall>();

		const callIdsGenerator = function *() {
			for (const observedCall of observedCalls.values()) {
				yield observedCall.callId;
			}
		};
		const callIds = () => iteratorConverter<string>(callIdsGenerator());

		const clientIdsGenerator = function *() {
			for (const observedCall of observedCalls.values()) {
				for (const observedClient of observedCall.observedClients()) {
					yield observedClient.clientId;
				}
			}
		};
		const clientIds = () => iteratorConverter<string>(clientIdsGenerator());

		const peerConnectionIdsGenerator = function *() {
			for (const observedCall of observedCalls.values()) {
				for (const observedClient of observedCall.observedClients()) {
					for (const observedPeerConnection of observedClient.observedPeerConnections()) {
						yield observedPeerConnection.peerConnectionId;
					}
				}
			}
		};
		const peerConnectionIds = () => iteratorConverter<string>(peerConnectionIdsGenerator());

		const inboundAudioTrackIdsGenerator = function *() {
			for (const observedCall of observedCalls.values()) {
				for (const observedClient of observedCall.observedClients()) {
					for (const observedPeerConnection of observedClient.observedPeerConnections()) {
						for (const inboundAudioTrack of observedPeerConnection.inboundAudioTracks()) {
							yield inboundAudioTrack.trackId;
						}
					}
				}
			}
		};
		const inboundAudioTrackIds = () => iteratorConverter<string>(inboundAudioTrackIdsGenerator());

		const inboundVideoTrackIdsGenerator = function *() {
			for (const observedCall of observedCalls.values()) {
				for (const observedClient of observedCall.observedClients()) {
					for (const observedPeerConnection of observedClient.observedPeerConnections()) {
						for (const inboundVideoTrack of observedPeerConnection.inboundVideoTracks()) {
							yield inboundVideoTrack.trackId;
						}
					}
				}
			}
		};
		const inboundVideoTrackIds = () => iteratorConverter<string>(inboundVideoTrackIdsGenerator());

		const outboundAudioTrackIdsGenerator = function *() {
			for (const observedCall of observedCalls.values()) {
				for (const observedClient of observedCall.observedClients()) {
					for (const observedPeerConnection of observedClient.observedPeerConnections()) {
						for (const outboundAudioTrack of observedPeerConnection.outboundAudioTracks()) {
							yield outboundAudioTrack.trackId;
						}
					}
				}
			}
		};
		const outboundAudioTrackIds = () => iteratorConverter<string>(outboundAudioTrackIdsGenerator());

		const outboundVideoTrackIdsGenerator = function *() {
			for (const observedCall of observedCalls.values()) {
				for (const observedClient of observedCall.observedClients()) {
					for (const observedPeerConnection of observedClient.observedPeerConnections()) {
						for (const outboundVideoTrack of observedPeerConnection.outboundVideoTracks()) {
							yield outboundVideoTrack.trackId;
						}
					}
				}
			}
		};
		const outboundVideoTrackIds = () => iteratorConverter<string>(outboundVideoTrackIdsGenerator());

		const result: ObservedCalls = {
			callIds,
			clientIds,
			peerConnectionIds,
			inboundAudioTrackIds,
			inboundVideoTrackIds,
			outboundAudioTrackIds,
			outboundVideoTrackIds,
			observedCalls: () => observedCalls.values(),
			getObservedCall: (callId) => observedCalls.get(callId),
		};

		for (const builder of this._builders.values()) {
			const observedCall = builder.build();

			observedCalls.set(observedCall.callId, observedCall);
		}
		this._builders.clear();
		
		return result;
	}

}
