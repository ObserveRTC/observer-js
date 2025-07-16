import { EventEmitter } from "events";
import { CallSummary, ClientSummary } from "../common/SummaryTypes";
import { ObservedCall } from "../ObservedCall";
import { Observer } from "../Observer";
import { createLogger } from "../common/logger";
import { ObservedClient } from "../ObservedClient";
import { ClientSample } from "../schema/ClientSample";

const logger = createLogger("SummaryMonitor");

export type SummaryMonitorEvents = {
    'call-summary': [CallSummary] 
}

export interface OngoingCallSumariesMap {
    create(call: CallSummary): void | Promise<void>;
    update(call: CallSummary): void | Promise<void>;
    read(callId: string): Promise<CallSummary | undefined>;
    delete(callId: string): void | Promise<void>;
}


export class SummaryMonitor extends EventEmitter {
    
    public constructor(
        public readonly callSummaries = createSimpleOngoingCallSummariesMap(),
    ) {
        super();

    }
}

export function createSummaryMonitor(observer: Observer): SummaryMonitor {
    const result = new SummaryMonitor();
    const eventer = observer.createEventMonitor(result);
    
    eventer.onCallAdded = onCallAdded;
    eventer.onCallUpdated = onCallUpdated;
    eventer.onCallRemoved = onCallRemoved;
    eventer.onClientAdded = onClientAdded;
    eventer.onClientUpdated = onClientUpdated;
    eventer.onClientClosed = onClientClosed;

    return result;  
}

async function onCallAdded(call: ObservedCall, monitor: SummaryMonitor) {
    const summary: CallSummary = {
        startedAt: call.startedAt ?? Date.now(),
        id: call.callId,
        attachments: {},
        clients: {},
        issues: {},
        totalScore: 0,
        numberOfScores: 0,
        scoreReasons: {}
    };

    await monitor.callSummaries.create(summary);
}

async function onCallUpdated(call: ObservedCall, monitor: SummaryMonitor) {
    const summary = await monitor.callSummaries.read(call.callId);

    if (!summary) return logger.warn(`Call summary not found for call ID ${call.callId}`);

    // Update the summary with the latest call data
    if (call.startedAt) {
        summary.startedAt = call.startedAt;
    }

    if (call.score !== undefined) {
        summary.totalScore += call.score;
        ++summary.numberOfScores;

        summary.liveState = {
            ...summary.liveState,
            score: call.score
        }
    }

    await monitor.callSummaries.update(summary);
}

async function onCallRemoved(call: ObservedCall, monitor: SummaryMonitor) {
    const summary = await monitor.callSummaries.read(call.callId);

    if (!summary) return logger.warn(`Call summary not found for call ID ${call.callId}`);

    summary.liveState = undefined;

    await monitor.callSummaries.delete(call.callId);

    monitor.emit('call-summary', summary);
}


async function onClientAdded(client: ObservedClient, monitor: SummaryMonitor) {
    const callSummary = await monitor.callSummaries.read(client.call.callId);

    if (!callSummary) return logger.warn(`Call summary not found for call ID ${client.call.callId}`);
    
    const clientSummary: ClientSummary = {
        id: client.clientId,
        attachments: {},
        joinedAt: client.joinedAt ?? Date.now(),
        leftAt: client.leftAt,
        peerConnections: {},
        issues: {},
        totalScore: 0,
        numberOfScores: 0,
        scoreReasons: {}
    };

    callSummary.clients[client.clientId] = clientSummary;
    
    await monitor.callSummaries.update(callSummary);
}

async function onClientUpdated(client: ObservedClient, sample: ClientSample, monitor: SummaryMonitor) {
    const callSummary = await monitor.callSummaries.read(client.call.callId);

    if (!callSummary) return logger.warn(`Call summary not found for call ID ${client.call.callId}`);

    const clientSummary = callSummary.clients[client.clientId];

    if (!clientSummary) return logger.warn(`Client summary not found for client ID ${client.clientId} in call ID ${callSummary.id}`);

    if (client.score !== undefined) {
        clientSummary.totalScore += client.score;
        ++clientSummary.numberOfScores;

        clientSummary.liveState = {
            ...clientSummary.liveState,
            score: client.score
        }
    }

    await monitor.callSummaries.update(callSummary);
    
    sample;

}

async function onClientClosed(client: ObservedClient, monitor: SummaryMonitor) {
    const callSummary = await monitor.callSummaries.read(client.call.callId);

    if (!callSummary) return logger.warn(`Call summary not found for call ID ${client.call.callId}`);

    const clientSummary = callSummary.clients[client.clientId];

    if (!clientSummary) return logger.warn(`Client summary not found for client ID ${client.clientId} in call ID ${callSummary.id}`);

    clientSummary.leftAt = client.leftAt ?? Date.now();

    await monitor.callSummaries.update(callSummary);
}


    

// -----------------------------------------------------

function createSimpleOngoingCallSummariesMap(): OngoingCallSumariesMap {
    const map = new Map<string, CallSummary>();

    return {
        create(call: CallSummary) {
            map.set(call.id, call);
        },
        update(call: CallSummary) {
            // empty
        },
        async read(callId: string) {
            return map.get(callId);
        },
        delete(callId: string) {
            map.delete(callId);
        }
    };
}