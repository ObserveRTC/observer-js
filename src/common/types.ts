import {
	CallEventReport,
	CallMetaReport,
	ClientExtensionReport,
	InboundAudioTrackReport,
	InboundVideoTrackReport,
	OutboundAudioTrackReport,
	OutboundVideoTrackReport,
	PeerConnectionTransportReport,
} from '@observertc/report-schemas-js';
import { ObservedCalls } from '../samples/ObservedCalls';
import { ReportsCollector } from './ReportsCollector';
import * as Models from '../models/Models';
import { StorageProvider } from '../storages/StorageProvider';
import { Message } from '@bufbuild/protobuf';
import { Middleware } from '../middlewares/Middleware';

export type ObserverReport =
	| CallEventReport
	| CallMetaReport
	| ClientExtensionReport
	| PeerConnectionTransportReport
	| InboundAudioTrackReport
	| InboundVideoTrackReport
	| OutboundAudioTrackReport
	| OutboundVideoTrackReport;

export interface EvaluatorContext {
	readonly startedCallIds: string[];
	readonly endedCalls: (Omit<Models.Call, keyof Message> & {
		ended: number;
	})[];

	readonly joinedClientIds: string[];
	readonly detachedClients: (Omit<Models.Client, keyof Message> & {
		detached: number;
	})[];

	readonly openedPeerConnectionIds: string[];
	readonly closedPeerConnections: (Omit<Models.PeerConnection, keyof Message> & {
		closed: number;
	})[];

	readonly addedInboundAudioTrackIds: string[];
	readonly removedInboundAudioTracks: (Omit<Models.InboundTrack, keyof Message> & {
		removed: number;
	})[];

	readonly addedInboundVideoTrackIds: string[];
	readonly removedInboundVideoTracks: (Omit<Models.InboundTrack, keyof Message> & {
		removed: number;
	})[];

	readonly addedOutboundAudioTrackIds: string[];
	readonly removedOutboundAudioTracks: (Omit<Models.OutboundTrack, keyof Message> & {
		removed: number;
	})[];

	readonly addedOutboundVideoTrackIds: string[];
	readonly removedOutboundVideoTracks: (Omit<Models.OutboundTrack, keyof Message> & {
		removed: number;
	})[];

	readonly observedCalls: ObservedCalls;
	readonly storages: StorageProvider;
	readonly reports: ReportsCollector;
}

export type EvaluatorMiddleware = Middleware<EvaluatorContext>;

// const c: EvaluatorContext;

// c.endedCalls[0].
