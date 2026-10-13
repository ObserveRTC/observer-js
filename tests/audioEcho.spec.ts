import { Observer } from '../src/Observer';
import { AudioEchoTypes } from '../src/detectors/AudioEchoDetector';
import { createDefaultMediasoupRemoteTrackResolverFactory } from '../src/resolvers/RemoteTrackResolverFactories';
import type { ClientSample } from '../src/schema/ClientSample';
import { makeSample } from './helpers/samples';
import { payloadOf, type CollectedIssue } from './helpers/issues';

const BUCKET_MS = 5_000;
const BASE = 1_700_000_000_000;

/** Deterministic pseudo-random in [0, 1), so the "independent speakers" really are independent. */
function rng(seed: number) {
	let state = seed;

	return () => {
		state = (state * 1103515245 + 12345) % 2147483648;

		return state / 2147483648;
	};
}

/** A voice: loud or quiet speech, varying tick to tick. */
const speech = (random: () => number) => 0.02 + (random() * 0.12);
const SILENCE = 0.0005;

type Participant = {
	clientId: string,
	trackId: string,
	energy: number,
	duration: number,
	clientIssues?: ClientSample['clientIssues'],
	clientMetaItems?: ClientSample['clientMetaItems'],
};

function setup(options: { withResolver?: boolean } = {}) {
	jest.useFakeTimers();
	jest.setSystemTime(BASE);

	const observer = new Observer({
		autoUpdateOnCallUpdate: false,
		...(options.withResolver ? { createRemoteTrackResolver: createDefaultMediasoupRemoteTrackResolverFactory() } : {}),
	});
	const call = observer.createObservedCall({ callId: 'call-1', autoUpdateOnClientUpdate: false })!;
	const issues: CollectedIssue[] = [];

	call.addDetector('audio-echo-detector');
	observer.on('call-issue', ({ issue }) => issues.push(issue));

	const participants = new Map<string, Participant>();
	let tickIndex = 0;

	const participant = (clientId: string): Participant => {
		let found = participants.get(clientId);

		if (!found) {
			found = { clientId, trackId: `t${clientId}`, energy: 0, duration: 0 };
			participants.set(clientId, found);
		}

		return found;
	};

	/** One 5 s tick: each participant sends the level they produced over it, from its media source. */
	const tick = (levels: Record<string, number>) => {
		const timestamp = BASE + (tickIndex * BUCKET_MS);

		jest.setSystemTime(timestamp + 100);

		for (const [ clientId, level ] of Object.entries(levels)) {
			const p = participant(clientId);

			p.energy += level * level * (BUCKET_MS / 1000);
			p.duration += BUCKET_MS / 1000;

			observer.accept({
				...makeSample({
					clientId,
					timestamp,
					peerConnections: [ {
						peerConnectionId: `pc${clientId}`,
						outbound: [ { trackId: p.trackId, kind: 'audio', ssrc: 1, packetsSent: tickIndex * 250, bytesSent: tickIndex * 10_000, totalAudioEnergy: p.energy, totalSamplesDuration: p.duration } ],
					} ],
				}),
				...(p.clientIssues ? { clientIssues: p.clientIssues } : {}),
				...(p.clientMetaItems ? { clientMetaItems: p.clientMetaItems } : {}),
			});
			p.clientIssues = undefined;
			p.clientMetaItems = undefined;
		}
		call.update();
		++tickIndex;
	};

	return { observer, call, issues, tick, participant };
}

const echoIssues = (issues: CollectedIssue[]) => issues.filter((issue) => issue.type === AudioEchoTypes.audioEchoSuspected);

afterEach(() => {
	jest.useRealTimers();
});

describe('AudioEchoDetector', () => {
	it('flags the participant whose outgoing audio follows another participant\'s voice', () => {
		const h = setup();
		const random = rng(1);

		// A talks most of the time; B mostly listens, but everything A says comes back on B's track at
		// half the level. B also says something of their own now and then, while A is quiet.
		for (let i = 0; i < 30; ++i) {
			const bSpeaks = i % 6 === 5;
			const a = bSpeaks ? SILENCE : speech(random);
			const b = bSpeaks ? speech(random) : a * 0.5;

			h.tick({ A: a, B: b });
		}

		const found = echoIssues(h.issues);

		expect(found).toHaveLength(1);
		expect(payloadOf(found[0])).toMatchObject({
			trackId: 'tB',
			clientId: 'B',
			sourceTrackId: 'tA',
			sourceClientId: 'A',
			levelSource: 'media-source',
			loopbackAudioInput: false,
			ambiguousDirection: false,
		});
		expect(payloadOf(found[0]).levelCorrelation).toBeGreaterThan(0.9);
	});

	it('stays silent on turn-taking', () => {
		const h = setup();
		const random = rng(2);

		for (let i = 0; i < 40; ++i) {
			const aHasTheFloor = Math.floor(i / 3) % 2 === 0;

			h.tick({
				A: aHasTheFloor ? speech(random) : SILENCE,
				B: aHasTheFloor ? SILENCE : speech(random),
			});
		}

		expect(echoIssues(h.issues)).toHaveLength(0);
	});

	it('stays silent on cross-talk: both active, levels independent', () => {
		const h = setup();
		const randomA = rng(3);
		const randomB = rng(4242);

		for (let i = 0; i < 40; ++i) h.tick({ A: speech(randomA), B: speech(randomB) });

		expect(echoIssues(h.issues)).toHaveLength(0);
	});

	it('stays silent when nobody speaks', () => {
		const h = setup();

		for (let i = 0; i < 40; ++i) h.tick({ A: SILENCE, B: SILENCE, C: SILENCE });

		expect(echoIssues(h.issues)).toHaveLength(0);
	});

	describe('an echo whose source never has the floor alone', () => {
		const run = (withLoopbackIssue: boolean) => {
			const h = setup();
			const random = rng(5);

			if (withLoopbackIssue) {
				h.participant('B').clientIssues = [ {
					type: 'loopback-audio-input',
					key: 'loopback-audio-input-track-tB',
					payload: { trackId: 'tB', deviceLabel: 'Monitor of Built-in Audio Analog Stereo' },
					timestamp: BASE,
				} ];
			}
			h.participant('B').clientMetaItems = [ {
				type: 'AUDIO_INPUT_DEVICE',
				payload: { peerConnectionId: 'pcB', trackId: 'tB', label: 'Monitor of Built-in Audio Analog Stereo' },
				timestamp: BASE,
			} ];

			// B never speaks, so the two tracks rise and fall together whichever way round you read it.
			for (let i = 0; i < 30; ++i) {
				const a = i % 4 === 3 ? SILENCE : speech(random);

				h.tick({ A: a, B: a * 0.9 });
			}

			return echoIssues(h.issues);
		};

		it('reports only the track the client says captures from a loopback device', () => {
			const found = run(true);

			expect(found).toHaveLength(1);
			expect(payloadOf(found[0])).toMatchObject({
				trackId: 'tB',
				sourceTrackId: 'tA',
				loopbackAudioInput: true,
				audioInputLabel: 'Monitor of Built-in Audio Analog Stereo',
			});
		});

		it('without that, reports the quieter one and says the direction is a guess', () => {
			const found = run(false);

			expect(found).toHaveLength(1);
			expect(payloadOf(found[0])).toMatchObject({ trackId: 'tB', ambiguousDirection: true });
		});
	});

	it('raises once per cooldown, not once per bucket', () => {
		const h = setup();
		const random = rng(6);

		// 36 ticks = 180 s: raised at the first verdict (~45 s), re-armed 120 s later.
		for (let i = 0; i < 36; ++i) {
			const a = speech(random);

			h.tick({ A: a, B: a * 0.5, C: SILENCE });
		}

		const raisedAt = echoIssues(h.issues)
			.filter((issue) => payloadOf(issue).trackId === 'tB')
			.map((issue) => issue.timestamp! - BASE);

		expect(raisedAt).toHaveLength(2);
		expect(raisedAt[1] - raisedAt[0]).toBeGreaterThanOrEqual(120_000);
	});
});

describe('derived audio fields', () => {
	it('derives the RMS level of an inbound audio stream from its energy deltas', () => {
		const observer = new Observer({ autoUpdateOnCallUpdate: false });
		const inbound = (timestamp: number, totalAudioEnergy: number, totalSamplesDuration: number) => makeSample({
			clientId: 'R',
			timestamp,
			peerConnections: [ { peerConnectionId: 'pcR', inbound: [ { trackId: 'in', kind: 'audio', totalAudioEnergy, totalSamplesDuration } ] } ],
		});

		observer.accept(inbound(1000, 0.05, 5));
		// 0.2 energy over 5 s of audio → sqrt(0.04) = 0.2.
		observer.accept(inbound(6000, 0.25, 10));

		const rtp = [ ...observer.getObservedCall('call-1')!.getObservedClient('R')!.observedPeerConnections.get('pcR')!.observedInboundRtps.values() ][0];

		expect(rtp.totalAudioEnergy).toBe(0.25);
		expect(rtp.deltaTotalAudioEnergy).toBeCloseTo(0.2);
		expect(rtp.rmsAudioLevel).toBeCloseTo(0.2);

		observer.close();
	});

	it('falls back to what receivers heard when the publisher reports no media-source level', () => {
		const observer = new Observer({
			autoUpdateOnCallUpdate: false,
			createRemoteTrackResolver: createDefaultMediasoupRemoteTrackResolverFactory(),
		});
		const publisher = (timestamp: number) => makeSample({
			clientId: 'P',
			timestamp,
			peerConnections: [ { peerConnectionId: 'pcP', outbound: [ { trackId: 'tP', kind: 'audio', attachments: { producerId: 'prod' } } ] } ],
		});
		const receiver = (clientId: string, timestamp: number, totalAudioEnergy: number, totalSamplesDuration: number) => makeSample({
			clientId,
			timestamp,
			peerConnections: [ {
				peerConnectionId: `pc${clientId}`,
				inbound: [ { trackId: `in${clientId}`, kind: 'audio', totalAudioEnergy, totalSamplesDuration, attachments: { producerId: 'prod', consumerId: `c${clientId}` } } ],
			} ],
		});

		observer.accept(publisher(1000));
		observer.accept(receiver('R1', 1000, 0, 0));
		observer.accept(receiver('R2', 1000, 0, 0));
		observer.accept(receiver('R1', 6000, 0.2, 5));   // 0.2
		observer.accept(receiver('R2', 6000, 0.45, 5));  // 0.3
		observer.accept(publisher(6000));

		const track = observer.getObservedCall('call-1')!.getObservedClient('P')!.observedPeerConnections.get('pcP')!.observedOutboundTracks.get('tP')!;

		expect(track.receivedRmsAudioLevel).toBeCloseTo(0.25);
		expect(track.rmsAudioLevel).toBeCloseTo(0.25);
		expect(track.rmsAudioLevelSource).toBe('receivers');

		observer.close();
	});

	it('keeps the capture device an outbound audio track reported', () => {
		const observer = new Observer({ autoUpdateOnCallUpdate: false });

		observer.accept({
			...makeSample({
				clientId: 'T',
				peerConnections: [ { peerConnectionId: 'pcT', outbound: [ { trackId: 'tT', kind: 'audio' } ] } ],
			}),
			clientMetaItems: [ {
				type: 'AUDIO_INPUT_DEVICE',
				payload: { peerConnectionId: 'pcT', trackId: 'tT', label: 'Monitor of Built-in Audio Analog Stereo', deviceId: 'd' },
				timestamp: 1,
			} ],
		});

		const client = observer.getObservedCall('call-1')!.getObservedClient('T')!;

		expect(client.audioInputDevices.get('tT')?.label).toBe('Monitor of Built-in Audio Analog Stereo');
		expect(client.observedPeerConnections.get('pcT')!.observedOutboundTracks.get('tT')!.audioInputDevice?.deviceId).toBe('d');

		observer.close();
	});
});
