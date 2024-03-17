import { EventEmitter } from 'events';
import { CallSummary } from './CallSummary';
import { ObservedCall } from '../ObservedCall';
import { ObservedClient } from '../ObservedClient';

export type CallSummaryMonitorEvents = {
	close: [],
	summary: [CallSummary],
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
	public constructor() {
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
		const clientSummary = {
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
		};

		callSummary.clients.push(clientSummary);
		
		const updateClient = () => {
			if (client.avgRttInMs) {
				clientSummary.ewmaRttInMs = (clientSummary.ewmaRttInMs * 0.9) + (client.avgRttInMs * 0.1);
			}
		};

		client.on('update', updateClient);
		client.once('close', () => {
			const elapsedTimeInS = (Date.now() - client.created) / 1000;

			clientSummary.avgInboundAudioBitrate = (client.totalReceivedBytes * 8) / elapsedTimeInS;
			clientSummary.avgInboundVideoBitrate = (client.totalReceivedBytes * 8) / elapsedTimeInS;
			clientSummary.avgOutboundAudioBitrate = (client.totalSentBytes * 8) / elapsedTimeInS;
			clientSummary.avgOutboundVideoBitrate = (client.totalSentBytes * 8) / elapsedTimeInS;
			clientSummary.durationInMs = elapsedTimeInS * 1000;
			client.off('update', updateClient);
		});
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