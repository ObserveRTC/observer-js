import { ClientIssue } from '../monitors/CallSummary';
import { ObservedInboundVideoTrack } from '../ObservedInboundVideoTrack';
import { ObservedInboundAudioTrack } from '../ObservedInboundAudioTrack';
import { ObservedOutboundVideoTrack } from '../ObservedOutboundVideoTrack';
import { ObservedOutboundAudioTrack } from '../ObservedOutboundAudioTrack';

export type CalculationRemark = {
	severity: 'none' | 'minor' | 'major' | 'critical',
	text: string,
}

export type CalculatedScore = {
	score: number,
	timestamp: number,
	remarks: CalculationRemark[],
	debugText?: string,
}

// every track calculates its own score and stores 
// the latest CalculatedScore in a score property also emits as an event 'score'
// every peer connection collects the scores and calculates its own score based on RTT, and stores it in the score property similar to track
// every client collects the scores and calculates its own score based on the peer connection scores, and stores it in the score property similar to track
// every call collects the scores and calculates its own score based on the client scores, and stores it in the score property similar to track, but
// but calls only recalculate it after a configured amount of time passed from the last recalculation, and it does not trigger automatically

/*
Recommended bpp Ranges for Good Quality

| Content Type       | H.264 (AVC) bpp Range | H.265 (HEVC) bpp Range | VP8 bpp Range | VP9 bpp Range |
|--------------------|-----------------------|-----------------------|---------------|---------------|
| Low Motion         | 0.1 - 0.2             | 0.05 - 0.15           | 0.1 - 0.2     | 0.05 - 0.15   |
| Standard Motion    | 0.15 - 0.25           | 0.1 - 0.2             | 0.15 - 0.25   | 0.1 - 0.2     |
| High Motion        | 0.25 - 0.4            | 0.15 - 0.3            | 0.25 - 0.4    | 0.15 - 0.3    |

*/
export const BPP_RANGES = {
	'lowmotion': {
		'h264': { low: 0.1, high: 0.2 },
		'h265': { low: 0.05, high: 0.15 },
		'vp8': { low: 0.1, high: 0.2 },
		'vp9': { low: 0.05, high: 0.15 },
	},
	'standard': {
		'h264': { low: 0.15, high: 0.25 },
		'h265': { low: 0.1, high: 0.2 },
		'vp8': { low: 0.15, high: 0.25 },
		'vp9': { low: 0.1, high: 0.2 },
	},
	'highmotion': {
		'h264': { low: 0.25, high: 0.4 },
		'h265': { low: 0.15, high: 0.3 },
		'vp8': { low: 0.25, high: 0.4 },
		'vp9': { low: 0.15, high: 0.3 },
	},
};

export function calculateBaseVideoScore(track: ObservedInboundVideoTrack | ObservedOutboundVideoTrack, newIssues: ClientIssue[]): CalculatedScore | undefined {
	if (!track.highestLayer) {
		return;
	}
	const {
		frameHeight,
		frameWidth,
		framesPerSecond,
		bitrate,
	} = track.highestLayer;
	const score: CalculatedScore = {
		remarks: [],
		score: 0.0,
		timestamp: track.statsTimestamp,
	};

	if (!frameHeight || !frameWidth || !bitrate || !framesPerSecond) {
		score.score = 0.0;
		score.remarks.push({
			severity: 'major',
			text: 'Missing data for score calculation',
		});
		
		return score;
	}
	
	const bpp = bitrate / (frameHeight * frameWidth * framesPerSecond);
	// let's assume vp8 for now
	const bppRange = BPP_RANGES[track.contentType][track.codec ?? 'vp8'];

	if (bpp / 2 < bppRange.low) {
		score.score = 0.5;
		score.remarks.push({
			severity: 'major',
			text: `Bitrate per pixel is too low for ${track.contentType} content`,
		});
	} else if (bppRange.low < bpp) {
		score.score = 0.8;
		score.remarks.push({
			severity: 'minor',
			text: `Bitrate per pixel is good for ${track.contentType} content`,
		});
	} else {
		score.score = Math.min(1.0, ((bpp - bppRange.low) / (bppRange.high - bppRange.low)));
		score.remarks.push({
			severity: 'none',
			text: `Bitrate per pixel is good for ${track.contentType} content`,
		});
	}

	for (const issue of newIssues) {
		if (issue.severity === 'critical') {
			score.score = 0.0;
		} else if (issue.severity === 'major') {
			score.score *= 0.5;
		} else if (issue.severity === 'minor') {
			score.score *= 0.8;
		}
		score.remarks.push({
			severity: issue.severity,
			text: issue.description ?? 'Issue occurred',
		});
	}

	return score;
}

export function calculateBaseAudioScore(track: ObservedInboundAudioTrack | ObservedOutboundAudioTrack, newIssues: ClientIssue[]): CalculatedScore | undefined {
	const score: CalculatedScore = {
		remarks: [],
		score: 0.0,
		timestamp: track.statsTimestamp,
	};

	if (track.bitrate < 8000) {
		score.score = 0.2;
		score.remarks.push({
			severity: 'none',
			text: 'Bitrate is too low for good quality audio',
		});
	} else if (track.bitrate < 16000) {
		score.score = 0.5;
		score.remarks.push({
			severity: 'none',
			text: 'Bitrate is low for audio',
		});
	} else {
		score.score = 1.0;
		score.remarks.push({
			severity: 'none',
			text: 'Bitrate is good for audio',
		});
	}

	for (const issues of newIssues) {
		if (issues.severity === 'critical') {
			score.score = 0.0;
		} else if (issues.severity === 'major') {
			score.score *= 0.5;
		} else if (issues.severity === 'minor') {
			score.score *= 0.8;
		}
		score.remarks.push({
			severity: issues.severity,
			text: issues.description ?? 'Issue occurred',
		});
	}

	return score;
}

export function calculateLatencyMOS(
	{ avgJitter, rttInMs, packetsLoss }:
	{ avgJitter: number, rttInMs: number, packetsLoss: number },
): number {
	const effectiveLatency = rttInMs + (avgJitter * 2) + 10;
	let rFactor = effectiveLatency < 160
		? 93.2 - (effectiveLatency / 40)
		: 93.2 - (effectiveLatency / 120) - 10;

	rFactor -= (packetsLoss * 2.5);
	
	return 1 + ((0.035) * rFactor) + ((0.000007) * rFactor * (rFactor - 60) * (100 - rFactor));
}

export function getRttScore(x: number): number {
	// logarithmic version: 1.0 at 150 and 0.1 at 300
	return (-1.2984 * Math.log(x)) + 7.5059;

	// exponential version: 1.0 at 150 and 0.1 at 300
	// return Math.exp(-0.01536 * x);
}