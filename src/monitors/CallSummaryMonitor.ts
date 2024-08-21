import { EventEmitter } from 'events';
import { CallSummary, ClientSummary } from './CallSummary';
import { ObservedCall } from '../ObservedCall';
import { ObservedClient } from '../ObservedClient';
import { ObservedPeerConnection } from '../ObservedPeerConnection';
import { ObservedOutboundVideoTrack } from '../ObservedOutboundVideoTrack';

export type CallSummaryMonitorEvents = {
	close: [],
	summary: [CallSummary],
}

export type CallSummaryMonitorConfig = {
	detectUserMediaIssues?: boolean;
	detectMediaTrackQualityLimitationIssues?: boolean;
}

export declare interface CallSummaryMonitor {
	on<U extends keyof CallSummaryMonitorEvents>(event: U, listener: (...args: CallSummaryMonitorEvents[U]) => void): this;
	off<U extends keyof CallSummaryMonitorEvents>(event: U, listener: (...args: CallSummaryMonitorEvents[U]) => void): this;
	once<U extends keyof CallSummaryMonitorEvents>(event: U, listener: (...args: CallSummaryMonitorEvents[U]) => void): this;
	emit<U extends keyof CallSummaryMonitorEvents>(event: U, ...args: CallSummaryMonitorEvents[U]): boolean;
}

export class CallSummaryMonitor extends EventEmitter {
	private readonly _summaries = new Map<string, CallSummary>();

	private _closed = false;
	public constructor(
		public readonly config: CallSummaryMonitorConfig = {},
	) {
		super();
		this.setMaxListeners(Infinity);
	}

	public addCall(call: ObservedCall) {
		if (this.closed) return;

		let callSummary: CallSummary | undefined = this._summaries.get(call.callId);

		if (!callSummary) {
			callSummary = {
				callId: call.callId,
				roomId: call.roomId,
				serviceId: call.serviceId,
				clients: [],
				durationInMs: 0,
				maxNumberOfParticipants: 0,
				numberOfIssues: 0,
				started: call.created,
			};
			this._summaries.set(call.callId, callSummary);
		}
		const constCallSummary = callSummary;
		const onNewClient = (client: ObservedClient) => {
			constCallSummary.maxNumberOfParticipants = Math.max(constCallSummary.maxNumberOfParticipants, call.clients.size);
			this._addClient(constCallSummary, client);
		};

		call.once('close', () => {
			call.off('newclient', onNewClient);
		});
		call.on('newclient', onNewClient);
	}

	private _addClient(callSummary: CallSummary, client: ObservedClient) {
		if (this.closed) return;
		const clientSummary: ClientSummary = {
			clientId: client.clientId,
			mediaUnitId: client.mediaUnitId,
			durationInMs: 0,
			totalInboundAudioBytes: 0,
			totalInboundVideoBytes: 0,
			totalOutboundAudioBytes: 0,
			totalOutboundVideoBytes: 0,
			totalDataChannelBytesSent: 0,
			totalDataChannelBytesReceived: 0,
			ewmaRttInMs: 0,
			joined: client.created,
			userId: client.userId,
			usedTurn: false,
			issues: [],
		};

		callSummary.clients.push(clientSummary);
		
		const updateClient = () => {
			if (client.avgRttInMs) {
				clientSummary.ewmaRttInMs = (clientSummary.ewmaRttInMs * 0.9) + (client.avgRttInMs * 0.1);
			}
		};

		const onUsingTurn = (usingTurn: boolean) => {
			clientSummary.usedTurn ||= usingTurn;
		};

		const onUserMediaError = (error: string) => {
			if (!this.config.detectUserMediaIssues) return;

			client.addIssue({
				severity: 'critical',
				timestamp: Date.now(),
				description: error,
			});
		};

		const onNewPeerConnection = (peerConnection: ObservedPeerConnection) => this._addPeerConnection(clientSummary, peerConnection);

		client.on('update', updateClient);
		client.on('usingturn', onUsingTurn);
		client.on('usermediaerror', onUserMediaError);
		client.on('newpeerconnection', onNewPeerConnection);
		client.once('close', () => {
			const now = Date.now();

			clientSummary.totalInboundAudioBytes = client.totalReceivedAudioBytes;
			clientSummary.totalInboundVideoBytes = client.totalReceivedVideoBytes;
			clientSummary.totalOutboundAudioBytes = client.totalSentAudioBytes;
			clientSummary.totalOutboundVideoBytes = client.totalSentVideoBytes;
			clientSummary.totalDataChannelBytesSent = client.totalDataChannelBytesSent;
			clientSummary.totalDataChannelBytesReceived = client.totalDataChannelBytesReceived;
			clientSummary.durationInMs = now - client.created;
			clientSummary.left = now;
			// client does not store issues after update emitted
			// clientSummary.issues.push(...client.issues);

			client.off('update', updateClient);
			client.off('usingturn', onUsingTurn);
			client.off('usermediaerror', onUserMediaError);
			client.off('newpeerconnection', onNewPeerConnection);

			callSummary.durationInMs += clientSummary.durationInMs;
			callSummary.numberOfIssues += clientSummary.issues.length;
			callSummary.highestSeverity = clientSummary.issues.reduce((highest, issue) => {
				if (issue.severity === 'critical') return 'critical';
				if (issue.severity === 'major' && highest !== 'critical') return 'major';
				if (issue.severity === 'minor' && highest !== 'critical' && highest !== 'major') return 'minor';
				
				return highest;
			}, callSummary.highestSeverity);
		});
	}

	private _addPeerConnection(clientSummary: ClientSummary, peerConnection: ObservedPeerConnection) {
		const onOutboundVideoTrack = (track: ObservedOutboundVideoTrack) => this._addOutboundVideoTrack(clientSummary, track);

		peerConnection.on('newoutboundvideotrack', onOutboundVideoTrack);
		peerConnection.once('close', () => {
			peerConnection.off('newoutboundvideotrack', onOutboundVideoTrack);
		});
	}

	private _addOutboundVideoTrack(clientSummary: ClientSummary, track: ObservedOutboundVideoTrack) {
		const onQualityLimitationChanged = (reason: string) => {
			if (!this.config.detectMediaTrackQualityLimitationIssues) return;

			track.peerConnection.client.addIssue({
				severity: 'minor',
				timestamp: Date.now(),
				description: reason,
				peerConnectionId: track.peerConnectionId,
				trackId: track.trackId,
			});
		};
		
		track.once('close', () => {
			track.off('qualitylimitationchanged', onQualityLimitationChanged);
		});
		track.on('qualitylimitationchanged', onQualityLimitationChanged);
	}

	public takeSummary(callId: string): CallSummary | undefined {
		if (this.closed) return;
		
		const summary = this._summaries.get(callId);

		this._summaries.delete(callId);

		return summary;
	}

	public get closed() {
		return this._closed;
	}

	public close() {
		if (this._closed) return;
		this._closed = true;

		this.emit('close');
	}
}