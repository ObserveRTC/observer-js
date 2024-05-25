import { EventEmitter } from 'events';
import { ObservedPeerConnection } from '../ObservedPeerConnection';

export type SfuServerMonitorMetricsRecord = {
	sfuId: string,
	receivedPacketsPerSecond: number,
	sentPacketsPerSecond: number,
	receivingAudioBitrate: number,
	receivingVideoBitrate: number,
	sendingAudioBitrate: number,
	sendingVideoBitrate: number,
	numberOfPeerConnectionsRttLt50: number,
	numberOfPeerConnectionsRttLt150: number,
	numberOfPeerConnectionsRttLt300: number,
	numberOfPeerConnectionsRttOver300: number,
	numberOfPeerConnections: number,
}

export type SfuServerMonitorConfig = {
	tooHighRttAlertSettings: {

		/**
         * The threshold for the RTT that will trigger the alert
         */
		threshold: 'rtt-gt-300' | 'rtt-gt-150' | 'rtt-gt-50',

		/**
		 * The percentage of peer connections that need to be above the threshold to trigger the alert
		 */
		percentageOfPeerConnectionsHighWatermark: number,

		/**
		 * The percentage of peer connections that need to be above the threshold to clear the alert
		 */
		percentageOfPeerConnectionsLowWatermark: number,

		/**
		 * The minimum number of clients that need to be connected to trigger the alert
		 */
		minNumberOfPeerConnections: number,
	}
}

export type SfuServerMonitorEvents = {
	'metrics': [SfuServerMonitorMetricsRecord],
	'high-rtt-started': [{
		sfuId: string, 
		threshold: SfuServerMonitorConfig['tooHighRttAlertSettings']['threshold'],
		percentageOfPeerConnections: number,
	}],
	'high-rtt-cleared': [{
		sfuId: string, 
	}],
	'too-many-clients': [{ ip: string, numberOfClients: number }],
	'close': [],
}

type PeerConnectionRecord = {
	lastSendingPacketsPerSecond: number,
	lastReceivingPacketsPerSecond: number,
	lastSendingAudioBitrate: number,
	lastSendingVideoBitrate: number,
	lastReceivingAudioBitrate: number,
	lastReceivingVideoBitrate: number,
	lastAvgRttInMs?: number,
}

export declare interface SfuServerMonitor {
	on<U extends keyof SfuServerMonitorEvents>(event: U, listener: (...args: SfuServerMonitorEvents[U]) => void): this;
	off<U extends keyof SfuServerMonitorEvents>(event: U, listener: (...args: SfuServerMonitorEvents[U]) => void): this;
	once<U extends keyof SfuServerMonitorEvents>(event: U, listener: (...args: SfuServerMonitorEvents[U]) => void): this;
	emit<U extends keyof SfuServerMonitorEvents>(event: U, ...args: SfuServerMonitorEvents[U]): boolean;
}

export class SfuServerMonitor extends EventEmitter {
	private _closed = false;
	private readonly _peerConnections = new Map<string, PeerConnectionRecord>();
	private readonly _metrics = new Map<string, SfuServerMonitorMetricsRecord>();
	private readonly _rttAlertsOn = new Set<string>();

	public constructor(
		public readonly config: SfuServerMonitorConfig
	) {
		super();
	}

	public get stats() {
		return Array.from(this._metrics.values());
	}

	public get closed() {
		return this._closed;
	}

	public close() {
		if (this.closed) return;
		this._closed = true;
		this._peerConnections.clear();
		this._metrics.clear();
		this._rttAlertsOn.clear();

		this.emit('close');
	}

	public addPeerConnection(peerConnection: ObservedPeerConnection) {
		if (this.closed) return;
		let registered = false;

		const onUpdate = () => {
			const sfuId = peerConnection.client.sfuId;
			const peerConnectionRecord = this._peerConnections.get(peerConnection.peerConnectionId);

			if (!sfuId) return;

			let metrics = this._metrics.get(sfuId);

			if (!metrics) {
				metrics = {
					sfuId,
					receivedPacketsPerSecond: 0,
					sentPacketsPerSecond: 0,
					receivingAudioBitrate: 0,
					receivingVideoBitrate: 0,
					sendingAudioBitrate: 0,
					sendingVideoBitrate: 0,
					numberOfPeerConnectionsRttLt150: 0,
					numberOfPeerConnectionsRttLt300: 0,
					numberOfPeerConnectionsRttLt50: 0,
					numberOfPeerConnectionsRttOver300: 0,
					numberOfPeerConnections: 0,
				};
				this._metrics.set(sfuId, metrics);
			}

			if (!registered) {
				registered = true;
				++metrics.numberOfPeerConnections;
			}
		
			if (peerConnectionRecord) {
				this._subtract(metrics, peerConnectionRecord);
			}
			this._increase(metrics, peerConnection);

			this._peerConnections.set(peerConnection.peerConnectionId, {
				lastSendingAudioBitrate: peerConnection.sendingAudioBitrate,
				lastSendingVideoBitrate: peerConnection.sendingVideoBitrate,
				lastReceivingAudioBitrate: peerConnection.receivingAudioBitrate,
				lastReceivingVideoBitrate: peerConnection.receivingVideoBitrate,
				lastAvgRttInMs: peerConnection.avgRttInMs,
				lastReceivingPacketsPerSecond: peerConnection.receivingPacketsPerSecond,
				lastSendingPacketsPerSecond: peerConnection.sendingPacketsPerSecond,
			});

			this._checkHighRttForClients(metrics);
		};

		peerConnection.once('close', () => {
			const address = peerConnection.ICE.selectedRemoteCandidate?.address ?? '';
			const peerConnectionRecord = this._peerConnections.get(peerConnection.peerConnectionId);
			const metrics = this._metrics.get(address);

			if (metrics) {
				if (peerConnectionRecord) {
					this._subtract(metrics, peerConnectionRecord);
				}
				if (registered) {
					if (--metrics.numberOfPeerConnections === 0) {
						this._metrics.delete(address);
						this._rttAlertsOn.delete(address);
					}
				}
			}
			this._peerConnections.delete(peerConnection.peerConnectionId);

			peerConnection.off('update', onUpdate);
		});
		peerConnection.on('update', onUpdate);
	}

	private _checkHighRttForClients(metrics: SfuServerMonitorMetricsRecord) {
		const totalClients = metrics.numberOfPeerConnections;
		const { 
			percentageOfPeerConnectionsHighWatermark, 
			percentageOfPeerConnectionsLowWatermark, 
			minNumberOfPeerConnections, 
			threshold 
		} = this.config.tooHighRttAlertSettings;

		if (metrics.numberOfPeerConnections < minNumberOfPeerConnections) return;

		const rttLt150Percentage = (metrics.numberOfPeerConnectionsRttLt150 + metrics.numberOfPeerConnectionsRttLt300 + metrics.numberOfPeerConnectionsRttOver300) / totalClients;
		const rttLt300Percentage = (metrics.numberOfPeerConnectionsRttLt150 + metrics.numberOfPeerConnectionsRttLt300) / totalClients;
		const rttOver300Percentage = metrics.numberOfPeerConnectionsRttOver300 / totalClients;
		const alertOn = this._rttAlertsOn.has(metrics.sfuId);

		switch (threshold) {
			case 'rtt-gt-50': {
				if (!alertOn && percentageOfPeerConnectionsHighWatermark < rttLt150Percentage) {
					this.emit('high-rtt-started', { 
						sfuId: metrics.sfuId, 
						threshold: 'rtt-gt-50', 
						percentageOfPeerConnections: rttLt150Percentage
					});
					this._rttAlertsOn.add(metrics.sfuId);
				} else if (alertOn && rttLt150Percentage < percentageOfPeerConnectionsLowWatermark) {
					this.emit('high-rtt-cleared', { sfuId: metrics.sfuId });
					this._rttAlertsOn.delete(metrics.sfuId);
				}
				break;
			}
			case 'rtt-gt-150': {
				if (!alertOn && percentageOfPeerConnectionsHighWatermark < rttLt300Percentage) {
					this.emit('high-rtt-started', { 
						sfuId: metrics.sfuId, 
						threshold: 'rtt-gt-150', 
						percentageOfPeerConnections: rttLt300Percentage
					});
					this._rttAlertsOn.add(metrics.sfuId);
				} else if (alertOn && rttLt300Percentage < percentageOfPeerConnectionsLowWatermark) {
					this.emit('high-rtt-cleared', { sfuId: metrics.sfuId });
					this._rttAlertsOn.delete(metrics.sfuId);
				}
				break;
			}
			case 'rtt-gt-300': {
				if (!alertOn && percentageOfPeerConnectionsHighWatermark < rttOver300Percentage) {
					this.emit('high-rtt-started', { 
						sfuId: metrics.sfuId, 
						threshold: 'rtt-gt-300', 
						percentageOfPeerConnections: rttOver300Percentage
					});
					this._rttAlertsOn.add(metrics.sfuId);
				} else if (alertOn && rttOver300Percentage < percentageOfPeerConnectionsLowWatermark) {
					this.emit('high-rtt-cleared', { sfuId: metrics.sfuId });
					this._rttAlertsOn.delete(metrics.sfuId);
				}
				break;
			}
		}
	}

	private _increase(metrics: SfuServerMonitorMetricsRecord, peerConnection: ObservedPeerConnection) {
		metrics.sendingAudioBitrate += peerConnection.receivingAudioBitrate;
		metrics.sendingVideoBitrate += peerConnection.receivingVideoBitrate;
		metrics.receivingAudioBitrate += peerConnection.sendingAudioBitrate;
		metrics.receivingVideoBitrate += peerConnection.sendingVideoBitrate;
		metrics.receivedPacketsPerSecond += peerConnection.sendingPacketsPerSecond;
		metrics.sentPacketsPerSecond += peerConnection.receivingPacketsPerSecond;

		if (peerConnection.avgRttInMs) {
			if (peerConnection.avgRttInMs < 50) {
				++metrics.numberOfPeerConnectionsRttLt50;
			} else if (peerConnection.avgRttInMs < 150) {
				++metrics.numberOfPeerConnectionsRttLt150;
			} else if (peerConnection.avgRttInMs < 300) {
				++metrics.numberOfPeerConnectionsRttLt300;
			} else {
				++metrics.numberOfPeerConnectionsRttOver300;
			}
		}
	}

	private _subtract(metrics: SfuServerMonitorMetricsRecord, peerConnectionRecord: PeerConnectionRecord) {
		metrics.sendingAudioBitrate -= peerConnectionRecord.lastReceivingAudioBitrate;
		metrics.sendingVideoBitrate -= peerConnectionRecord.lastReceivingVideoBitrate;
		metrics.receivingAudioBitrate -= peerConnectionRecord.lastSendingAudioBitrate;
		metrics.receivingVideoBitrate -= peerConnectionRecord.lastSendingVideoBitrate;
		metrics.receivedPacketsPerSecond -= peerConnectionRecord.lastSendingPacketsPerSecond;
		metrics.sentPacketsPerSecond -= peerConnectionRecord.lastReceivingPacketsPerSecond;

		if (peerConnectionRecord.lastAvgRttInMs) {
			if (peerConnectionRecord.lastAvgRttInMs < 50) {
				--metrics.numberOfPeerConnectionsRttLt50;
			} else if (peerConnectionRecord.lastAvgRttInMs < 150) {
				--metrics.numberOfPeerConnectionsRttLt150;
			} else if (peerConnectionRecord.lastAvgRttInMs < 300) {
				--metrics.numberOfPeerConnectionsRttLt300;
			} else {
				--metrics.numberOfPeerConnectionsRttOver300;
			}
		}
	}

}