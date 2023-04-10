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
	public constructor() {}

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

		const callIds = function* (): IterableIterator<string> {
			for (const observedCall of observedCalls.values()) {
				yield observedCall.callId;
			}
		};

		const clientIds = function* (): IterableIterator<string> {
			for (const observedCall of observedCalls.values()) {
				for (const observedClient of observedCall.observedClients()) {
					yield observedClient.clientId;
				}
			}
		};

		const peerConnectionIds = function* (): IterableIterator<string> {
			for (const observedCall of observedCalls.values()) {
				for (const observedClient of observedCall.observedClients()) {
					for (const observedPeerConnection of observedClient.observedPeerConnections()) {
						yield observedPeerConnection.peerConnectionId;
					}
				}
			}
		};

		const inboundAudioTrackIds = function* (): IterableIterator<string> {
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

		const inboundVideoTrackIds = function* (): IterableIterator<string> {
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

		const outboundAudioTrackIds = function* (): IterableIterator<string> {
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

		const outboundVideoTrackIds = function* (): IterableIterator<string> {
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
		return result;
	}
}
