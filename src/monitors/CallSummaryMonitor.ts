import { EventEmitter } from 'events';
import { CallSummary, ClientSummary } from './CallSummary';
import { ObservedCall } from '../ObservedCall';
import { ClientIssue, ObservedClient } from '../ObservedClient';
import { ObservedOutboundTrack } from '../ObservedOutboundTrack';
import { ObservedPeerConnection } from '../ObservedPeerConnection';

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
	}

	public addCall(call: ObservedCall) {
		if (this.closed) return;

		let callSummary = this._summaries.get(call.callId);

		if (!callSummary) {
			callSummary = {
				callId: call.callId,
				roomId: call.roomId,
				serviceId: call.serviceId,
				clients: [],
				durationInMs: 0,
				started: call.created,
			};
			this._summaries.set(call.callId, callSummary);
		}
		const constCallSummary = callSummary;
		const onNewClient = (client: ObservedClient) => this._addClient(constCallSummary, client);

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
			avgInboundAudioBitrate: 0,
			avgInboundVideoBitrate: 0,
			avgOutboundAudioBitrate: 0,
			avgOutboundVideoBitrate: 0,
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

		const onIssue = (issue: ClientIssue) => {
			clientSummary.issues.push(issue);
		};

		const onUserMediaError = (error: string) => {
			if (!this.config.detectUserMediaIssues) return;

			// maybe the client also sned this issue, in which case the timestamp can be more accurate
			const alreadyDetected = clientSummary.issues.find((issue) => issue.severity === 'critical' && issue.description === error);

			!alreadyDetected && clientSummary.issues.push({
				severity: 'critical',
				timestamp: Date.now(),
				description: error,
			});
		};

		const onNewPeerConnection = (peerConnection: ObservedPeerConnection) => this._addPeerConnection(clientSummary, peerConnection);

		client.on('update', updateClient);
		client.on('usingturn', onUsingTurn);
		client.on('issue', onIssue);
		client.on('usermediaerror', onUserMediaError);
		client.on('newpeerconnection', onNewPeerConnection);
		client.once('close', () => {
			const elapsedTimeInS = (Date.now() - client.created) / 1000;

			clientSummary.avgInboundAudioBitrate = (client.totalReceivedBytes * 8) / elapsedTimeInS;
			clientSummary.avgInboundVideoBitrate = (client.totalReceivedBytes * 8) / elapsedTimeInS;
			clientSummary.avgOutboundAudioBitrate = (client.totalSentBytes * 8) / elapsedTimeInS;
			clientSummary.avgOutboundVideoBitrate = (client.totalSentBytes * 8) / elapsedTimeInS;
			clientSummary.durationInMs = elapsedTimeInS * 1000;
			client.off('update', updateClient);
			client.off('usingturn', onUsingTurn);
			client.off('issue', onIssue);
			client.off('usermediaerror', onUserMediaError);
			client.off('newpeerconnection', onNewPeerConnection);

			callSummary.durationInMs += clientSummary.durationInMs;
		});
	}

	private _addPeerConnection(clientSummary: ClientSummary, peerConnection: ObservedPeerConnection) {
		const onOutboundVideoTrack = (track: ObservedOutboundTrack<'video'>) => this._addOutboundVideoTrack(clientSummary, track);

		peerConnection.on('newoutboundvideotrack', onOutboundVideoTrack);
		peerConnection.once('close', () => {
			peerConnection.off('newoutboundvideotrack', onOutboundVideoTrack);
		});
	}

	private _addOutboundVideoTrack(clientSummary: ClientSummary, track: ObservedOutboundTrack<'video'>) {
		const onQualityLimitationChanged = (reason: string) => {
			if (!this.config.detectMediaTrackQualityLimitationIssues) return;
			
			clientSummary.issues.push({
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