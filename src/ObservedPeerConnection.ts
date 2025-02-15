import { EventEmitter } from 'events';
import { PeerConnectionTransport } from '@observertc/sample-schemas-js';
import { ObservedClient } from './ObservedClient';
import { CallEventReport, PeerConnectionTransportReport } from '@observertc/report-schemas-js';
import { ObservedICE } from './ObservedICE';
import { ObservedDataChannel } from './ObservedDataChannel';
import { PartialBy } from './common/utils';
import { ObservedInboundAudioTrack, ObservedInboundAudioTrackModel } from './ObservedInboundAudioTrack';
import { ObservedInboundVideoTrack, ObservedInboundVideoTrackModel } from './ObservedInboundVideoTrack';
import { ObservedOutboundAudioTrack, ObservedOutboundAudioTrackModel } from './ObservedOutboundAudioTrack';
import { ObservedOutboundVideoTrack, ObservedOutboundVideoTrackModel } from './ObservedOutboundVideoTrack';
import { CalculatedScore, getRttScore } from './common/CalculatedScore';
import { ClientIssue } from './monitors/CallSummary';

export type ObservedPeerConnectionEvents = {
	update: [{
		elapsedTimeInMs: number;
	}],
	close: [],
	score: [CalculatedScore],
	newinboudaudiotrack: [ObservedInboundAudioTrack],
	newinboudvideotrack: [ObservedInboundVideoTrack],
	newoutboundaudiotrack: [ObservedOutboundAudioTrack],
	newoutboundvideotrack: [ObservedOutboundVideoTrack],
	newdatachannel: [ObservedDataChannel],
};

export type ObservedPeerConnectionModel = {
	peerConnectionId: string;
	label?: string;
};

export type ObservedPeerConnectionStats = Omit<PeerConnectionTransport, 'transportId' | 'label'>;

export declare interface ObservedPeerConnection {
	on<U extends keyof ObservedPeerConnectionEvents>(event: U, listener: (...args: ObservedPeerConnectionEvents[U]) => void): this;
	off<U extends keyof ObservedPeerConnectionEvents>(event: U, listener: (...args: ObservedPeerConnectionEvents[U]) => void): this;
	once<U extends keyof ObservedPeerConnectionEvents>(event: U, listener: (...args: ObservedPeerConnectionEvents[U]) => void): this;
	emit<U extends keyof ObservedPeerConnectionEvents>(event: U, ...args: ObservedPeerConnectionEvents[U]): boolean;
}

export class ObservedPeerConnection extends EventEmitter {
	public readonly created = Date.now();
	public visited = true;

	// timestamp of the PEER_CONNECTION_OPENED event
	public opened?: number;
	// timestamp of the PEER_CONNECTION_CLOSED event
	public closedTimestamp?: number;

	private _elapsedTimeSinceLastUpdate?: number;
	private _statsTimestamp?: number;
	private _stabilityScores: number[] = [];

	public ωpendingIssuesForScores: ClientIssue[] = [];

	public score?: CalculatedScore;
	public totalInboundPacketsLost = 0;
	public totalInboundPacketsReceived = 0;
	public totalOutboundPacketsSent = 0;
	public totalDataChannelBytesSent = 0;
	public totalDataChannelBytesReceived = 0;

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
	public deltaInboundReceivedBytes = 0;
	public deltaOutboundSentBytes = 0;
	
	public deltaReceivedAudioBytes = 0;
	public deltaReceivedVideoBytes = 0;
	public deltaReceivedAudioPackets = 0;
	public deltaReceivedVideoPackets = 0;
	public deltaSentAudioBytes = 0;
	public deltaSentVideoBytes = 0;
	public receivingPacketsPerSecond = 0;
	public sendingPacketsPerSecond = 0;
	public sendingAudioBitrate = 0;
	public sendingVideoBitrate = 0;
	public receivingAudioBitrate = 0;
	public receivingVideoBitrate = 0;
    
	public avgRttInMs?: number;
	public avgJitter?: number;

	private _closed = false;
	private _updated = Date.now();
	private _sample?: ObservedPeerConnectionStats;
	private _marker?: string;

	public readonly ICE = ObservedICE.create(this);
	private readonly _inboundAudioTracks = new Map<string, ObservedInboundAudioTrack>();
	private readonly _inboundVideoTracks = new Map<string, ObservedInboundVideoTrack>();
	private readonly _outboundAudioTracks = new Map<string, ObservedOutboundAudioTrack>();
	private readonly _outboundVideoTracks = new Map<string, ObservedOutboundVideoTrack>();
	private readonly _dataChannels = new Map<number, ObservedDataChannel>();
	
	public constructor(
		private readonly _model: ObservedPeerConnectionModel,
		public readonly client: ObservedClient,
	) {
		super();
		this.setMaxListeners(Infinity);
	}

	public get serviceId() {
		return this.client.serviceId;
	}

	public get roomId() {
		return this.client.roomId;
	}

	public get callId() {
		return this.client.callId;
	}

	public get clientId() {
		return this.client.clientId;
	}

	public get mediaUnitId() {
		return this.client.mediaUnitId;
	}

	public get label() {
		return this._model.label;
	}

	public set label(value: string | undefined) {
		this._model.label = value;
	}

	public get usingTURN() {
		return this.ICE.usingTURN;
	}

	public get availableOutgoingBitrate() {
		return this.ICE.stats?.availableOutgoingBitrate;
	}

	public get availableIncomingBitrate() {
		return this.ICE.stats?.availableIncomingBitrate;
	}

	public get peerConnectionId(): string {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return this._model.peerConnectionId!;
	}

	public get reports() {
		return this.client.reports;
	}

	public get stats(): ObservedPeerConnectionStats | undefined {
		return this._sample;
	}

	public get updated(): number {
		return this._updated;
	}

	public get inboundAudioTracks(): ReadonlyMap<string, ObservedInboundAudioTrack> {
		return this._inboundAudioTracks;
	}

	public get inboundVideoTracks(): ReadonlyMap<string, ObservedInboundVideoTrack> {
		return this._inboundVideoTracks;
	}

	public get outboundAudioTracks(): ReadonlyMap<string, ObservedOutboundAudioTrack> {
		return this._outboundAudioTracks;
	}

	public get outboundVideoTracks(): ReadonlyMap<string, ObservedOutboundVideoTrack> {
		return this._outboundVideoTracks;
	}

	public get dataChannels(): ReadonlyMap<number, ObservedDataChannel> {
		return this._dataChannels;
	}

	public get uptimeInMs() {
		return this._updated - this.created;
	}

	public get marker() {
		return this._marker;
	}

	public set marker(value: string | undefined) {
		this._marker = value;
		this._inboundAudioTracks.forEach((track) => (track.marker = value));
		this._inboundVideoTracks.forEach((track) => (track.marker = value));
		this._outboundAudioTracks.forEach((track) => (track.marker = value));
		this._outboundVideoTracks.forEach((track) => (track.marker = value));
		this._dataChannels.forEach((channel) => (channel.marker = value));
		this.ICE.marker = value;
	}

	public addEventReport(params: PartialBy<Omit<CallEventReport, 'serviceId' | 'roomId' | 'callId' | 'clientId' | 'userId' | 'peerConnectionId' | 'marker'>, 'timestamp'>) {
		this.reports.addCallEventReport({
			...params,
			serviceId: this.serviceId,
			mediaUnitId: this.mediaUnitId,
			roomId: this.roomId,
			callId: this.callId,
			clientId: this.clientId,
			userId: this.client.userId,
			peerConnectionId: this.peerConnectionId,
			marker: this.client.marker,
			timestamp: params.timestamp ?? Date.now(),
		});
	}

	public get closed() {
		return this._closed;
	}

	public close() {
		if (this._closed) return;
		this._closed = true;

		Array.from(this._inboundAudioTracks.values()).forEach((track) => track.close());
		Array.from(this._inboundVideoTracks.values()).forEach((track) => track.close());
		Array.from(this._outboundAudioTracks.values()).forEach((track) => {
			this.client.call.sfuStreamIdToOutboundAudioTrack.delete(track.sfuStreamId ?? '');
			track.close();
		});
		Array.from(this._outboundVideoTracks.values()).forEach((track) => {
			this.client.call.sfuStreamIdToOutboundVideoTrack.delete(track.sfuStreamId ?? '');
			track.close();
		});

		this.emit('close');
	}

	public getTrack(trackId: string): ObservedInboundAudioTrack | ObservedInboundVideoTrack | ObservedOutboundAudioTrack | ObservedOutboundVideoTrack | undefined {
		return this._inboundAudioTracks.get(trackId) ?? this._inboundVideoTracks.get(trackId) ?? this._outboundAudioTracks.get(trackId) ?? this._outboundVideoTracks.get(trackId);
	}

	public resetMetrics() {
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
		this.sendingAudioBitrate = 0;
		this.sendingVideoBitrate = 0;
		this.receivingAudioBitrate = 0;
		this.receivingVideoBitrate = 0;

		this.ICE.resetMetrics();
	}

	public update(sample: PeerConnectionTransport, timestamp: number) {
		if (this._closed) return;
		if (sample.peerConnectionId !== this._model.peerConnectionId) throw new Error(`TransportId mismatch. PeerConnectionId: ${ this._model.peerConnectionId } TransportId: ${ sample.transportId}`);

		this._sample = sample;
		if (this._model.label !== sample.label) {
			this._model.label = sample.label;
		}
		const now = Date.now();
		const report: PeerConnectionTransportReport = {
			serviceId: this.client.call.serviceId,
			roomId: this.client.call.roomId,
			callId: this.client.call.callId,
			clientId: this.client.clientId,
			userId: this.client.userId,
			mediaUnitId: this.client.mediaUnitId,
			...sample,
			timestamp,
			sampleSeq: -1, // deprecated
			marker: this.marker,
		};

		this.reports.addPeerConnectionTransportReports(report);
		this._elapsedTimeSinceLastUpdate = now - this._updated;		
		this.visited = true;
		this._updated = now;
		this._statsTimestamp = timestamp;
		this.emit('update', {
			elapsedTimeInMs: this._elapsedTimeSinceLastUpdate,
		});
	}

	public createInboundAudioTrack(config: ObservedInboundAudioTrackModel): ObservedInboundAudioTrack {
		if (this._closed) throw new Error(`PeerConnection ${this.peerConnectionId} is closed`);
		
		const result = new ObservedInboundAudioTrack(config, this);

		result.on('close', () => {
			this._inboundAudioTracks.delete(result.trackId);
		});
		this._inboundAudioTracks.set(result.trackId, result);

		this.emit('newinboudaudiotrack', result);

		return result;
	}

	public createInboundVideoTrack(config: ObservedInboundVideoTrackModel): ObservedInboundVideoTrack {
		if (this._closed) throw new Error(`PeerConnection ${this.peerConnectionId} is closed`);
		
		const result = new ObservedInboundVideoTrack(config, this);

		result.on('close', () => {
			this._inboundVideoTracks.delete(result.trackId);
		});
		this._inboundVideoTracks.set(result.trackId, result);

		this.emit('newinboudvideotrack', result);

		return result;
	}

	public createOutboundAudioTrack(config: ObservedOutboundAudioTrackModel): ObservedOutboundAudioTrack {
		if (this._closed) throw new Error(`PeerConnection ${this.peerConnectionId} is closed`);
		
		const result = new ObservedOutboundAudioTrack(config, this);

		result.on('close', () => {
			this._outboundAudioTracks.delete(result.trackId);
		});
		this._outboundAudioTracks.set(result.trackId, result);

		this.emit('newoutboundaudiotrack', result);

		return result;
	}

	public createOutboundVideoTrack(config: ObservedOutboundVideoTrackModel): ObservedOutboundVideoTrack {
		if (this._closed) throw new Error(`PeerConnection ${this.peerConnectionId} is closed`);
		
		const result = new ObservedOutboundVideoTrack(config, this);

		result.on('close', () => {
			this._outboundVideoTracks.delete(result.trackId);
		});
		this._outboundVideoTracks.set(result.trackId, result);

		this.emit('newoutboundvideotrack', result);

		return result;
	}

	public createDataChannel(channelId: number) {
		if (this._closed) throw new Error(`PeerConnection ${this.peerConnectionId} is closed`);
		
		const result = new ObservedDataChannel({
			channelId,
		}, this);

		result.on('close', () => {
			this._dataChannels.delete(result.channelId);
		});
		this._dataChannels.set(result.channelId, result);

		this.emit('newdatachannel', result);

		return result;
	}

	public updateMetrics() {
		let sumRttInMs = 0;
		let sumJitter = 0;
		const trackScores: CalculatedScore[] = [];

		this._inboundAudioTracks.forEach((track) => {
			track.updateMetrics();

			this.deltaInboundPacketsLost += track.deltaLostPackets;
			this.deltaInboundPacketsReceived += track.deltaReceivedPackets;
			this.deltaInboundReceivedBytes += track.deltaBytesReceived;
			
			this.deltaReceivedAudioBytes += track.deltaBytesReceived;
			this.deltaReceivedAudioPackets += track.deltaReceivedPackets;
			
			this.receivingAudioBitrate += track.bitrate;

			sumRttInMs += (track.rttInMs ?? 0);
			sumJitter += (track.jitter ?? 0);

			track.score && trackScores.push(track.score);
		});

		this._inboundVideoTracks.forEach((track) => {
			track.updateMetrics();

			this.deltaInboundPacketsLost += track.deltaLostPackets;
			this.deltaInboundPacketsReceived += track.deltaReceivedPackets;
			this.deltaInboundReceivedBytes += track.deltaBytesReceived;
			
			this.deltaReceivedVideoBytes += track.deltaBytesReceived;
			this.deltaReceivedVideoPackets += track.deltaReceivedPackets;
			
			this.receivingVideoBitrate += track.bitrate;

			sumRttInMs += (track.rttInMs ?? 0);
			sumJitter += (track.jitter ?? 0);

			track.score && trackScores.push(track.score);
		});

		this._outboundAudioTracks.forEach((track) => {
			track.updateMetrics();

			this.deltaOutboundPacketsSent += track.deltaSentPackets;
			this.deltaOutboundSentBytes += track.deltaSentBytes;
			
			this.deltaSentAudioBytes += track.deltaSentBytes;
			this.deltaSentAudioBytes += track.deltaSentPackets;
			
			this.sendingAudioBitrate += track.bitrate;

			sumRttInMs += (track.rttInMs ?? 0);
			sumJitter += (track.jitter ?? 0);

			track.score && trackScores.push(track.score);
		});

		this._outboundVideoTracks.forEach((track) => {
			track.updateMetrics();

			this.deltaOutboundPacketsSent += track.deltaSentPackets;
			this.deltaOutboundSentBytes += track.deltaSentBytes;
			
			this.deltaSentVideoBytes += track.deltaSentBytes;
			this.deltaSentVideoBytes += track.deltaSentPackets;
			
			this.sendingVideoBitrate += track.bitrate;

			sumRttInMs += (track.rttInMs ?? 0);
			sumJitter += (track.jitter ?? 0);

			track.score && trackScores.push(track.score);
		});

		this._dataChannels.forEach((channel) => {
			this.deltaDataChannelBytesSent += channel.deltaBytesSent;
			this.deltaDataChannelBytesReceived += channel.deltaBytesReceived;
		});

		const iceRttInMs = this.ICE.stats?.currentRoundTripTime;
		let nrOfBelongings = this._inboundAudioTracks.size + this._inboundVideoTracks.size + this._outboundAudioTracks.size + this._outboundVideoTracks.size;

		this.avgJitter = 0 < nrOfBelongings ? sumJitter / nrOfBelongings : undefined;

		if (iceRttInMs) {
			sumRttInMs += iceRttInMs;
			nrOfBelongings += 1;
		}

		this.avgRttInMs = 0 < nrOfBelongings ? sumRttInMs / nrOfBelongings : undefined;
		this.totalDataChannelBytesReceived += this.deltaDataChannelBytesReceived;
		this.totalDataChannelBytesSent += this.deltaDataChannelBytesSent;
		this.totalInboundPacketsLost += this.deltaInboundPacketsLost;
		this.totalInboundPacketsReceived += this.deltaInboundPacketsReceived;
		this.totalOutboundPacketsSent += this.deltaOutboundPacketsSent;
		this.totalSentAudioBytes += this.deltaSentAudioBytes;
		this.totalSentVideoBytes += this.deltaSentVideoBytes;
		this.totalReceivedAudioBytes += this.deltaReceivedAudioBytes;
		this.totalReceivedVideoBytes += this.deltaReceivedVideoBytes;
		this.totalReceivedAudioPacktes += this.deltaReceivedAudioPackets;
		this.totalReceivedVideoPackets += this.deltaReceivedVideoPackets;
		this.totalSentAudioPackets += this.deltaSentAudioBytes;
		this.totalSentVideoPackets += this.deltaSentVideoBytes;

		if (this._elapsedTimeSinceLastUpdate && 0 < this._elapsedTimeSinceLastUpdate) {
			this.sendingPacketsPerSecond = this.deltaOutboundPacketsSent / (this._elapsedTimeSinceLastUpdate / 1000);
			this.receivingPacketsPerSecond = this.deltaInboundPacketsReceived / (this._elapsedTimeSinceLastUpdate / 1000);
		} else {
			this.sendingPacketsPerSecond = 0;
			this.receivingPacketsPerSecond = 0;
		}

		// calculate quality score
		this._updateQualityScore(trackScores);
	}

	private _updateQualityScore(trackScores: CalculatedScore[]) {
		// Packet Jitter measured in seconds
		// we use RTT and lost packets to calculate the base score for the connection
		const rttInMs = this.avgRttInMs ?? 0;
		const latencyFactor = rttInMs < 150 ? 1.0 : getRttScore(rttInMs);
		const totalPackets = Math.max(1, (this.totalInboundPacketsReceived ?? 0) + (this.totalOutboundPacketsSent ?? 0));
		const lostPackets = (this.totalInboundPacketsLost ?? 0) + (this.deltaOutboundPacketsSent ?? 0);
		const deliveryFactor = 1.0 - ((lostPackets) / (lostPackets + totalPackets));
		// let's push the actual stability score
		const stabilityScore = ((latencyFactor * 0.5) + (deliveryFactor * 0.5)) ** 2;

		this._stabilityScores.push(stabilityScore);
		if (10 < this._stabilityScores.length) {
			this._stabilityScores.shift();
		} else if (this._stabilityScores.length < 5) {
			return;
		}
		let counter = 0;
		let weight = 0;
		let totalScore = 0;

		for (const score of this._stabilityScores) {
			weight += 1;
			counter += weight;
			totalScore += weight * score;
		}
		const weightedStabilityScore = totalScore / counter;
		let sumTrackScores = 0;

		for (const trackScore of trackScores) {
			sumTrackScores += trackScore.score;
		}

		const avgTrackScores = sumTrackScores / trackScores.length;

		const score: CalculatedScore = {
			remarks: [ {
				severity: 'none',
				text: `Peer Connection stability score: ${weightedStabilityScore}`,
			},
			{
				severity: 'none',
				text: `Avg. Track score: ${avgTrackScores}`,
			} ],
			score: Math.round(((weightedStabilityScore + avgTrackScores) * 5 * 100)) / 100.0,
			timestamp: this._statsTimestamp ?? Date.now(),
		};

		for (const pendingIssue of this.ωpendingIssuesForScores) {
			switch (pendingIssue.severity) {
				case 'critical':
					score.score = 0.0;
					break;
				case 'major':
					score.score *= 0.5;
					break;
				case 'minor':
					score.score *= 0.8;
					break;
			}
			score.remarks.push({
				severity: pendingIssue.severity,
				text: pendingIssue.description ?? 'Issue occurred',
			});
		}

		this.ωpendingIssuesForScores = [];
		this.score = score;

		this.emit('score', score);
	}
}