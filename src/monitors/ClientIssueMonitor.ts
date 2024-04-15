import { EventEmitter } from 'events';
import { ObservedCall } from '../ObservedCall';
import { ObservedClient } from '../ObservedClient';
import { ClientIssue } from './CallSummary';

export type ClientIssueMonitorEmittedIssueEvent = ClientIssue & {
	clientId: string,
	callId: string,
}

export type ClientIssueMonitorEvents = {
	close: [],
	issue: [ClientIssueMonitorEmittedIssueEvent],
	major: [ClientIssueMonitorEmittedIssueEvent],
	minor: [ClientIssueMonitorEmittedIssueEvent],
	critical: [ClientIssueMonitorEmittedIssueEvent],

}

export type ClientIssueMonitorConfig = {
	detectUserMediaClientIssues?: boolean;
	detectMediaTrackQualityLimitationClientIssues?: boolean;
}

export declare interface ClientIssueMonitor {
	on<U extends keyof ClientIssueMonitorEvents>(event: U, listener: (...args: ClientIssueMonitorEvents[U]) => void): this;
	off<U extends keyof ClientIssueMonitorEvents>(event: U, listener: (...args: ClientIssueMonitorEvents[U]) => void): this;
	once<U extends keyof ClientIssueMonitorEvents>(event: U, listener: (...args: ClientIssueMonitorEvents[U]) => void): this;
	emit<U extends keyof ClientIssueMonitorEvents>(event: U, ...args: ClientIssueMonitorEvents[U]): boolean;
}

export class ClientIssueMonitor extends EventEmitter {
	private _closed = false;
	public constructor(
		public readonly config: ClientIssueMonitorConfig = {},
	) {
		super();
		this.setMaxListeners(Infinity);
	}

	public addCall(call: ObservedCall) {
		if (this.closed) return;

		const onNewClient = (client: ObservedClient) => {
			this._addClient(call, client);
		};

		call.once('close', () => {
			call.off('newclient', onNewClient);
		});
		call.on('newclient', onNewClient);
	}

	private _addClient(call: ObservedCall, client: ObservedClient) {
		if (this.closed) return;
		const {
			callId
		} = call;
		const {
			clientId
		} = client;
		const onIssue = (issue: ClientIssue) => {
			const event: ClientIssueMonitorEmittedIssueEvent = {
				...issue,
				clientId,
				callId,
			};

			this.emit(issue.severity, event);
			this.emit('issue', event);
		};

		client.once('close', () => {
			client.off('issue', onIssue);
		});
		client.on('issue', onIssue);
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