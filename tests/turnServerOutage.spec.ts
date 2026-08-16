import { Observer } from '../src/Observer';
import { TurnServerOutageDetector, TurnServerOutageTypes } from '../src/detectors/TurnServerOutageDetector';
import { makeSample } from './helpers/samples';
import type { ClientSample } from '../src/schema/ClientSample';
import { payloadOf, type CollectedIssue } from './helpers/issues';

/**
 * The outage case its sibling cannot see: a TURN server's population collapsing. The control group
 * is what separates that from a call simply ending, so most of these tests are about the control
 * group rather than the collapse.
 */

/**
 * ICE state reaches the observer as a client *event*, not as a stats field — mirroring the browser,
 * where it is a transition rather than a sampled value.
 */
const iceStateEvent = (peerConnectionId: string, iceConnectionState: string, timestamp: number) => ({
	type: 'ICE_CONNECTION_STATE_CHANGED',
	timestamp,
	payload: JSON.stringify({ peerConnectionId, iceConnectionState }),
});

/** A client relayed through `serverUrl` — a nominated pair whose local candidate is a relay. */
function relayedSample(
	clientId: string,
	timestamp: number,
	serverUrl: string,
	iceConnectionState: string = 'connected',
): ClientSample {
	const peerConnectionId = `pc-${clientId}`;

	return makeSample({
		clientId,
		timestamp,
		clientEvents: [ iceStateEvent(peerConnectionId, iceConnectionState, timestamp) ],
		peerConnections: [ {
			peerConnectionId,
			ice: { localCandidateType: 'relay', localUrl: `${serverUrl}?transport=udp`, bytesReceived: 1000, bytesSent: 1000 },
		} ],
	});
}

/** A client not using TURN at all — part of the control group. */
const directSample = (clientId: string, timestamp: number): ClientSample => makeSample({
	clientId,
	timestamp,
	clientEvents: [ iceStateEvent(`pc-${clientId}`, 'connected', timestamp) ],
	peerConnections: [ { peerConnectionId: `pc-${clientId}`, ice: { localCandidateType: 'host' } } ],
});

function newObserver() {
	return new Observer({
		autoUpdateOnCallUpdate: false,
	});
}

const DEAD = 'turn:dead.example.org:3478';
const ALIVE = 'turn:alive.example.org:3478';

const onServer = (n: number, prefix: string) => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

describe('TurnServerOutageDetector', () => {
	it('raises when a server loses its population while the rest of the fleet is fine', () => {
		const observer = newObserver();
		const issues: CollectedIssue[] = [];

		observer.on('observer-issue', ({ issue }) => issues.push(issue));

		const detector = new TurnServerOutageDetector(observer, { consecutiveTicks: 1 });

		observer.detectors.add(detector);

		const dying = onServer(6, 'd');
		const surviving = onServer(6, 's');

		// Everyone healthy on both servers.
		for (const clientId of dying) observer.accept(relayedSample(clientId, 1000, DEAD));
		for (const clientId of surviving) observer.accept(relayedSample(clientId, 1000, ALIVE));
		observer.update();
		detector.update();

		expect(issues).toHaveLength(0);

		// The dead server's clients all fail ICE; the other server carries on.
		for (const clientId of dying) observer.accept(relayedSample(clientId, 2000, DEAD, 'failed'));
		for (const clientId of surviving) observer.accept(relayedSample(clientId, 2000, ALIVE));
		observer.update();
		detector.update();

		const issue = issues.find((i) => i.type === TurnServerOutageTypes.turnServerOutage);

		expect(issue).toBeDefined();

		const payload = payloadOf(issue!);

		expect(payload.serverUrl).toBe(DEAD);
		expect(payload.peakClients).toBe(6);
		expect(payload.currentClients).toBe(0);
		expect(payload.lossRatio).toBe(1);
		expect(payload.controlGroupHealthyRatio).toBeGreaterThanOrEqual(0.7);

		observer.close();
	});

	it('stays silent when every server collapses together — that is not one server failing', () => {
		const observer = newObserver();
		const issues: unknown[] = [];

		observer.on('observer-issue', ({ issue }) => issues.push(issue));

		const detector = new TurnServerOutageDetector(observer, { consecutiveTicks: 1 });

		observer.detectors.add(detector);

		const a = onServer(6, 'a');
		const b = onServer(6, 'b');

		for (const clientId of a) observer.accept(relayedSample(clientId, 1000, DEAD));
		for (const clientId of b) observer.accept(relayedSample(clientId, 1000, ALIVE));
		observer.update();
		detector.update();

		for (const clientId of a) observer.accept(relayedSample(clientId, 2000, DEAD, 'failed'));
		for (const clientId of b) observer.accept(relayedSample(clientId, 2000, ALIVE, 'failed'));
		observer.update();
		detector.update();

		expect(issues).toHaveLength(0);

		observer.close();
	});

	it('stays silent without a big enough control group', () => {
		const observer = newObserver();
		const issues: unknown[] = [];

		observer.on('observer-issue', ({ issue }) => issues.push(issue));

		const detector = new TurnServerOutageDetector(observer, { consecutiveTicks: 1 });

		observer.detectors.add(detector);

		const dying = onServer(6, 'd');

		for (const clientId of dying) observer.accept(relayedSample(clientId, 1000, DEAD));
		observer.update();
		detector.update();

		// Everyone was on the dead server, so there is nobody left to compare against — this is
		// indistinguishable from the meeting ending.
		for (const clientId of dying) observer.accept(relayedSample(clientId, 2000, DEAD, 'failed'));
		observer.update();
		detector.update();

		expect(issues).toHaveLength(0);

		observer.close();
	});

	it('accepts non-relayed clients as the control group', () => {
		const observer = newObserver();
		const issues: { type: string }[] = [];

		observer.on('observer-issue', ({ issue }) => issues.push(issue));

		const detector = new TurnServerOutageDetector(observer, { consecutiveTicks: 1 });

		observer.detectors.add(detector);

		const dying = onServer(6, 'd');
		const direct = onServer(6, 'p');

		for (const clientId of dying) observer.accept(relayedSample(clientId, 1000, DEAD));
		for (const clientId of direct) observer.accept(directSample(clientId, 1000));
		observer.update();
		detector.update();

		for (const clientId of dying) observer.accept(relayedSample(clientId, 2000, DEAD, 'failed'));
		for (const clientId of direct) observer.accept(directSample(clientId, 2000));
		observer.update();
		detector.update();

		expect(issues.some((i) => i.type === TurnServerOutageTypes.turnServerOutage)).toBe(true);

		observer.close();
	});

	it('ignores a server that never carried enough clients to matter', () => {
		const observer = newObserver();
		const issues: unknown[] = [];

		observer.on('observer-issue', ({ issue }) => issues.push(issue));

		const detector = new TurnServerOutageDetector(observer, { consecutiveTicks: 1, minClientsAtPeak: 5 });

		observer.detectors.add(detector);

		const dying = onServer(2, 'd');
		const surviving = onServer(8, 's');

		for (const clientId of dying) observer.accept(relayedSample(clientId, 1000, DEAD));
		for (const clientId of surviving) observer.accept(relayedSample(clientId, 1000, ALIVE));
		observer.update();
		detector.update();

		for (const clientId of dying) observer.accept(relayedSample(clientId, 2000, DEAD, 'failed'));
		for (const clientId of surviving) observer.accept(relayedSample(clientId, 2000, ALIVE));
		observer.update();
		detector.update();

		expect(issues).toHaveLength(0);

		observer.close();
	});

	it('does not re-raise inside the cooldown, and closes cleanly', () => {
		const observer = newObserver();
		const issues: unknown[] = [];

		observer.on('observer-issue', ({ issue }) => issues.push(issue));

		const detector = new TurnServerOutageDetector(observer, { consecutiveTicks: 1 });

		observer.detectors.add(detector);

		const dying = onServer(6, 'd');
		const surviving = onServer(6, 's');

		for (const clientId of dying) observer.accept(relayedSample(clientId, 1000, DEAD));
		for (const clientId of surviving) observer.accept(relayedSample(clientId, 1000, ALIVE));
		observer.update();
		detector.update();

		for (let tick = 2; tick <= 5; tick++) {
			for (const clientId of dying) observer.accept(relayedSample(clientId, tick * 1000, DEAD, 'failed'));
			for (const clientId of surviving) observer.accept(relayedSample(clientId, tick * 1000, ALIVE));
			observer.update();
			detector.update();
		}

		expect(issues).toHaveLength(1);

		detector.close();
		expect(() => detector.update()).not.toThrow();

		observer.close();
	});
});
