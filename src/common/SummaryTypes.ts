import { MediaKind } from "./types"

export type CallSummary = {
    startedAt: number; // the timestamp when the call started
    endedAt?: number; // the timestamp when the call ended
    id: string; // the call ID
    attachments: Record<string, unknown>; // will contain the merged attachments
    clients: Record<string, ClientSummary>; // client ID -> client report
    issues: Record<string, number>;
    totalScore: number;
    numberOfScores: number;
    scoreReasons: Record<string, number>;

    liveState?: {
        
    };
}

export type ClientSummary = {
    id: string; // the client ID
    attachments: Record<string, unknown>; // will contain the merged attachments
    joinedAt: number; // the timestamp when the client joined the call
    leftAt?: number; // the timestamp when the client left the call
    peerConnections: Record<string, PeerConnectionSummary>; // peer connection ID -> peer connection report
    issues: Record<string, number>;
    totalScore: number;
    numberOfScores: number;
    scoreReasons: Record<string, number>;
    
    liveState?: {
        score?: number; // the current score of the client

    };
}

export type PeerConnectionSummary = {
    id: string; // the peer connection ID
    attachments: Record<string, unknown>; // will contain the merged attachments
    openedAt: number; // the timestamp when the peer connection was opened
    closedAt?: number; // the timestamp when the peer connection was closed
    
    inboundTracks: Record<string, InboundTrackSummary>; // track ID -> inbound track report
    outboundTracks: Record<string, OutboundTrackSummary>; // track ID -> outbound track report

    liveState?: {
        score?: number;
    };
}

type InboundTrackSummary = {
    callId: string; // the call ID this track belongs to
    clientId: string; // the client ID this track belongs to
    peerConnectionId: string; // the peer connection ID this track belongs to

    id: string;
    attachments: Record<string, unknown>; // will contain the merged attachments
    createdAt: number;
    closedAt?: number;
    kind: MediaKind;

    totalScore: number;
    numberOfScores: number;
    scoreReasons: Record<string, number>;

    liveState?: {
        score?: number;
        remoteTrackMuted?: boolean;
        muted?: boolean;
    };
}

type OutboundTrackSummary = {
    callId: string; // the call ID this track belongs to
    clientId: string; // the client ID this track belongs to
    peerConnectionId: string; // the peer connection ID this track belongs to

    id: string;
    attachments: Record<string, unknown>; // will contain the merged attachments
	createdAt: number;
	closedAt?: number;
	kind: MediaKind;
	
    totalScore: number;
    numberOfScores: number;
    scoreReasons: Record<string, number>;

    liveState?: {
        score?: number;
        muted?: boolean;
    };
}
