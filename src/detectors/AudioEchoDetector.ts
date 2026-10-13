import type { Detector } from './Detector';
import type { ObservedCall } from '../ObservedCall';
import type { ObservedOutboundTrack } from '../ObservedOutboundTrack';
import { correlation } from '../utils/stats';

export const AudioEchoTypes = {
	/**
	 * One participant's outgoing audio follows another participant's voice: it rises when they speak,
	 * in proportion to how loud they are. The echoing participant is sending the far end's playout
	 * back into the call — speakers into an open mic, or a loopback capture device.
	 */
	audioEchoSuspected: 'AUDIO_ECHO_SUSPECTED',
} as const;

export type AudioEchoDetectorConfig = {

	/**
	 * Width of one comparison bucket in ms, on the observer clock. Default `5_000`, the usual
	 * client-monitor sampling period. Each track contributes the level of the last tick seen in the
	 * bucket, so a bucket narrower than the clients' sampling period is mostly empty.
	 */
	bucketMs: number;

	/** Buckets kept per track, and so the stretch the verdict is taken over. Default `24` (two minutes at 5 s). */
	windowBuckets: number;

	/**
	 * RMS level (0..1) above which a bucket counts as someone speaking. Default `0.01` (-40 dBFS):
	 * speech after AGC sits around 0.03–0.1, a quiet room's noise floor well below 0.003.
	 */
	activeRmsLevel: number;

	/**
	 * Buckets in which the loudest *other* participant spoke, required before a track is judged.
	 * Default `8`. With fewer, a couple of overlapping sentences look like an echo.
	 */
	minSourceActiveBuckets: number;

	/**
	 * Share of those buckets in which the suspect track was active too. Default `0.8`. On its own this
	 * is not evidence — two people talking over each other in the same 5 s score high — which is why
	 * {@link minCorrelation} has to hold as well.
	 */
	minFollowRatio: number;

	/**
	 * Pearson correlation, over those same buckets, between the suspect's level and the loudest other
	 * participant's level, both in dB. Default `0.6`. This is the discriminating signal: an echo is
	 * louder when the source is louder, two independent speakers are not.
	 */
	minCorrelation: number;

	/** Re-arm time per suspect track in ms. Default `120_000`. */
	cooldownMs: number;

	/**
	 * The client issue type the loopback-device check raises, `'loopback-audio-input'` from
	 * client-monitor-js. Only read, never required: when it is open on the suspect track the finding
	 * says so, because it names the cause.
	 */
	loopbackAudioInputIssueType: string;
};

type LevelSample = { bucket: number, level: number };

type TrackSeries = {
	track: ObservedOutboundTrack,
	clientId: string,
	lastTimestamp: number,
	samples: LevelSample[],
	lastSeenAt: number,
};

type Candidate = {
	trackId: string,
	series: TrackSeries,
	sourceTrackId: string,
	followRatio: number,
	levelCorrelation: number,
	sourceActiveBuckets: number,
	relativeLevelDb: number,
	loopbackAudioInput: boolean,
};

/** Follow ratios closer than this cannot tell an echo from its source. */
const DIRECTION_MARGIN = 0.1;

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

/** Level floor for dB conversion, so digital silence does not become `-Infinity`. */
const LEVEL_FLOOR = 1e-5;
const toDb = (level: number) => 20 * Math.log10(Math.max(level, LEVEL_FLOOR));

/**
 * Answers **"is someone sending the others' voices back into the call?"** — the echo one participant
 * causes and everyone else hears, which no endpoint can see about itself.
 *
 * Every outbound audio track's level is taken once per tick: `ObservedOutboundTrack.rmsAudioLevel`,
 * the publisher's own media-source level where the browser reports it, otherwise the median of what
 * its receivers heard. Levels are bucketed on the observer clock, and each track is compared with
 * the **loudest other participant** in the same bucket rather than with every participant in turn,
 * which keeps a tick linear in the number of publishers.
 *
 * A track is suspected when, over the buckets in which someone else was speaking:
 *
 * - it was active in at least `minFollowRatio` of them, **and**
 * - its level in dB correlates with theirs at `minCorrelation` or above.
 *
 * Ordinary turn-taking fails the first test (the listener is quiet while the other talks); cross-talk
 * passes the first and fails the second (two independent voices do not rise and fall together). The
 * echoing participant's own speech does not hurt: it fills buckets in which the others are quiet,
 * and those are not scored.
 *
 * An echo and its source correlate in both directions, so when the source rarely has the floor to
 * themselves both tracks pass. Only one is reported: the one with the client's `loopback-audio-input`
 * issue open, else the one that follows the other more reliably, else the quieter one — flagged
 * `ambiguousDirection` in that last case.
 *
 * The source is reported as the participant most often loudest in those buckets. When the suspect
 * track also has the client's `loopback-audio-input` issue open, the finding says so: that names
 * the cause, where the correlation alone only shows the effect.
 *
 * **Limits.** The comparison is at the clients' sampling granularity (5 s by default), so it catches
 * sustained echo — a loopback device, speakers into a laptop mic without AEC — and misses faint or
 * intermittent echo. Clients sample on their own schedules, so the buckets of two participants are
 * offset by up to one sampling period; `minSourceActiveBuckets` is what absorbs that. For Firefox
 * publishers the level comes from receivers, which needs a `RemoteTrackResolver`; without one those
 * tracks carry no level and are never judged.
 */
export class AudioEchoDetector implements Detector {
	public static readonly NAME = 'audio-echo-detector' as const;
	public readonly name = AudioEchoDetector.NAME;

	private readonly _config: AudioEchoDetectorConfig;
	private readonly _series = new Map<string, TrackSeries>();
	private readonly _lastRaisedAt = new Map<string, number>();
	private _lastEvaluatedBucket?: number;

	public constructor(
		private readonly call: ObservedCall,
		config: Partial<AudioEchoDetectorConfig> = {},
	) {
		this._config = {
			bucketMs: 5_000,
			windowBuckets: 24,
			activeRmsLevel: 0.01,
			minSourceActiveBuckets: 8,
			minFollowRatio: 0.8,
			minCorrelation: 0.6,
			cooldownMs: 120_000,
			loopbackAudioInputIssueType: 'loopback-audio-input',
			...config,
		};
	}

	public close(): void {
		this._series.clear();
		this._lastRaisedAt.clear();
	}

	public update(): void {
		const now = Date.now();
		const bucket = Math.floor(now / this._config.bucketMs);

		// The call updates on every accepted sample; this does its work once per bucket. That keeps a
		// call update at one comparison, and one pass over the publishers per bucket rather than per
		// sample. The pass reads each track's latest tick into the bucket that just closed.
		if (this._lastEvaluatedBucket === bucket) return;

		const closedBucket = bucket - 1;

		this._lastEvaluatedBucket = bucket;
		this._collect(now, closedBucket);
		this._evaluate(now, bucket);
	}

	private _collect(now: number, bucket: number): void {
		for (const client of this.call.observedClients.values()) {
			for (const peerConnection of client.observedPeerConnections.values()) {
				for (const track of peerConnection.observedOutboundTracks.values()) {
					if (track.kind !== 'audio') continue;

					let series = this._series.get(track.id);

					if (!series) {
						series = { track, clientId: client.clientId, lastTimestamp: -1, samples: [], lastSeenAt: now };
						this._series.set(track.id, series);
					}
					series.lastSeenAt = now;

					// No new tick since the last bucket: nothing measured, so nothing recorded.
					if (series.lastTimestamp === track.timestamp) continue;
					series.lastTimestamp = track.timestamp;

					const level = track.rmsAudioLevel;

					if (level === undefined) continue;

					series.samples.push({ bucket, level });

					const oldest = bucket - this._config.windowBuckets;

					while (series.samples.length && series.samples[0].bucket <= oldest) series.samples.shift();
				}
			}
		}

		// Tracks that left the call.
		for (const [ trackId, series ] of this._series) {
			if (series.lastSeenAt !== now) this._series.delete(trackId);
		}
	}

	private _evaluate(now: number, currentBucket: number): void {
		if (this._series.size < 2) return;

		// Per closed bucket, the loudest and second-loudest track: "the loudest other participant" of
		// any track is then one of the two, without comparing every pair.
		type Top = { id: string, level: number };
		const tops = new Map<number, [Top, Top | undefined]>();

		for (const [ trackId, series ] of this._series) {
			for (const { bucket, level } of series.samples) {
				if (currentBucket <= bucket) continue;

				const top = tops.get(bucket);
				const entry = { id: trackId, level };

				if (!top) tops.set(bucket, [ entry, undefined ]);
				else if (top[0].level < level) tops.set(bucket, [ entry, top[0] ]);
				else if (!top[1] || top[1].level < level) top[1] = entry;
			}
		}

		const candidates = new Map<string, Candidate>();

		for (const [ trackId, series ] of this._series) {
			const suspectDb: number[] = [];
			const sourceDb: number[] = [];
			const sourceCounts = new Map<string, number>();
			let followed = 0;

			for (const { bucket, level } of series.samples) {
				const top = tops.get(bucket);

				if (!top) continue;

				const source = top[0].id === trackId ? top[1] : top[0];

				if (!source || source.level < this._config.activeRmsLevel) continue;

				if (this._config.activeRmsLevel <= level) followed += 1;

				suspectDb.push(toDb(level));
				sourceDb.push(toDb(source.level));
				sourceCounts.set(source.id, (sourceCounts.get(source.id) ?? 0) + 1);
			}

			const sourceActiveBuckets = sourceDb.length;

			if (sourceActiveBuckets < this._config.minSourceActiveBuckets) continue;

			const followRatio = followed / sourceActiveBuckets;

			if (followRatio < this._config.minFollowRatio) continue;

			const levelCorrelation = correlation(suspectDb, sourceDb);

			if (levelCorrelation < this._config.minCorrelation) continue;

			const [ sourceTrackId ] = [ ...sourceCounts ].reduce((a, b) => (a[1] < b[1] ? b : a));
			const client = this.call.observedClients.get(series.clientId);

			candidates.set(trackId, {
				trackId,
				series,
				sourceTrackId,
				followRatio,
				levelCorrelation,
				sourceActiveBuckets,
				// How much quieter than its source the suspect is, in dB. An echo is at most as loud as
				// what it echoes, give or take AGC.
				relativeLevelDb: mean(suspectDb) - mean(sourceDb),
				loopbackAudioInput: client?.activeIssues.get(`${this._config.loopbackAudioInputIssueType}-track-${trackId}`) !== undefined,
			});
		}

		for (const candidate of candidates.values()) {
			// **The direction.** An echo and its source are correlated both ways, so when the source
			// rarely has the floor to themselves both tracks pass. Only one is the echo: prefer the one
			// the client says captures from a loopback device, then the one that follows the other more
			// reliably, then the quieter one.
			const reverse = candidates.get(candidate.sourceTrackId);
			let ambiguousDirection = false;

			if (reverse && reverse.sourceTrackId === candidate.trackId) {
				if (candidate.loopbackAudioInput !== reverse.loopbackAudioInput) {
					if (!candidate.loopbackAudioInput) continue;
				} else if (DIRECTION_MARGIN < Math.abs(candidate.followRatio - reverse.followRatio)) {
					if (candidate.followRatio < reverse.followRatio) continue;
				} else {
					ambiguousDirection = true;
					if (reverse.relativeLevelDb < candidate.relativeLevelDb) continue;
					if (reverse.relativeLevelDb === candidate.relativeLevelDb && reverse.trackId < candidate.trackId) continue;
				}
			}

			if (now - (this._lastRaisedAt.get(candidate.trackId) ?? -Infinity) < this._config.cooldownMs) continue;

			this._lastRaisedAt.set(candidate.trackId, now);

			const { series } = candidate;

			this.call.addIssue({
				type: AudioEchoTypes.audioEchoSuspected,
				timestamp: now,
				payload: {
					trackId: candidate.trackId,
					clientId: series.clientId,
					sourceTrackId: candidate.sourceTrackId,
					sourceClientId: this._series.get(candidate.sourceTrackId)?.clientId,
					followRatio: candidate.followRatio,
					levelCorrelation: candidate.levelCorrelation,
					relativeLevelDb: candidate.relativeLevelDb,
					sourceActiveBuckets: candidate.sourceActiveBuckets,
					bucketMs: this._config.bucketMs,
					ambiguousDirection,
					levelSource: series.track.rmsAudioLevelSource,
					audioInputLabel: series.track.audioInputDevice?.label,
					loopbackAudioInput: candidate.loopbackAudioInput,
				},
			});
		}
	}
}
