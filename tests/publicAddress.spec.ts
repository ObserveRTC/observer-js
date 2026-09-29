import { Observer } from '../src/Observer';
import { isPublicIpAddress } from '../src/common/utils';
import type { ClientSample, IceCandidateStats, PeerConnectionSample } from '../src/schema/ClientSample';
import { nextTimestamp } from './helpers/samples';

type CandidateSpec = Partial<IceCandidateStats> & { id: string };
type PcSpec = {
	peerConnectionId?: string,
	candidates: CandidateSpec[],
	/** [localCandidateId, remoteCandidateId] per pair; the pair id is `${local}|${remote}` */
	pairs?: [string, string][],
	/** the pair id the transport reports as selected; omit to report no transport at all */
	selected?: string | null,
};

function pcSample(spec: PcSpec, timestamp: number): PeerConnectionSample {
	return {
		peerConnectionId: spec.peerConnectionId ?? 'pc-1',
		iceCandidates: spec.candidates.map((c) => ({ timestamp, ...c })),
		iceCandidatePairs: (spec.pairs ?? []).map(([ local, remote ]) => ({ timestamp, id: `${local}|${remote}`, localCandidateId: local, remoteCandidateId: remote })),
		iceTransports: spec.selected === undefined ? [] : [ { timestamp, id: 'transport-1', selectedCandidatePairId: spec.selected ?? undefined } ],
	} as PeerConnectionSample;
}

function sample(pcs: PcSpec[], clientId = 'client-1'): ClientSample {
	const timestamp = nextTimestamp();

	return { timestamp, callId: 'call-1', clientId, peerConnections: pcs.map((pc) => pcSample(pc, timestamp)) };
}

const remoteHost: CandidateSpec = { id: 'remote', candidateType: 'host', address: '52.1.2.3' };

function clientOf(observer: Observer) {
	return observer.getObservedCall('call-1')?.getObservedClient('client-1');
}

describe('isPublicIpAddress', () => {
	it.each([
		[ '8.8.8.8', true ],
		[ '52.1.2.3', true ],
		[ '2a00:1450:4001:80b::200e', true ],
		[ '10.0.0.1', false ],
		[ '172.16.5.4', false ],
		[ '192.168.1.10', false ],
		[ '100.64.0.1', false ],
		[ '127.0.0.1', false ],
		[ '169.254.1.1', false ],
		[ '0.0.0.0', false ],
		[ '::', false ],
		[ '::1', false ],
		[ 'fe80::1', false ],
		[ 'fd12:3456::1', false ],
		[ '::ffff:192.168.0.1', false ],
		[ '::ffff:8.8.8.8', true ],
		[ '3c1a8b6e-0000-4b1a-9c2f-1b2c3d4e5f60.local', false ],
		[ '', false ],
		[ undefined, false ],
		[ '999.1.1.1', false ],
	])('%s -> %s', (address, expected) => {
		expect(isPublicIpAddress(address)).toBe(expected);
	});
});

describe('public address of a peer connection / client', () => {
	it('uses the address of a selected srflx local candidate', () => {
		const observer = new Observer();
		const pcEvents: string[] = [];
		const clientEvents: [string, string | undefined][] = [];

		observer.on('peer-connection-public-address-changed', ({ publicAddress }) => pcEvents.push(publicAddress));
		observer.on('client-public-address-changed', ({ publicAddress, previousPublicAddress }) => clientEvents.push([ publicAddress, previousPublicAddress ]));

		const spec: PcSpec = {
			candidates: [ { id: 'local', candidateType: 'srflx', address: '84.2.3.4', relatedAddress: '192.168.1.2' }, remoteHost ],
			pairs: [ [ 'local', 'remote' ] ],
			selected: 'local|remote',
		};

		observer.accept(sample([ spec ]));
		observer.accept(sample([ spec ]));

		const client = clientOf(observer);

		expect(client?.observedPeerConnections.get('pc-1')?.publicAddress).toBe('84.2.3.4');
		expect(client?.publicAddress).toBe('84.2.3.4');
		expect(client?.publicAddresses).toEqual([ '84.2.3.4' ]);
		// once, not per tick
		expect(pcEvents).toEqual([ '84.2.3.4' ]);
		expect(clientEvents).toEqual([ [ '84.2.3.4', undefined ] ]);

		observer.close();
	});

	it('uses relatedAddress (not the TURN relay address) for a selected relay candidate', () => {
		const observer = new Observer();

		observer.accept(sample([ {
			candidates: [ { id: 'local', candidateType: 'relay', address: '3.3.3.3', relatedAddress: '84.2.3.4', url: 'turn:turn.example.org' }, remoteHost ],
			pairs: [ [ 'local', 'remote' ] ],
			selected: 'local|remote',
		} ]));

		expect(clientOf(observer)?.publicAddress).toBe('84.2.3.4');

		observer.close();
	});

	it('ignores redacted / private addresses', () => {
		const observer = new Observer();

		observer.accept(sample([ {
			candidates: [
				{ id: 'local', candidateType: 'relay', address: '3.3.3.3', relatedAddress: '0.0.0.0' },
				{ id: 'host', candidateType: 'host', address: 'abcd.local' },
				remoteHost,
			],
			pairs: [ [ 'local', 'remote' ], [ 'host', 'remote' ] ],
			selected: 'local|remote',
		} ]));

		expect(clientOf(observer)?.publicAddress).toBeUndefined();

		observer.close();
	});

	it('falls back to a gathered local srflx candidate when the selected pair is host/LAN', () => {
		const observer = new Observer();

		observer.accept(sample([ {
			candidates: [
				{ id: 'host', candidateType: 'host', address: '192.168.1.2' },
				{ id: 'srflx', candidateType: 'srflx', address: '84.2.3.4' },
				{ id: 'remote', candidateType: 'host', address: '192.168.1.50' },
			],
			pairs: [ [ 'host', 'remote' ], [ 'srflx', 'remote' ] ],
			selected: 'host|remote',
		} ]));

		expect(clientOf(observer)?.publicAddress).toBe('84.2.3.4');

		observer.close();
	});

	it('never takes a remote candidate address', () => {
		const observer = new Observer();

		observer.accept(sample([ {
			candidates: [ { id: 'local', candidateType: 'host', address: '10.0.0.2' }, remoteHost ],
			pairs: [ [ 'local', 'remote' ] ],
			selected: 'local|remote',
		} ]));

		expect(clientOf(observer)?.publicAddress).toBeUndefined();

		observer.close();
	});

	it('is sticky, follows a change, and survives the peer connection closing', () => {
		const observer = new Observer();
		const changes: [string, string | undefined][] = [];

		observer.on('client-public-address-changed', ({ publicAddress, previousPublicAddress }) => changes.push([ publicAddress, previousPublicAddress ]));

		const withAddress = (address: string): PcSpec => ({
			candidates: [ { id: `local-${address}`, candidateType: 'srflx', address }, remoteHost ],
			pairs: [ [ `local-${address}`, 'remote' ] ],
			selected: `local-${address}|remote`,
		});

		observer.accept(sample([ withAddress('84.2.3.4') ]));
		// a tick without any ICE info does not clear it
		observer.accept(sample([ { candidates: [] } ]));
		expect(clientOf(observer)?.publicAddress).toBe('84.2.3.4');

		observer.accept(sample([ withAddress('91.5.6.7') ]));

		const client = clientOf(observer);

		expect(client?.publicAddress).toBe('91.5.6.7');
		expect(changes).toEqual([ [ '84.2.3.4', undefined ], [ '91.5.6.7', '84.2.3.4' ] ]);

		client?.observedPeerConnections.get('pc-1')?.close();
		expect(client?.publicAddress).toBe('91.5.6.7');
		expect(client?.publicAddresses).toEqual([]);

		observer.close();
	});
});

describe('selected-candidate-pair-changed', () => {
	it('fires on the first selection and on every switch, not on every tick', () => {
		const observer = new Observer();
		const seen: [string | undefined, string | undefined, string | undefined][] = [];

		observer.on('selected-candidate-pair-changed', ({ observedIceCandidatePair, previousCandidatePairId, observedPeerConnection }) => {
			seen.push([ observedIceCandidatePair?.id, previousCandidatePairId, observedPeerConnection.publicAddress ]);
		});

		const candidates: CandidateSpec[] = [
			{ id: 'host', candidateType: 'host', address: '192.168.1.2' },
			{ id: 'relay', candidateType: 'relay', address: '3.3.3.3', relatedAddress: '84.2.3.4' },
			remoteHost,
		];
		const pairs: [string, string][] = [ [ 'host', 'remote' ], [ 'relay', 'remote' ] ];

		observer.accept(sample([ { candidates, pairs, selected: 'host|remote' } ]));
		observer.accept(sample([ { candidates, pairs, selected: 'host|remote' } ]));
		observer.accept(sample([ { candidates, pairs, selected: 'relay|remote' } ]));
		observer.accept(sample([ { candidates, pairs, selected: null } ]));

		expect(seen).toEqual([
			[ 'host|remote', undefined, '84.2.3.4' ],
			[ 'relay|remote', 'host|remote', '84.2.3.4' ],
			[ undefined, 'relay|remote', '84.2.3.4' ],
		]);

		observer.close();
	});

	it('does not fire when the client reports no selectedCandidatePairId (e.g. Firefox)', () => {
		const observer = new Observer();
		let fired = 0;

		observer.on('selected-candidate-pair-changed', () => ++fired);
		observer.accept(sample([ { candidates: [ remoteHost ], selected: null } ]));
		observer.accept(sample([ { candidates: [ remoteHost ] } ]));

		expect(fired).toBe(0);

		observer.close();
	});
});
