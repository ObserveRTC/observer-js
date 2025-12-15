import { CalculatedScore } from './scores/CalculatedScore';
import { MediaKind } from './common/types';
import { InboundTrackSample } from './schema/ClientSample';
import { Detectors } from './detectors/Detectors';
import { ObservedPeerConnection } from './ObservedPeerConnection';
import { ObservedInboundRtp } from './ObservedInboundRtp';
import { ObservedMediaPlayout } from './ObservedMediaPlayout';
import { InboundTrackReport } from './Reports';

export class ObservedInboundTrack implements InboundTrackSample {
	public readonly detectors: Detectors;
	public readonly calculatedScore: CalculatedScore = {
		weight: 1,
		value: undefined,
	};
	public appData?: Record<string, unknown>;
	public report: InboundTrackReport;

	private _visited = false;

	public addedAt?: number | undefined;
	public removedAt?: number | undefined;

	public muted?: boolean;
	
	attachments?: Record<string, unknown> | undefined;

	constructor(
		public timestamp: number,
		public readonly id: string,
		public readonly kind: MediaKind,
		private readonly _peerConnection: ObservedPeerConnection,
		private readonly _inboundRtp?: ObservedInboundRtp,
		private readonly _mediaPlayout?: ObservedMediaPlayout,
	) {
		this.detectors = new Detectors();

		this.report = {
			trackId: this.id,
			kind: this.kind,
			fractionLostDistribution: {
				gtOrEq050: 0,
				lt001: 0,
				lt005: 0,
				lt010: 0,
				lt020: 0,
				lt050: 0,
				count: 0,
				sum: 0,
			},
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

	public getPeerConnection() {
		return this._peerConnection;
	}

	public getInboundRtp() {
		return this._inboundRtp;
	}

	public getMediaPlayout() {
		return this._mediaPlayout;
	}

	public getRemoteOutboundTrack() {
		return this._peerConnection.client.call.remoteTrackResolver?.resolveRemoteOutboundTrack(this);
	}

	public update(stats: InboundTrackSample): void {
		this._visited = true;

		this.timestamp = stats.timestamp;
		this.calculatedScore.value = stats.score;
		this.attachments = stats.attachments;

		const fl = this._inboundRtp?.fractionLost;

		if (fl !== undefined) {
			if (fl < 0.01) this.report.fractionLostDistribution.lt001 += 1;
			else if (fl < 0.05) this.report.fractionLostDistribution.lt005 += 1;
			else if (fl < 0.1) this.report.fractionLostDistribution.lt010 += 1;
			else if (fl < 0.2) this.report.fractionLostDistribution.lt020 += 1;
			else if (fl < 0.5) this.report.fractionLostDistribution.lt050 += 1;
			else this.report.fractionLostDistribution.gtOrEq050 += 1;

			this.report.fractionLostDistribution.count += 1;
			this.report.fractionLostDistribution.sum += fl;
		}

		this.detectors.update();
	}
}