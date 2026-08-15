import { EventEmitter } from 'events';
import { ObservedClient } from './ObservedClient';
import { CertificateStats, CodecStats, DataChannelStats, IceCandidateStats, InboundRtpStats, InboundTrackSample, MediaPlayoutStats, MediaSourceStats, OutboundRtpStats, OutboundTrackSample, PeerConnectionSample, PeerConnectionTransportStats, RemoteInboundRtpStats, RemoteOutboundRtpStats } from './schema/ClientSample';
import { ObservedInboundRtp } from './ObservedInboundRtp';
import { createLogger } from './common/logger';
import { MediaKind } from './common/types';
import { ObservedOutboundRtp } from './ObservedOutboundRtp';
import { ObservedCertificate } from './ObservedCertificate';
import { ObservedCodec } from './ObservedCodec';
import { ObservedDataChannel } from './ObservedDataChannel';
import { ObservedIceCandidate } from './ObservedIceCandidate';
import { ObservedIceCandidatePair } from './ObservedIceCandidatePair';
import { ObservedIceTransport } from './ObservedIceTransport';
import { ObservedMediaSource } from './ObservedMediaSource';
import { ObservedPeerConnectionTransport } from './ObservedPeerConnectionTransport';
import { ObservedMediaPlayout } from './ObservedMediaPlayout';
import { ObservedRemoteInboundRtp } from './ObservedRemoteInboundRtp';
import { ObservedRemoteOutboundRtp } from './ObservedRemoteOutboundRtp';
import { ObservedInboundTrack } from './ObservedInboundTrack';
import { ObservedOutboundTrack } from './ObservedOutboundTrack';
import { CalculatedScore } from './scores/CalculatedScore';
import { ObservedTurnServer } from './ObservedTurnServer';
import { percentileOfSorted } from './utils/stats';

/** Sorting in place is deliberate: these arrays are local per-tick scratch, so a copy is pure waste. */
const ascending = (a: number, b: number) => a - b;

import type { AcceptContext } from './Observer';
import type { ObserverEvents, ObservedPeerConnectionScope } from './ObserverEvents';

const logger = createLogger('ObservedPeerConnection');

// Local lifecycle/coordination events only. All consumer-facing events are
// emitted on the Observer bus (see ObserverEvents). `close` and the two track
// `removed-*` events stay local because the parent ObservedClient wires to them
// for teardown and track-report emission.
export type ObservedPeerConnectionEvents = {
	'removed-inbound-track': [ObservedInboundTrack];
	'removed-outbound-track': [ObservedOutboundTrack];
	close: [];
};

export declare interface ObservedPeerConnection {
	on<U extends keyof ObservedPeerConnectionEvents>(
		event: U,
		listener: (...args: ObservedPeerConnectionEvents[U]) => void
	): this;
	off<U extends keyof ObservedPeerConnectionEvents>(
		event: U,
		listener: (...args: ObservedPeerConnectionEvents[U]) => void
	): this;
	once<U extends keyof ObservedPeerConnectionEvents>(
		event: U,
		listener: (...args: ObservedPeerConnectionEvents[U]) => void
	): this;
	emit<U extends keyof ObservedPeerConnectionEvents>(event: U, ...args: ObservedPeerConnectionEvents[U]): boolean;
}

export class ObservedPeerConnection extends EventEmitter {
	private _visited = true;

	public appData?: Record<string, unknown>;
	public readonly calculatedScore: CalculatedScore = {
		weight: 1,
		value: undefined,
	};

	public closed = false;
	// timestamp of the PEER_CONNECTION_OPENED event
	public openedAt?: number;
	// timestamp of the PEER_CONNECTION_CLOSED event
	public closedAt?: number;
	public updated = Date.now();

	public connectionState?: 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed';
	public iceConnectionState?: 'new' | 'checking' | 'connected' | 'completed' | 'failed' | 'disconnected' | 'closed';
	public iceGatheringState?: 'new' | 'gathering' | 'complete';

	public availableIncomingBitrate = 0;
	public availableOutgoingBitrate = 0;
	public totalInboundPacketsLost = 0;
	public totalInboundPacketsReceived = 0;
	public totalOutboundPacketsSent = 0;
	public totalDataChannelBytesSent = 0;
	public totalDataChannelBytesReceived = 0;
	public totalDataChannelMessagesSent = 0;
	public totalDataChannelMessagesReceived = 0;

	public totalSentAudioBytes = 0;
	public totalSentVideoBytes = 0;
	public totalSentAudioPackets = 0;
	public totalSentVideoPackets = 0;
	public totalReceivedAudioPacktes = 0;
	public totalReceivedVideoPackets = 0;
	public totalReceivedAudioBytes = 0;
	public totalReceivedVideoBytes = 0;

	public deltaInboundPacketsLost = 0;
	public deltaInboundPacketsReceived = 0;
	public deltaOutboundPacketsSent = 0;
	public deltaDataChannelBytesSent = 0;
	public deltaDataChannelBytesReceived = 0;
	public deltaDataChannelMessagesSent = 0;
	public deltaDataChannelMessagesReceived = 0;
	public deltaInboundReceivedBytes = 0;
	public deltaOutboundSentBytes = 0;

	public deltaReceivedAudioBytes = 0;
	public deltaReceivedVideoBytes = 0;
	public deltaReceivedAudioPackets = 0;
	public deltaReceivedVideoPackets = 0;
	public deltaSentAudioBytes = 0;
	public deltaSentVideoBytes = 0;
	public deltaSentAudioPackets = 0;
	public deltaSentVideoPackets = 0;
	public deltaTransportSentBytes = 0;
	public deltaTransportReceivedBytes = 0;

	public receivingPacketsPerSecond = 0;
	public sendingPacketsPerSecond = 0;
	public sendingAudioBitrate = 0;
	public sendingVideoBitrate = 0;
	public receivingAudioBitrate = 0;
	public receivingVideoBitrate = 0;

	/**
	 * Median round-trip time of the tick, in ms.
	 *
	 * Prefers {@link rtcpRttInMs} and falls back to {@link iceRttInMs}, so within one tick it always
	 * reports **one** kind of round trip. It used to be the median of both mixed together, which was
	 * a bug: the mixing ratio changed as streams came and went, so the value moved for reasons that
	 * had nothing to do with the network.
	 */
	public currentRttInMs?: number;

	/**
	 * RTT measured by ICE/STUN consent checks, in ms — the trip to **whatever terminates ICE**. In an
	 * SFU topology that is the SFU, so this is the client↔SFU leg, not client↔client.
	 */
	public iceRttInMs?: number;

	/**
	 * RTT reported by RTCP receiver reports, in ms — an **end-to-end** media-path round trip.
	 *
	 * Not the same trip as {@link iceRttInMs}; the difference between the two is roughly the far side
	 * of the SFU (see {@link sfuHopRttInMs}).
	 */
	public rtcpRttInMs?: number;

	/**
	 * `rtcpRttInMs - iceRttInMs`, when both are known — an estimate of everything *past* the SFU.
	 *
	 * Useful for splitting "this client's own last mile is slow" (high `iceRttInMs`) from "the path
	 * beyond the SFU is slow" (low ICE, high hop).
	 */
	public sfuHopRttInMs?: number;
	public currentJitter?: number;

	public usingTCP = false;
	public usingTURN = false;

	public observedTurnServer?: ObservedTurnServer;
	public readonly observedCertificates = new Map<string, ObservedCertificate>();
	public readonly observedCodecs = new Map<string, ObservedCodec>();
	public readonly observedDataChannels = new Map<string, ObservedDataChannel>();
	public readonly observedIceCandidates = new Map<string, ObservedIceCandidate>();
	public readonly observedIceCandidatesPair = new Map<string, ObservedIceCandidatePair>();
	public readonly observedIceTransports = new Map<string, ObservedIceTransport>();
	public readonly observedInboundRtps = new Map<number, ObservedInboundRtp>();
	public readonly observedInboundTracks = new Map<string, ObservedInboundTrack>();
	public readonly observedMediaPlayouts = new Map<string, ObservedMediaPlayout>();
	public readonly observedMediaSources = new Map<string, ObservedMediaSource>();
	public readonly observedOutboundRtps = new Map<number, ObservedOutboundRtp>();
	public readonly observedOutboundTracks = new Map<string, ObservedOutboundTrack>();
	public readonly observedPeerConnectionTransports = new Map<string, ObservedPeerConnectionTransport>();
	public readonly observedRemoteInboundRtps = new Map<number, ObservedRemoteInboundRtp>();
	public readonly observedRemoteOutboundRtps = new Map<number, ObservedRemoteOutboundRtp>();

	private readonly eventScope: ObservedPeerConnectionScope;

	public constructor(public readonly peerConnectionId: string, public readonly client: ObservedClient) {
		super();
		this.setMaxListeners(Infinity);
		this.eventScope = {
			observer: client.call.observer,
			observedCall: client.call,
			observedClient: client,
			observedPeerConnection: this,
		};
	}

	public get score() {
		return this.calculatedScore.value;
	}

	public get visited() {
		const visited = this._visited;

		this._visited = false;

		return visited;
	}

	public get codecs() {
		return [ ...this.observedCodecs.values() ];
	}

	public get inboundRtps() {
		return [ ...this.observedInboundRtps.values() ];
	}

	public get remoteOutboundRtps() {
		return [ ...this.observedRemoteOutboundRtps.values() ];
	}

	public get outboundRtps() {
		return [ ...this.observedOutboundRtps.values() ];
	}

	public get remoteInboundRtps() {
		return [ ...this.observedRemoteInboundRtps.values() ];
	}

	public get mediaSources() {
		return [ ...this.observedMediaSources.values() ];
	}

	public get mediaPlayouts() {
		return [ ...this.observedMediaPlayouts.values() ];
	}

	public get dataChannels() {
		return [ ...this.observedDataChannels.values() ];
	}

	public get peerConnectionTransports() {
		return [ ...this.observedPeerConnectionTransports.values() ];
	}

	public get iceTransports() {
		return [ ...this.observedIceTransports.values() ];
	}

	public get iceCandidates() {
		return [ ...this.observedIceCandidates.values() ];
	}

	public get iceCandidatePairs() {
		return [ ...this.observedIceCandidatesPair.values() ];
	}

	public get certificates() {
		return [ ...this.observedCertificates.values() ];
	}

	public get selectedIceCandidatePairs() {
		return this.iceTransports.map((iceTransport) => iceTransport.getSelectedCandidatePair())
			.filter((pair) => pair !== undefined) as ObservedIceCandidatePair[];
	}

	public get selectedIceCandiadtePairForTurn() {
		// The ICE server `url` is only exposed on *local* candidates (it identifies the server
		// the candidate was obtained from); remote candidates never carry it. `turn` also
		// matches `turns:` (TURN over TLS).
		return this.selectedIceCandidatePairs
			.filter((pair) => {
				const localCandidate = pair.getLocalCandidate();

				return localCandidate?.candidateType === 'relay' && localCandidate?.url?.startsWith('turn') === true;
			});
	}

	public close() {
		if (this.closed) return;
		this.closed = true;

		this.observedCertificates.forEach((observedCertificate) => this._notify('certificate-removed', { ...this.eventScope, observedCertificate }));
		this.observedCodecs.forEach((observedCodec) => this._notify('codec-removed', { ...this.eventScope, observedCodec }));
		this.observedDataChannels.forEach((observedDataChannel) => this._notify('data-channel-removed', { ...this.eventScope, observedDataChannel }));
		this.observedIceCandidates.forEach((observedIceCandidate) => this._notify('ice-candidate-removed', { ...this.eventScope, observedIceCandidate }));
		this.observedIceCandidatesPair.forEach((pair) => this._notify('ice-candidate-pair-removed', { ...this.eventScope, observedIceCandidatePair: pair }));
		this.observedIceTransports.forEach((transport) => this._notify('ice-transport-removed', { ...this.eventScope, observedIceTransport: transport }));
		this.observedInboundRtps.forEach((rtp) => this._notify('inbound-rtp-removed', { ...this.eventScope, observedInboundRtp: rtp }));
		this.observedInboundTracks.forEach((track) => { this.emit('removed-inbound-track', track); this._notify('inbound-track-removed', { ...this.eventScope, observedInboundTrack: track }); });
		this.observedMediaPlayouts.forEach((playout) => this._notify('media-playout-removed', { ...this.eventScope, observedMediaPlayout: playout }));
		this.observedMediaSources.forEach((source) => this._notify('media-source-removed', { ...this.eventScope, observedMediaSource: source }));
		this.observedOutboundRtps.forEach((rtp) => this._notify('outbound-rtp-removed', { ...this.eventScope, observedOutboundRtp: rtp }));
		this.observedOutboundTracks.forEach((track) => { this.emit('removed-outbound-track', track); this._notify('outbound-track-removed', { ...this.eventScope, observedOutboundTrack: track }); });
		this.observedPeerConnectionTransports.forEach((transport) => this._notify('peer-connection-transport-removed', { ...this.eventScope, observedPeerConnectionTransport: transport }));
		this.observedRemoteInboundRtps.forEach((rtp) => this._notify('remote-inbound-rtp-removed', { ...this.eventScope, observedRemoteInboundRtp: rtp }));
		this.observedRemoteOutboundRtps.forEach((rtp) => this._notify('remote-outbound-rtp-removed', { ...this.eventScope, observedRemoteOutboundRtp: rtp }));

		this.observedCertificates.clear();
		this.observedCodecs.clear();
		this.observedDataChannels.clear();
		this.observedIceCandidates.clear();
		this.observedIceCandidatesPair.clear();
		this.observedIceTransports.clear();
		this.observedInboundRtps.clear();
		this.observedInboundTracks.clear();
		this.observedMediaPlayouts.clear();
		this.observedMediaSources.clear();
		this.observedOutboundRtps.clear();
		this.observedOutboundTracks.clear();
		this.observedPeerConnectionTransports.clear();
		this.observedRemoteInboundRtps.clear();
		this.observedRemoteOutboundRtps.clear();

		this.client.call.observer.observedTURN.removePeerConnection(this);

		if (!this.closedAt) this.closedAt = Date.now();

		this.emit('close');
		this._notify('peer-connection-closed', { ...this.eventScope });
	}

	public accept(sample: PeerConnectionSample, context?: AcceptContext) {
		if (this.closed) return;
		this._visited = true;

		if (context) this.appData = { ...this.appData, ...context };

		this.availableIncomingBitrate = 0;
		this.availableOutgoingBitrate = 0;
		this.deltaInboundPacketsLost = 0;
		this.deltaInboundPacketsReceived = 0;
		this.deltaOutboundPacketsSent = 0;
		this.deltaDataChannelBytesSent = 0;
		this.deltaDataChannelBytesReceived = 0;
		this.deltaInboundReceivedBytes = 0;
		this.deltaOutboundSentBytes = 0;
		this.deltaReceivedAudioBytes = 0;
		this.deltaReceivedVideoBytes = 0;
		this.deltaReceivedAudioPackets = 0;
		this.deltaReceivedVideoPackets = 0;
		this.deltaSentAudioBytes = 0;
		this.deltaSentVideoBytes = 0;
		this.deltaSentAudioPackets = 0;
		this.deltaSentVideoPackets = 0;
		this.deltaTransportReceivedBytes = 0;
		this.deltaTransportSentBytes = 0;

		this.sendingAudioBitrate = 0;
		this.sendingVideoBitrate = 0;
		this.receivingAudioBitrate = 0;
		this.receivingVideoBitrate = 0;

		const now = Date.now();
		const elapsedTimeInMs = now - this.updated;
		const elapsedTimeInSec = elapsedTimeInMs / 1000;
		// Kept in two buckets: ICE/STUN and RTCP measure different round trips and must not be blended.
		const iceRttMeasurementsInSec: number[] = [];
		const rtcpRttMeasurementsInSec: number[] = [];
		const jitterMeasurements: number[] = [];

		if (sample.certificates) {
			for (const certificate of sample.certificates) {
				this._updateCertificateStats(certificate);
			}
		}
		if (sample.codecs) {
			for (const codec of sample.codecs) {
				this._updateCodecStats(codec);
			}
		}
		if (sample.dataChannels) {
			for (const dataChannel of sample.dataChannels) {
				const observedDataChannel = this._updateDataChannelStats(dataChannel);

				if (!observedDataChannel) continue;

				this.deltaDataChannelBytesSent += observedDataChannel.deltaBytesSent;
				this.deltaDataChannelBytesReceived += observedDataChannel.deltaBytesReceived;
				this.deltaDataChannelMessagesSent += observedDataChannel.deltaMessagesSent;
				this.deltaDataChannelMessagesReceived += observedDataChannel.deltaMessagesReceived;
			}
		}
		if (sample.iceCandidates) {
			for (const iceCandidate of sample.iceCandidates) {
				this._updateIceCandidateStats(iceCandidate);
			}
		}
		if (sample.iceCandidatePairs) {
			for (const iceCandidatePair of sample.iceCandidatePairs) {
				const observedCandidatePair = this._updateIceCandidatePairStats(iceCandidatePair);

				if (!observedCandidatePair) continue;

				if (observedCandidatePair.currentRoundTripTime) {
					// ICE/STUN round trip — terminates at the SFU, kept apart from the RTCP one.
					iceRttMeasurementsInSec.push(observedCandidatePair.currentRoundTripTime);
				}
				if (observedCandidatePair.availableIncomingBitrate) {
					this.availableIncomingBitrate += observedCandidatePair.availableIncomingBitrate;
				}
				if (observedCandidatePair.availableOutgoingBitrate) {
					this.availableOutgoingBitrate += observedCandidatePair.availableOutgoingBitrate;
				}
			}
		}
		if (sample.iceTransports) {
			for (const iceTransport of sample.iceTransports) {
				const observedIceTransport = this._updateIceTransportStats(iceTransport);

				if (!observedIceTransport) continue;
			}
		}
		if (sample.inboundRtps) {
			for (const inboundRtp of sample.inboundRtps) {
				const observedInboundRtp = this._updateInboundRtpStats(inboundRtp);

				if (!observedInboundRtp) continue;

				this.deltaInboundPacketsLost += observedInboundRtp.deltaLostPackets;
				this.deltaInboundPacketsReceived += observedInboundRtp.deltaReceivedPackets;
				this.deltaInboundReceivedBytes += observedInboundRtp.deltaBytesReceived;

				switch (inboundRtp.kind) {
					case 'audio':
						this.deltaReceivedAudioBytes += observedInboundRtp.deltaBytesReceived;
						this.deltaReceivedAudioPackets += observedInboundRtp.deltaReceivedPackets;
						break;
					case 'video':
						this.deltaReceivedVideoBytes += observedInboundRtp.deltaBytesReceived;
						this.deltaReceivedVideoPackets += observedInboundRtp.deltaReceivedPackets;
						break;
				}

				if (observedInboundRtp.jitter) {
					jitterMeasurements.push(observedInboundRtp.jitter);
				}
			}
		}
		if (sample.mediaPlayouts) {
			for (const mediaPlayout of sample.mediaPlayouts) {
				this._updateMediaPlayoutStats(mediaPlayout);
			}
		}
		if (sample.mediaSources) {
			for (const mediaSource of sample.mediaSources) {
				this._updateMediaSourceStats(mediaSource);
			}
		}
		if (sample.outboundRtps) {
			for (const outboundRtp of sample.outboundRtps) {
				const observedOutboundRtp = this._updateOutboundRtpStats(outboundRtp);

				if (!observedOutboundRtp) continue;

				this.deltaOutboundPacketsSent += observedOutboundRtp.deltaPacketsSent ?? 0;
				this.deltaOutboundSentBytes += observedOutboundRtp.deltaBytesSent ?? 0;

				switch (outboundRtp.kind) {
					case 'audio':
						this.deltaSentAudioBytes += observedOutboundRtp.deltaBytesSent;
						this.deltaSentAudioPackets += observedOutboundRtp.deltaPacketsSent;
						break;
					case 'video':
						this.deltaSentVideoBytes += observedOutboundRtp.deltaBytesSent;
						this.deltaSentVideoPackets += observedOutboundRtp.deltaPacketsSent;
						break;
				}

			}
		}
		if (sample.peerConnectionTransports) {
			for (const peerConnectionTransport of sample.peerConnectionTransports) {
				const observedTransport = this._updatePeerConnectionTransportStats(peerConnectionTransport);

				if (!observedTransport) continue;

			}
		}
		if (sample.remoteInboundRtps) {
			for (const remoteInboundRtp of sample.remoteInboundRtps) {
				const observedRemoteInboundRtp = this._updateRemoteInboundRtpStats(remoteInboundRtp);

				if (!observedRemoteInboundRtp) continue;

				if (observedRemoteInboundRtp.roundTripTime) {
					// RTCP round trip — end to end over the media path.
					rtcpRttMeasurementsInSec.push(observedRemoteInboundRtp.roundTripTime);
				}

				// Surface receiver-report-derived metrics on the corresponding local outbound-rtp.
				const observedOutboundRtp = observedRemoteInboundRtp.getOutboundRtp();

				if (observedOutboundRtp) {
					if (observedRemoteInboundRtp.roundTripTime !== undefined) {
						observedOutboundRtp.remoteRttInMs = observedRemoteInboundRtp.roundTripTime * 1000;
					}
					if (observedRemoteInboundRtp.fractionLost !== undefined) {
						observedOutboundRtp.remoteFractionLost = observedRemoteInboundRtp.fractionLost;
					}
					if (observedRemoteInboundRtp.jitter !== undefined) {
						observedOutboundRtp.remoteJitter = observedRemoteInboundRtp.jitter;
					}
					if (observedRemoteInboundRtp.packetsLost !== undefined) {
						observedOutboundRtp.remotePacketsLost = observedRemoteInboundRtp.packetsLost;
					}
				}
			}
		}
		if (sample.remoteOutboundRtps) {
			for (const remoteOutboundRtp of sample.remoteOutboundRtps) {
				const observedRemoteOutboundRtp = this._updateRemoteOutboundRtpStats(remoteOutboundRtp);

				if (!observedRemoteOutboundRtp) continue;

				// Surface sender-report-derived metrics on the corresponding local inbound-rtp.
				const observedInboundRtp = observedRemoteOutboundRtp.getInboundRtp();

				if (observedInboundRtp) {
					if (observedRemoteOutboundRtp.roundTripTime !== undefined) {
						observedInboundRtp.remoteRttInMs = observedRemoteOutboundRtp.roundTripTime * 1000;
					}
					if (observedRemoteOutboundRtp.bytesSent !== undefined) {
						observedInboundRtp.remoteBytesSent = observedRemoteOutboundRtp.bytesSent;
					}
					if (observedRemoteOutboundRtp.packetsSent !== undefined) {
						observedInboundRtp.remotePacketsSent = observedRemoteOutboundRtp.packetsSent;
					}
					if (observedRemoteOutboundRtp.remoteTimestamp !== undefined) {
						observedInboundRtp.remoteTimestamp = observedRemoteOutboundRtp.remoteTimestamp;
					}
				}
			}
		}

		// tracks should be updated last as they are derived stats
		// and depends on base stats but they all received in the sample sample
		if (sample.inboundTracks) {
			for (const inboundTrack of sample.inboundTracks) {
				this._updateInboundTrackSample(inboundTrack);
			}
		}
		if (sample.outboundTracks) {
			for (const outboundTrack of sample.outboundTracks) {
				this._updateOutboundTrackSample(outboundTrack);
			}
		}

		this.totalInboundPacketsLost += this.deltaInboundPacketsLost;
		this.totalInboundPacketsReceived += this.deltaInboundPacketsReceived;
		this.totalOutboundPacketsSent += this.deltaOutboundPacketsSent;
		this.totalDataChannelBytesSent += this.deltaDataChannelBytesSent;
		this.totalDataChannelBytesReceived += this.deltaDataChannelBytesReceived;
		this.totalDataChannelMessagesSent += this.deltaDataChannelMessagesSent;
		this.totalDataChannelMessagesReceived += this.deltaDataChannelMessagesReceived;
		this.totalReceivedAudioBytes += this.deltaReceivedAudioBytes;
		this.totalReceivedVideoBytes += this.deltaReceivedVideoBytes;
		this.totalSentAudioBytes += this.deltaSentAudioBytes;
		this.totalSentVideoBytes += this.deltaSentVideoBytes;
		this.totalReceivedAudioPacktes += this.deltaReceivedAudioPackets;
		this.totalReceivedVideoPackets += this.deltaReceivedVideoPackets;
		this.totalSentAudioPackets += this.deltaSentAudioPackets;
		this.totalSentVideoPackets += this.deltaSentVideoPackets;

		this.receivingPacketsPerSecond = this.deltaInboundPacketsReceived / elapsedTimeInSec;
		this.sendingPacketsPerSecond = this.deltaOutboundPacketsSent / elapsedTimeInSec;
		this.sendingAudioBitrate = (this.deltaSentAudioBytes * 8) / elapsedTimeInSec;
		this.sendingVideoBitrate = (this.deltaSentVideoBytes * 8) / elapsedTimeInSec;
		this.receivingAudioBitrate = (this.deltaReceivedAudioBytes * 8) / elapsedTimeInSec;
		this.receivingVideoBitrate = (this.deltaReceivedVideoBytes * 8) / elapsedTimeInSec;

		this.iceRttInMs = 0 < iceRttMeasurementsInSec.length
			? percentileOfSorted(iceRttMeasurementsInSec.sort(ascending), 0.5) * 1000
			: undefined;
		this.rtcpRttInMs = 0 < rtcpRttMeasurementsInSec.length
			? percentileOfSorted(rtcpRttMeasurementsInSec.sort(ascending), 0.5) * 1000
			: undefined;

		// Prefer the end-to-end (RTCP) trip, fall back to ICE — never a blend of the two.
		this.currentRttInMs = this.rtcpRttInMs ?? this.iceRttInMs;
		this.sfuHopRttInMs = this.rtcpRttInMs !== undefined && this.iceRttInMs !== undefined
			? Math.max(0, this.rtcpRttInMs - this.iceRttInMs)
			: undefined;
		if (jitterMeasurements.length > 0) {
			this.currentJitter = percentileOfSorted(jitterMeasurements.sort(ascending), 0.5);
		} else {
			this.currentJitter = undefined;
		}
		const wasUsingTURN = this.usingTURN;
		const selectedIceCandidatePairs = this.selectedIceCandidatePairs;
		const selectedCandidatePairForTurn: ObservedIceCandidatePair[] = [];

		this.usingTCP = false;
		this.usingTURN = false;

		for (const selectedCandidatePair of selectedIceCandidatePairs) {
			const localCandidate = selectedCandidatePair.getLocalCandidate();

			if (localCandidate?.protocol === 'tcp') {
				this.usingTCP = true;
			}
			// relay candidates are only obtained from TURN servers, so the local candidate's
			// type alone establishes TURN usage. The server `url` is only exposed on *local*
			// candidates (and not by every browser) — it is required only to attribute the
			// traffic to a concrete TURN server.
			if (localCandidate?.candidateType === 'relay') {
				this.usingTURN = true;
				if (localCandidate.url?.startsWith('turn')) {
					selectedCandidatePairForTurn.push(selectedCandidatePair);
				}
			}
			this.deltaTransportReceivedBytes += selectedCandidatePair.deltaBytesReceived;
			this.deltaTransportSentBytes += selectedCandidatePair.deltaBytesSent;
		}

		if (this.usingTURN) {
			if (!this.observedTurnServer) {
				this.observedTurnServer = this.client.call.observer.observedTURN.addPeerConnection(this);
			}
			this.observedTurnServer?.updateTurnUsage(...selectedCandidatePairForTurn);
		} else if (wasUsingTURN) {
			if (!this.usingTURN) {
				this.client.call.observer.observedTURN.removePeerConnection(this);
			}
		}
		this.calculatedScore.value = sample.score;
		this.updated = now;
		this._checkVisited();

		this._notify('peer-connection-updated', { ...this.eventScope, context });
	}

	private _checkVisited() {
		for (const certificate of [ ...this.observedCertificates.values() ]) {
			if (certificate.visited) continue;

			this.observedCertificates.delete(certificate.id);
		}
		for (const observedCodec of [ ...this.observedCodecs.values() ]) {
			if (observedCodec.visited) continue;

			this.observedCodecs.delete(observedCodec.id);
			this._notify('codec-removed', { ...this.eventScope, observedCodec });
		}
		for (const observedDataChannel of [ ...this.observedDataChannels.values() ]) {
			if (observedDataChannel.visited) continue;

			this.observedDataChannels.delete(observedDataChannel.id);
			this._notify('data-channel-removed', { ...this.eventScope, observedDataChannel });
		}
		for (const observedIceCandidate of [ ...this.observedIceCandidates.values() ]) {
			if (observedIceCandidate.visited) continue;

			this.observedIceCandidates.delete(observedIceCandidate.id);
			this._notify('ice-candidate-removed', { ...this.eventScope, observedIceCandidate });
		}
		for (const observedIceCandidatePair of [ ...this.observedIceCandidatesPair.values() ]) {
			if (observedIceCandidatePair.visited) continue;

			this.observedIceCandidatesPair.delete(observedIceCandidatePair.id);
			this._notify('ice-candidate-pair-removed', { ...this.eventScope, observedIceCandidatePair });
		}
		for (const observedIceTransport of [ ...this.observedIceTransports.values() ]) {
			if (observedIceTransport.visited) continue;

			this.observedIceTransports.delete(observedIceTransport.id);
			this._notify('ice-transport-removed', { ...this.eventScope, observedIceTransport });
		}
		for (const observedInboundRtp of [ ...this.observedInboundRtps.values() ]) {
			if (observedInboundRtp.visited) continue;

			this.observedInboundRtps.delete(observedInboundRtp.ssrc);
			this._notify('inbound-rtp-removed', { ...this.eventScope, observedInboundRtp });
		}
		for (const observedInboundTrack of [ ...this.observedInboundTracks.values() ]) {
			if (observedInboundTrack.visited) continue;

			this.observedInboundTracks.delete(observedInboundTrack.id);
			this.emit('removed-inbound-track', observedInboundTrack);
			this._notify('inbound-track-removed', { ...this.eventScope, observedInboundTrack });
		}
		for (const observedMediaPlayout of [ ...this.observedMediaPlayouts.values() ]) {
			if (observedMediaPlayout.visited) continue;

			this.observedMediaPlayouts.delete(observedMediaPlayout.id);
			this._notify('media-playout-removed', { ...this.eventScope, observedMediaPlayout });
		}
		for (const observedMediaSource of [ ...this.observedMediaSources.values() ]) {
			if (observedMediaSource.visited) continue;

			this.observedMediaSources.delete(observedMediaSource.id);
			this._notify('media-source-removed', { ...this.eventScope, observedMediaSource });
		}
		for (const observedOutboundRtp of [ ...this.observedOutboundRtps.values() ]) {
			if (observedOutboundRtp.visited) continue;

			this.observedOutboundRtps.delete(observedOutboundRtp.ssrc);
			this._notify('outbound-rtp-removed', { ...this.eventScope, observedOutboundRtp });
		}
		for (const observedOutboundTrack of [ ...this.observedOutboundTracks.values() ]) {
			if (observedOutboundTrack.visited) continue;

			this.observedOutboundTracks.delete(observedOutboundTrack.id);
			this.emit('removed-outbound-track', observedOutboundTrack);
			this._notify('outbound-track-removed', { ...this.eventScope, observedOutboundTrack });
		}
		for (const observedPeerConnectionTransport of [ ...this.observedPeerConnectionTransports.values() ]) {
			if (observedPeerConnectionTransport.visited) continue;

			this.observedPeerConnectionTransports.delete(observedPeerConnectionTransport.id);
			this._notify('peer-connection-transport-removed', { ...this.eventScope, observedPeerConnectionTransport });
		}
		for (const observedRemoteInboundRtp of [ ...this.observedRemoteInboundRtps.values() ]) {
			if (observedRemoteInboundRtp.visited) continue;

			this.observedRemoteInboundRtps.delete(observedRemoteInboundRtp.ssrc);
			this._notify('remote-inbound-rtp-removed', { ...this.eventScope, observedRemoteInboundRtp });
		}
		for (const observedRemoteOutboundRtp of [ ...this.observedRemoteOutboundRtps.values() ]) {
			if (observedRemoteOutboundRtp.visited) continue;

			this.observedRemoteOutboundRtps.delete(observedRemoteOutboundRtp.ssrc);
			this._notify('remote-outbound-rtp-removed', { ...this.eventScope, observedRemoteOutboundRtp });
		}
	}

	private _updateCertificateStats(stats: CertificateStats) {
		let observedCertificate = this.observedCertificates.get(stats.id);

		if (!observedCertificate) {
			if (!stats.timestamp || !stats.id || !stats.fingerprint) {
				return logger.warn(
					`ObservedPeerConnection received an invalid CertificateStats (missing timestamp OR id OR fingerprint field). PeerConnectionId: ${this.peerConnectionId} ClientId: ${this.client.clientId}, CallId: ${this.client.call.callId}`,
					stats
				);
			}

			observedCertificate = new ObservedCertificate(stats.timestamp, stats.id, this);

			observedCertificate.update(stats);

			this.observedCertificates.set(stats.id, observedCertificate);
			this._notify('certificate-added', { ...this.eventScope, observedCertificate });
		} else {
			observedCertificate.update(stats);
			this._notify('certificate-updated', { ...this.eventScope, observedCertificate });
		}

		return observedCertificate;
	}

	private _updateCodecStats(stats: CodecStats) {
		let observedCodec = this.observedCodecs.get(stats.id);

		if (!observedCodec) {
			if (!stats.timestamp || !stats.id || !stats.mimeType) {
				return logger.warn(
					`ObservedPeerConnection received an invalid CodecStats (missing timestamp OR id OR mimeType field). PeerConnectionId: ${this.peerConnectionId} ClientId: ${this.client.clientId}, CallId: ${this.client.call.callId}`,
					stats
				);
			}

			observedCodec = new ObservedCodec(stats.timestamp, stats.id, stats.mimeType, this);

			observedCodec.update(stats);

			this.observedCodecs.set(stats.id, observedCodec);
			this._notify('codec-added', { ...this.eventScope, observedCodec });
		} else {
			observedCodec.update(stats);
		}
		this._notify('codec-updated', { ...this.eventScope, observedCodec });

		return observedCodec;
	}

	private _updateDataChannelStats(stats: DataChannelStats) {
		let observedDataChannel = this.observedDataChannels.get(stats.id);

		if (!observedDataChannel) {
			if (!stats.timestamp || !stats.id) {
				return logger.warn(
					`ObservedPeerConnection received an invalid DataChannelStats (missing timestamp OR id field). PeerConnectionId: ${this.peerConnectionId} ClientId: ${this.client.clientId}, CallId: ${this.client.call.callId}`,
					stats
				);
			}

			observedDataChannel = new ObservedDataChannel(stats.timestamp, stats.id, this);

			observedDataChannel.update(stats);

			this.observedDataChannels.set(stats.id, observedDataChannel);
			this._notify('data-channel-added', { ...this.eventScope, observedDataChannel });
		} else {
			observedDataChannel.update(stats);
		}
		this._notify('data-channel-updated', { ...this.eventScope, observedDataChannel });

		return observedDataChannel;
	}

	private _updateIceCandidateStats(stats: IceCandidateStats) {
		let observedIceCandidate = this.observedIceCandidates.get(stats.id);

		if (!observedIceCandidate) {
			if (!stats.timestamp || !stats.id) {
				return logger.warn(
					`ObservedPeerConnection received an invalid IceCandidateStats (missing timestamp OR id field). PeerConnectionId: ${this.peerConnectionId} ClientId: ${this.client.clientId}, CallId: ${this.client.call.callId}`,
					stats
				);
			}

			observedIceCandidate = new ObservedIceCandidate(stats.timestamp, stats.id, this);

			observedIceCandidate.update(stats);

			this.observedIceCandidates.set(stats.id, observedIceCandidate);
			this._notify('ice-candidate-added', { ...this.eventScope, observedIceCandidate });
		} else {
			observedIceCandidate.update(stats);
		}
		this._notify('ice-candidate-updated', { ...this.eventScope, observedIceCandidate });

		return observedIceCandidate;
	}

	private _updateIceCandidatePairStats(stats: IceCandidateStats) {
		let observedIceCandidatePair = this.observedIceCandidatesPair.get(stats.id);

		if (!observedIceCandidatePair) {
			if (!stats.timestamp || !stats.id) {
				return logger.warn(
					`ObservedPeerConnection received an invalid IceCandidateStats (missing timestamp OR id field). PeerConnectionId: ${this.peerConnectionId} ClientId: ${this.client.clientId}, CallId: ${this.client.call.callId}`,
					stats
				);
			}

			observedIceCandidatePair = new ObservedIceCandidatePair(stats.timestamp, stats.id, this);

			observedIceCandidatePair.update(stats);

			this.observedIceCandidatesPair.set(stats.id, observedIceCandidatePair);
			this._notify('ice-candidate-pair-added', { ...this.eventScope, observedIceCandidatePair });
		} else {
			observedIceCandidatePair.update(stats);
		}
		this._notify('ice-candidate-pair-updated', { ...this.eventScope, observedIceCandidatePair });

		return observedIceCandidatePair;
	}

	private _updateIceTransportStats(stats: IceCandidateStats) {
		let observedIceTransport = this.observedIceTransports.get(stats.id);

		if (!observedIceTransport) {
			if (!stats.timestamp || !stats.id) {
				return logger.warn(
					`ObservedPeerConnection received an invalid IceCandidateStats (missing timestamp OR id field). PeerConnectionId: ${this.peerConnectionId} ClientId: ${this.client.clientId}, CallId: ${this.client.call.callId}`,
					stats
				);
			}

			observedIceTransport = new ObservedIceTransport(stats.timestamp, stats.id, this);

			observedIceTransport.update(stats);

			this.observedIceTransports.set(stats.id, observedIceTransport);
			this._notify('ice-transport-added', { ...this.eventScope, observedIceTransport });
		} else {
			observedIceTransport.update(stats);
		}
		this._notify('ice-transport-updated', { ...this.eventScope, observedIceTransport });

		return observedIceTransport;
	}

	private _updateInboundRtpStats(stats: InboundRtpStats) {
		let observedInboundRtp = this.observedInboundRtps.get(stats.ssrc);

		if (!observedInboundRtp) {
			if (!stats.timestamp || !stats.id || !stats.ssrc || !stats.kind || !stats.trackIdentifier) {
				return logger.warn(
					`ObservedPeerConnection received an invalid InboundRtpStats (missing timestamp OR id OR ssrc OR kind OR trackIdentifier field). PeerConnectionId: ${this.peerConnectionId} ClientId: ${this.client.clientId}, CallId: ${this.client.call.callId}`,
					stats
				);
			}

			observedInboundRtp = new ObservedInboundRtp(
				stats.timestamp,
				stats.id,
				stats.ssrc,
				stats.kind as MediaKind,
				stats.trackIdentifier,
				this
			);

			observedInboundRtp.update(stats);

			this.observedInboundRtps.set(stats.ssrc, observedInboundRtp);
			this._notify('inbound-rtp-added', { ...this.eventScope, observedInboundRtp });
		} else {
			observedInboundRtp.update(stats);
		}
		this._notify('inbound-rtp-updated', { ...this.eventScope, observedInboundRtp });

		return observedInboundRtp;
	}

	private _updateInboundTrackSample(stats: InboundTrackSample) {
		let observedInboundTrack = this.observedInboundTracks.get(stats.id);

		if (!observedInboundTrack) {
			if (!stats.timestamp || !stats.id || !stats.kind) {
				return logger.warn(
					`ObservedPeerConnection received an invalid InboundTrackSample (missing timestamp OR id OR kind field). PeerConnectionId: ${this.peerConnectionId} ClientId: ${this.client.clientId}, CallId: ${this.client.call.callId}`,
					stats
				);
			}

			const inboundRtp = [ ...this.observedInboundRtps.values() ].find((inbRtp) => inbRtp.trackIdentifier === stats.id);
			const mediaPlayout = inboundRtp ?
				[ ...this.observedMediaPlayouts.values() ].find((mp) => mp.id === inboundRtp.playoutId) : undefined;

			observedInboundTrack = new ObservedInboundTrack(
				stats.timestamp,
				stats.id,
				stats.kind as MediaKind,
				this,
				inboundRtp,
				mediaPlayout,
			);

			observedInboundTrack.update(stats);

			this.observedInboundTracks.set(stats.id, observedInboundTrack);
			this._notify('inbound-track-added', { ...this.eventScope, observedInboundTrack });
		} else {
			observedInboundTrack.update(stats);
		}
		this._notify('inbound-track-updated', { ...this.eventScope, observedInboundTrack });

		return observedInboundTrack;
	}

	private _updateMediaPlayoutStats(stats: MediaPlayoutStats) {
		let observedMediaPlayout = this.observedMediaPlayouts.get(stats.id);

		if (!observedMediaPlayout) {
			if (!stats.timestamp || !stats.id || !stats.kind) {
				return logger.warn(
					`ObservedPeerConnection received an invalid InboundRtpStats (missing timestamp OR id OR kind OR trackIdentifier field). PeerConnectionId: ${this.peerConnectionId} ClientId: ${this.client.clientId}, CallId: ${this.client.call.callId}`,
					stats
				);
			}

			observedMediaPlayout = new ObservedMediaPlayout(
				stats.timestamp,
				stats.id,
				stats.kind as MediaKind,
				this
			);

			observedMediaPlayout.update(stats);

			this.observedMediaPlayouts.set(stats.id, observedMediaPlayout);
			this._notify('media-playout-added', { ...this.eventScope, observedMediaPlayout });
		} else {
			observedMediaPlayout.update(stats);
		}
		this._notify('media-playout-updated', { ...this.eventScope, observedMediaPlayout });

		return observedMediaPlayout;
	}

	private _updateMediaSourceStats(stats: MediaSourceStats) {
		let observedMediaSource = this.observedMediaSources.get(stats.id);

		if (!observedMediaSource) {
			if (!stats.timestamp || !stats.id || !stats.kind) {
				return logger.warn(
					`ObservedPeerConnection received an invalid InboundRtpStats (missing timestamp OR id OR kind field). PeerConnectionId: ${this.peerConnectionId} ClientId: ${this.client.clientId}, CallId: ${this.client.call.callId}`,
					stats
				);
			}

			observedMediaSource = new ObservedMediaSource(
				stats.timestamp,
				stats.id,
				stats.kind as MediaKind,
				this
			);

			observedMediaSource.update(stats);

			this.observedMediaSources.set(stats.id, observedMediaSource);
			this._notify('media-source-added', { ...this.eventScope, observedMediaSource });
		} else {
			observedMediaSource.update(stats);
		}
		this._notify('media-source-updated', { ...this.eventScope, observedMediaSource });

		return observedMediaSource;
	}

	private _updateOutboundRtpStats(stats: OutboundRtpStats) {
		let observedOutboundRtp = this.observedOutboundRtps.get(stats.ssrc);

		if (!observedOutboundRtp) {
			if (!stats.timestamp || !stats.id || !stats.ssrc || !stats.kind) {
				return logger.warn(
					`ObservedPeerConnection received an invalid OutboundRtpStats (missing timestamp OR id OR ssrc OR kind field). PeerConnectionId: ${this.peerConnectionId} ClientId: ${this.client.clientId}, CallId: ${this.client.call.callId}`,
					stats
				);
			}

			observedOutboundRtp = new ObservedOutboundRtp(
				stats.timestamp,
				stats.id,
				stats.ssrc,
				stats.kind as MediaKind,
				this
			);

			observedOutboundRtp.update(stats);

			this.observedOutboundRtps.set(stats.ssrc, observedOutboundRtp);
			this._notify('outbound-rtp-added', { ...this.eventScope, observedOutboundRtp });
		} else {
			observedOutboundRtp.update(stats);
		}
		this._notify('outbound-rtp-updated', { ...this.eventScope, observedOutboundRtp });

		return observedOutboundRtp;
	}

	private _updateOutboundTrackSample(stats: OutboundTrackSample) {
		let observedOutboundTrack = this.observedOutboundTracks.get(stats.id);

		if (!observedOutboundTrack) {
			if (!stats.timestamp || !stats.id || !stats.kind) {
				return logger.warn(
					`ObservedPeerConnection received an invalid OutboundTrackSample (missing timestamp OR id OR kind field). PeerConnectionId: ${this.peerConnectionId} ClientId: ${this.client.clientId}, CallId: ${this.client.call.callId}`,
					stats
				);
			}
			const observedMediaSource = [ ...this.observedMediaSources.values() ].find((mediaSource) => mediaSource.trackIdentifier === stats.id);
			const outboundRtps = observedMediaSource
				? [ ...this.observedOutboundRtps.values() ].filter((outboundRtp) => outboundRtp.mediaSourceId === observedMediaSource?.id) : undefined;

			observedOutboundTrack = new ObservedOutboundTrack(
				stats.timestamp,
				stats.id,
				stats.kind as MediaKind,
				this,
				outboundRtps,
				observedMediaSource,
			);

			observedOutboundTrack.update(stats);

			this.observedOutboundTracks.set(stats.id, observedOutboundTrack);
			this._notify('outbound-track-added', { ...this.eventScope, observedOutboundTrack });
		} else {
			observedOutboundTrack.update(stats);
		}
		this._notify('outbound-track-updated', { ...this.eventScope, observedOutboundTrack });

		return observedOutboundTrack;
	}

	private _updatePeerConnectionTransportStats(stats: PeerConnectionTransportStats) {
		let observedPeerConnectionTransport = this.observedPeerConnectionTransports.get(stats.id);

		if (!observedPeerConnectionTransport) {
			if (!stats.timestamp || !stats.id) {
				return logger.warn(
					`ObservedPeerConnection received an invalid PeerConnectionTransportStats (missing timestamp OR id field). PeerConnectionId: ${this.peerConnectionId} ClientId: ${this.client.clientId}, CallId: ${this.client.call.callId}`,
					stats
				);
			}

			observedPeerConnectionTransport = new ObservedPeerConnectionTransport(stats.timestamp, stats.id, this);

			observedPeerConnectionTransport.update(stats);

			this.observedPeerConnectionTransports.set(stats.id, observedPeerConnectionTransport);
			this._notify('peer-connection-transport-added', { ...this.eventScope, observedPeerConnectionTransport });
		} else {
			observedPeerConnectionTransport.update(stats);
		}
		this._notify('peer-connection-transport-updated', { ...this.eventScope, observedPeerConnectionTransport });

		return observedPeerConnectionTransport;
	}

	private _updateRemoteInboundRtpStats(stats: RemoteInboundRtpStats) {
		let observedRemoteInboundRtp = this.observedRemoteInboundRtps.get(stats.ssrc);

		if (!observedRemoteInboundRtp) {
			if (!stats.timestamp || !stats.id || !stats.ssrc || !stats.kind) {
				return logger.warn(
					`ObservedPeerConnection received an invalid RemoteInboundRtpStats (missing timestamp OR id OR ssrc OR kind field). PeerConnectionId: ${this.peerConnectionId} ClientId: ${this.client.clientId}, CallId: ${this.client.call.callId}`,
					stats
				);
			}

			observedRemoteInboundRtp = new ObservedRemoteInboundRtp(
				stats.timestamp,
				stats.id,
				stats.ssrc,
				stats.kind as MediaKind,
				this
			);

			observedRemoteInboundRtp.update(stats);

			this.observedRemoteInboundRtps.set(stats.ssrc, observedRemoteInboundRtp);
			this._notify('remote-inbound-rtp-added', { ...this.eventScope, observedRemoteInboundRtp });
		} else {
			observedRemoteInboundRtp.update(stats);
		}
		this._notify('remote-inbound-rtp-updated', { ...this.eventScope, observedRemoteInboundRtp });

		return observedRemoteInboundRtp;
	}

	private _updateRemoteOutboundRtpStats(stats: RemoteOutboundRtpStats) {
		let observedRemoteOutboundRtp = this.observedRemoteOutboundRtps.get(stats.ssrc);

		if (!observedRemoteOutboundRtp) {
			if (!stats.timestamp || !stats.id || !stats.ssrc || !stats.kind) {
				return logger.warn(
					`ObservedPeerConnection received an invalid RemoteOutboundRtpStats (missing timestamp OR id OR ssrc OR kind field). PeerConnectionId: ${this.peerConnectionId} ClientId: ${this.client.clientId}, CallId: ${this.client.call.callId}`,
					stats
				);
			}

			observedRemoteOutboundRtp = new ObservedRemoteOutboundRtp(
				stats.timestamp,
				stats.id,
				stats.ssrc,
				stats.kind as MediaKind,
				this
			);

			observedRemoteOutboundRtp.update(stats);

			this.observedRemoteOutboundRtps.set(stats.ssrc, observedRemoteOutboundRtp);
			this._notify('remote-outbound-rtp-added', { ...this.eventScope, observedRemoteOutboundRtp });
		} else {
			observedRemoteOutboundRtp.update(stats);
		}
		this._notify('remote-outbound-rtp-updated', { ...this.eventScope, observedRemoteOutboundRtp });

		return observedRemoteOutboundRtp;
	}

	/** Emit an Observer-bus event scoped to this peer connection. */
	private _notify<K extends keyof ObserverEvents>(type: K, ...args: ObserverEvents[K]): void {
		this.client.call.observer.emit(type, ...args);
	}
}
