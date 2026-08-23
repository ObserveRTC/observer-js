import { Observer } from '../src/Observer';
import { normalizeScoreReasons } from '../src/common/utils';
import { makeSample } from './helpers/samples';
import type { ClientSample } from '../src/schema/ClientSample';

/**
 * A pre-3.6.0 `scoreReasons`, exactly as older clients put it on the wire. The cast is
 * deliberate: the 3.6.0 type says record, the 3.5.x wire says `string[]`, and the
 * back-compat path is what these specs exercise with it.
 */
function legacyScoreReasons(keys: string[]): ClientSample['scoreReasons'] {
	return keys as unknown as ClientSample['scoreReasons'];
}

describe('normalizeScoreReasons', () => {
	it('passes a 3.6.0 record through, dropping non-finite entries', () => {
		expect(normalizeScoreReasons({ 'high-jitter': 0.25, 'frozen-video': 2.0, 'bad-nan': NaN, 'bad-inf': Infinity, 'bad-type': 'x' }))
			.toEqual({ 'high-jitter': 0.25, 'frozen-video': 2.0 });
	});

	it('folds a legacy 3.5.x key array into the record shape with 0 magnitudes', () => {
		expect(normalizeScoreReasons([ 'high-rtt', 'frozen-video' ]))
			.toEqual({ 'high-rtt': 0, 'frozen-video': 0 });
	});

	it('drops non-string entries of a legacy array', () => {
		expect(normalizeScoreReasons([ 'high-rtt', 42, null, '' ]))
			.toEqual({ 'high-rtt': 0 });
	});

	it('collapses empty and unreadable values to undefined', () => {
		expect(normalizeScoreReasons(undefined)).toBeUndefined();
		expect(normalizeScoreReasons(null)).toBeUndefined();
		expect(normalizeScoreReasons([])).toBeUndefined();
		expect(normalizeScoreReasons({})).toBeUndefined();
		expect(normalizeScoreReasons({ 'only-bad': NaN })).toBeUndefined();
		expect(normalizeScoreReasons('high-rtt')).toBeUndefined();
		expect(normalizeScoreReasons(5)).toBeUndefined();
	});
});

describe('scoreReasons legacy acceptance', () => {
	it('folds legacy key arrays into records on every entity of an accepted sample', () => {
		const observer = new Observer();
		const sample = makeSample({
			peerConnections: [ { peerConnectionId: 'pc-1', inbound: [ { trackId: 'track-1', kind: 'video' } ] } ],
		});
		const pcSample = sample.peerConnections![0];

		sample.scoreReasons = legacyScoreReasons([ 'high-rtt', 'frozen-video' ]);
		pcSample.scoreReasons = legacyScoreReasons([ 'high-packetloss' ]);
		pcSample.inboundTracks![0].scoreReasons = legacyScoreReasons([ 'volatile-fps' ]);

		observer.accept(sample);

		expect(sample.scoreReasons).toEqual({ 'high-rtt': 0, 'frozen-video': 0 });
		expect(pcSample.scoreReasons).toEqual({ 'high-packetloss': 0 });
		expect(pcSample.inboundTracks![0].scoreReasons).toEqual({ 'volatile-fps': 0 });

		observer.close();
	});

	it('keeps 3.6.0 records intact while scrubbing non-finite magnitudes', () => {
		const observer = new Observer();
		const sample = makeSample({
			peerConnections: [ { peerConnectionId: 'pc-1', outbound: [ { trackId: 'track-out-1', kind: 'video' } ] } ],
		});
		const pcSample = sample.peerConnections![0];

		sample.scoreReasons = { 'high-jitter': 0.25 };
		pcSample.outboundTracks![0].scoreReasons = { 'cpu-limitation': 2.0, 'corrupt': Infinity } as Record<string, number>;

		observer.accept(sample);

		expect(sample.scoreReasons).toEqual({ 'high-jitter': 0.25 });
		expect(pcSample.outboundTracks![0].scoreReasons).toEqual({ 'cpu-limitation': 2.0 });

		observer.close();
	});

	it('collapses an empty legacy array to undefined, matching "omitted when nothing to explain"', () => {
		const observer = new Observer();
		const sample = makeSample({ peerConnections: [ { peerConnectionId: 'pc-1' } ] });

		sample.scoreReasons = legacyScoreReasons([]);

		observer.accept(sample);

		expect(sample.scoreReasons).toBeUndefined();

		observer.close();
	});
});
