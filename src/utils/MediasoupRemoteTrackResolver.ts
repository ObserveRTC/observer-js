import { ObservedCall } from '../ObservedCall';
import { ObservedInboundTrack } from '../ObservedInboundTrack';
import { ObservedOutboundTrack } from '../ObservedOutboundTrack';
import { RemoteTrackResolver } from './RemoteTrackResolver';
import type { ObserverEvents } from '../ObserverEvents';

export class MediasoupRemoteTrackResolver implements RemoteTrackResolver {
	private _consumerIdToProducerId = new Map<string, string>();
	private _producerIdToOutboundTrack = new Map<string, ObservedOutboundTrack>();
	private _consumerIdToInboundTrack = new Map<string, ObservedInboundTrack>();
	// private _producerIdToOutboundTrack = new Map<string, ObservedOutboundTrack>();

	private _inboundTrackToConsumerId = new Map<string, string>();
	private _producerIdToConsumerIds = new Map<string, string[]>();
	private _outboundTrackToProducerId = new Map<string, string>();

	public constructor(
		public readonly observedCall: ObservedCall
	) {
		const observer = observedCall.observer;

		// Subscribe to the central Observer bus, filtering to this call's tracks.
		const onInboundAdded = (p: ObserverEvents['inbound-track-added'][0]) => {
			if (p.observedCall === this.observedCall) this._addInboundTrack(p.observedInboundTrack);
		};
		const onInboundRemoved = (p: ObserverEvents['inbound-track-removed'][0]) => {
			if (p.observedCall === this.observedCall) this._removeInboundTrack(p.observedInboundTrack);
		};
		const onOutboundAdded = (p: ObserverEvents['outbound-track-added'][0]) => {
			if (p.observedCall === this.observedCall) this._addOutboundTrack(p.observedOutboundTrack);
		};
		const onOutboundRemoved = (p: ObserverEvents['outbound-track-removed'][0]) => {
			if (p.observedCall === this.observedCall) this._removeOutboundTrack(p.observedOutboundTrack);
		};

		observer.on('inbound-track-added', onInboundAdded);
		observer.on('inbound-track-removed', onInboundRemoved);
		observer.on('outbound-track-added', onOutboundAdded);
		observer.on('outbound-track-removed', onOutboundRemoved);

		observedCall.once('close', () => {
			observer.off('inbound-track-added', onInboundAdded);
			observer.off('inbound-track-removed', onInboundRemoved);
			observer.off('outbound-track-added', onOutboundAdded);
			observer.off('outbound-track-removed', onOutboundRemoved);
		});
	}

	public resolveRemoteOutboundTrack(inboundTrack: ObservedInboundTrack): ObservedOutboundTrack | undefined {
		const consumerId = this._inboundTrackToConsumerId.get(inboundTrack.id);

		if (!consumerId) return;
        
		const producerId = this._consumerIdToProducerId.get(consumerId);

		if (!producerId) return;

		return this._producerIdToOutboundTrack.get(producerId);
	}

	public resolveRemoteInboundTracks(outboundTrack: ObservedOutboundTrack): ObservedInboundTrack[] | undefined {
		const producerId = this._outboundTrackToProducerId.get(outboundTrack.id);

		if (!producerId) return;

		const consumerIds = this._producerIdToConsumerIds.get(producerId);

		if (!consumerIds) return;
		
		return consumerIds
			.map((consumerId) => this._consumerIdToInboundTrack.get(consumerId))
			.filter((inboundTrack) => Boolean(inboundTrack)) as ObservedInboundTrack[]
		;     
	}

	private _addInboundTrack(inboundTrack: ObservedInboundTrack) {
		const attachments = this._getInboundTrackAttachments(inboundTrack);

		if (!attachments) return;

		const {
			producerId,
			consumerId
		} = attachments;

		this._inboundTrackToConsumerId.set(inboundTrack.id, consumerId);
		this._consumerIdToProducerId.set(consumerId, producerId);
		this._consumerIdToInboundTrack.set(consumerId, inboundTrack);

		let producerConsumers = this._producerIdToConsumerIds.get(producerId);

		if (!producerConsumers) {
			producerConsumers = [];
			this._producerIdToConsumerIds.set(producerId, producerConsumers);
		}
		producerConsumers.push(consumerId);
	}

	private _removeInboundTrack(inboundTrack: ObservedInboundTrack) {
		const consumerId = this._inboundTrackToConsumerId.get(inboundTrack.id);

		if (!consumerId) return;

		this._inboundTrackToConsumerId.delete(inboundTrack.id);
		this._consumerIdToProducerId.delete(consumerId);
		this._consumerIdToInboundTrack.delete(consumerId);
        
		const producerConsumers = this._producerIdToConsumerIds.get(consumerId);

		if (!producerConsumers) return;

		const filteredProducerConsumers = producerConsumers.filter((id) => id !== consumerId);

		if (filteredProducerConsumers.length === 0) {
			this._producerIdToConsumerIds.delete(consumerId);
		} else {
			this._producerIdToConsumerIds.set(consumerId, filteredProducerConsumers);
		}
	}

	private _addOutboundTrack(outboundTrack: ObservedOutboundTrack) {
		const attachments = this._getOutboundTrackAttachments(outboundTrack);

		if (!attachments) return;

		const {
			producerId,
		} = attachments;

		this._producerIdToOutboundTrack.set(producerId, outboundTrack);
		this._outboundTrackToProducerId.set(outboundTrack.id, producerId);
	}

	private _removeOutboundTrack(outboundTrack: ObservedOutboundTrack) {
		const producerId = this._outboundTrackToProducerId.get(outboundTrack.id);

		if (!producerId) return;

		this._producerIdToOutboundTrack.delete(producerId);
		this._outboundTrackToProducerId.delete(outboundTrack.id);
	}

	private _getInboundTrackAttachments(inboundTrack: ObservedInboundTrack) {
		const {
			producerId,
			consumerId
		} = inboundTrack.attachments ?? {};

		if (!producerId || !consumerId || typeof producerId !== 'string' || typeof consumerId !== 'string') return;

		return {
			producerId,
			consumerId
		};
	}

	private _getOutboundTrackAttachments(outboundTrack: ObservedOutboundTrack) {
		const {
			producerId,
		} = outboundTrack.attachments ?? {};

		if (!producerId || typeof producerId !== 'string') return;

		return {
			producerId,
		};
	}
}