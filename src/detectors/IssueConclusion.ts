/**
 * Turning a correlation into a **conclusion**.
 *
 * Every detector in this library ultimately reports the same shape of observation: *N clients have
 * issue X open at once, and here is what they have in common*. That is useful but not yet
 * actionable — someone still has to know that congestion spread across unrelated calls means the
 * server, while CPU limitation spread across unrelated calls means a bad client release. This module
 * holds that interpretation step so it is stated once, consistently, instead of being re-derived by
 * whoever reads the alert at 3am.
 *
 * ### Two functions, because there are two questions
 *
 * A detector already knows its scope — it was constructed with an `ObservedCall` or with the
 * `Observer`. Handing that scope back to a single generic function meant every caller supplied
 * fields the other scope needed and its own scope ignored: a call-scoped detector passing
 * `affectedCalls: 1, totalCalls: 1` forever, an observer-scoped one passing a participant ratio that
 * was deliberately never read. Placeholders like that are a standing invitation to read them as if
 * they meant something.
 *
 * So there are two entry points, each taking only the facts its scope actually has:
 *
 * - {@link concludeCallIssue} — within one call. The axis is *how much of the meeting*, and whether
 *   the affected clients all subscribe to one published track.
 * - {@link concludeObserverIssue} — across calls. The axis is *how many independent calls*, which is
 *   the only thing that separates "one bad room" from "our infrastructure".
 *
 * Neither the issue family nor the spread concludes anything alone: congestion in one call is a
 * meeting problem, congestion in six calls is an infrastructure problem, and the issue type is
 * identical in both.
 */

/** Where the fault most likely sits, given who is affected. */
export type IssueFaultDomain =

	/** Independent calls affected at once — they share only the servers and the network. */
	| 'infrastructure'

	/** One call, broadly affected — something that call shares (its SFU worker, room, or host). */
	| 'call'

	/** The subscribers of one published track — the publisher's path or the forwarding of it. */
	| 'published-track'

	/** A single endpoint — its own device or last mile. */
	| 'endpoint'

	/** Independent calls affected, but by something endpoints own — a client build, not a server. */
	| 'client-population'

	/** Not enough signal to attribute. */
	| 'unknown';

/** A stated verdict, attached to the raised issue payload. */
export type IssueConclusion = {

	/** Where to look. */
	faultDomain: IssueFaultDomain;

	/** One line, written to be readable in an alert without opening a dashboard. */
	summary: string;

	/** What to check first. Omitted when the issue family is unknown to this module. */
	recommendation?: string;

	/**
	 * How much the spread alone justifies the verdict, `0..1`. Not a probability — a coarse ranking
	 * so alerting can threshold on it. More independent calls, or a tighter onset, means higher.
	 */
	confidence: number;
};

/** The facts a **call-scoped** conclusion is drawn from. */
export type CallIssueSpread = {
	issueType: string;

	/** Distinct clients of this call with the issue open. */
	affectedClients: number;

	/** Participants in the call — the denominator. */
	totalClients: number;

	/** True when the onsets clustered — a shared trigger rather than drift. */
	onsetBurst: boolean;

	/**
	 * Set when the affected clients are the subscriber set of **one published track**.
	 *
	 * The strongest call-scoped statement available: those clients share a publisher and nothing
	 * else, so the receivers are exonerated and the source's path is implicated.
	 */
	publishedTrackId?: string;
};

/** The facts an **observer-scoped** conclusion is drawn from. */
export type ObserverIssueSpread = {
	issueType: string;

	/** Distinct clients across the fleet with the issue open. */
	affectedClients: number;

	/** Clients in the fleet. Reported for context; it does not gate anything at this scope. */
	totalClients: number;

	/** Distinct calls containing at least one affected client. The dimension that matters here. */
	affectedCalls: number;

	/** Calls in flight. */
	totalCalls: number;

	/** True when the onsets clustered. */
	onsetBurst: boolean;
};

type IssueFamily = {
	label: string;

	/** What it means when this is widespread across independent calls. */
	infrastructure?: { summary: string, recommendation: string };

	/** Overrides the default `infrastructure` domain — used where breadth implicates clients, not servers. */
	crossCallDomain?: IssueFaultDomain;

	/** What it means when it is confined to one call. */
	call?: { summary: string, recommendation: string };

	/** What it means when it follows one published track. */
	publishedTrack?: { summary: string, recommendation: string };
};

/**
 * Issue families, keyed by prefix match against the client's issue type.
 *
 * Deliberately a small table rather than an exhaustive one: `client-monitor-js` detectors are
 * extensible and applications add their own types, so an unrecognised type still produces a
 * structurally correct conclusion (`unknown` family, spread-derived domain) rather than nothing.
 */
const families: { match: (type: string) => boolean, family: IssueFamily }[] = [
	{
		match: (t) => t.startsWith('congestion') || t.includes('bandwidth'),
		family: {
			label: 'congestion',
			infrastructure: {
				summary: 'network congestion is open across independent calls at the same time',
				recommendation: 'check SFU egress bandwidth and host network saturation before looking at any single participant',
			},
			call: {
				summary: 'most of this call is congested at once',
				recommendation: 'check the SFU worker serving this call, and whether one publisher is saturating it',
			},
		},
	},
	{
		match: (t) => t.startsWith('ice-') || t.includes('turn') || t === 'unstable-ice-path',
		family: {
			label: 'connectivity',
			infrastructure: {
				summary: 'ICE connectivity is failing across independent calls at the same time',
				recommendation: 'check SFU reachability and TURN health; a worker restart shows up as a wave of DTLS-stage failures rather than pure consent loss',
			},
			call: {
				summary: 'this call is losing ICE connectivity broadly',
				recommendation: 'check the SFU worker and the transports belonging to this call',
			},
		},
	},
	{
		match: (t) => t.startsWith('audio-') || t.includes('concealment') || t.includes('jitter-buffer'),
		family: {
			label: 'audio',
			infrastructure: {
				summary: 'audio impairment is open across independent calls at the same time',
				recommendation: 'check SFU egress and the audio forwarding path; concealment rising fleet-wide is a delivery symptom, not a device one',
			},
			call: {
				summary: 'audio is impaired for most of this call',
				recommendation: 'check this call\'s SFU worker; if only receivers are affected, the publisher\'s uplink is the next place to look',
			},
			publishedTrack: {
				summary: 'the subscribers of one published audio track are impaired while others are fine',
				recommendation: 'check that publisher\'s uplink and the SFU\'s forwarding of that producer; the receivers themselves are exonerated by the fan-out',
			},
		},
	},
	{
		match: (t) => t.includes('video') || t.includes('freeze') || t.includes('keyframe') || t.includes('decoder'),
		family: {
			label: 'video delivery',
			infrastructure: {
				summary: 'video delivery is degraded across independent calls at the same time',
				recommendation: 'check SFU egress and the keyframe/PLI path; a keyframe storm fleet-wide usually means the server is dropping or not answering PLIs',
			},
			call: {
				summary: 'video is degraded for most of this call',
				recommendation: 'check this call\'s SFU worker and whether PLIs are being answered',
			},
			publishedTrack: {
				summary: 'the subscribers of one published video track are degraded while others are fine',
				recommendation: 'check that publisher\'s uplink and the forwarding of that producer; consider recreating the consumers if only some receivers are affected',
			},
		},
	},
	{
		match: (t) => t.includes('cpu') || t.includes('overloaded') || t.includes('encoder') || t.includes('performance'),
		family: {
			label: 'endpoint capacity',
			// Breadth here does NOT implicate the servers. Endpoint CPU is owned by the endpoint, so the
			// same symptom in many unrelated calls points at what those endpoints have in common —
			// a client release, a browser update, a VDI host — not at the SFU.
			crossCallDomain: 'client-population',
			infrastructure: {
				summary: 'endpoint CPU limitation is open across independent calls at the same time',
				recommendation: 'this is not an SFU symptom: look at what the affected clients share — a recent client release, a browser version, or shared/virtualised hardware',
			},
			call: {
				summary: 'most participants of this call are CPU limited',
				recommendation: 'check whether the call is asking too much of endpoints (layer count, resolution, participant grid size)',
			},
		},
	},
];

const unknownFamily: IssueFamily = { label: 'issue' };

function familyOf(issueType: string): IssueFamily {
	return families.find((entry) => entry.match(issueType))?.family ?? unknownFamily;
}

/**
 * Confidence for a call-scoped conclusion, from the spread alone.
 *
 * Starts low and climbs with the share of the meeting affected. A clustered onset adds to it, because
 * simultaneity is hard to produce by coincidence, and a track-scoped group adds more still — it is a
 * statement about a specific source rather than about the room.
 */
function callConfidenceOf(spread: CallIssueSpread): number {
	let confidence = 0.3;

	if (0 < spread.totalClients) {
		confidence += Math.min(0.3, (spread.affectedClients / spread.totalClients) * 0.3);
	}

	if (spread.onsetBurst) confidence += 0.2;
	if (spread.publishedTrackId !== undefined) confidence += 0.1;

	return Math.min(1, Math.round(confidence * 100) / 100);
}

/**
 * Confidence for an observer-scoped conclusion.
 *
 * Independent calls are worth far more than participant count here: five affected clients in one
 * meeting have many shared local explanations, whereas five affected clients in five meetings have
 * exactly one. The call term saturates, because the tenth affected call tells you little the third
 * did not.
 */
function observerConfidenceOf(spread: ObserverIssueSpread): number {
	// 2 calls -> +0.2, 3 -> +0.3, 5+ -> +0.4
	let confidence = 0.3 + Math.min(0.4, Math.max(0, spread.affectedCalls - 1) * 0.1);

	if (spread.onsetBurst) confidence += 0.2;

	return Math.min(1, Math.round(confidence * 100) / 100);
}

/**
 * Draw the conclusion for a group of clients **within one call**.
 *
 * Ordered most-to-least specific: a track-scoped group is a stronger statement than a call-wide one,
 * and a single affected endpoint is not a statement about the call at all.
 */
export function concludeCallIssue(spread: CallIssueSpread): IssueConclusion {
	const family = familyOf(spread.issueType);
	const confidence = callConfidenceOf(spread);
	const affectedShare = 0 < spread.totalClients
		? ` (${spread.affectedClients}/${spread.totalClients} clients)`
		: '';

	if (spread.publishedTrackId !== undefined) {
		const text = family.publishedTrack;

		return {
			faultDomain: 'published-track',
			confidence,
			summary: text
				? `${text.summary} — track ${spread.publishedTrackId}${affectedShare}`
				: `'${spread.issueType}' follows published track ${spread.publishedTrackId}${affectedShare}, so the fault is on that source's path rather than the receivers'`,
			recommendation: text?.recommendation,
		};
	}

	if (1 < spread.affectedClients) {
		const text = family.call;

		return {
			faultDomain: 'call',
			confidence,
			summary: text
				? `${text.summary}${affectedShare}`
				: `'${spread.issueType}' is open for ${spread.affectedClients} of ${spread.totalClients} participants of one call`,
			recommendation: text?.recommendation,
		};
	}

	return {
		faultDomain: spread.affectedClients === 1 ? 'endpoint' : 'unknown',
		confidence,
		summary: `'${spread.issueType}' affects a single endpoint; nothing is shared with the other participants`,
		recommendation: 'treat as that participant\'s own device or last mile',
	};
}

/**
 * Draw the conclusion for a group of clients spanning **several calls**.
 *
 * One affected call is not an observer-scoped finding — it has an obvious local explanation and the
 * call-scoped detector has already reported it — so that case returns `call` and says so rather than
 * dressing it up as a fleet event.
 *
 * Which domain breadth implicates depends on the family, and this is the whole reason the module
 * exists: `congestion` across unrelated calls points at the servers, `cpulimitation` across unrelated
 * calls points at what those *endpoints* share — a client release, a browser version, shared
 * virtualised hardware — and pointing an SFU team at the second one wastes a night.
 */
export function concludeObserverIssue(spread: ObserverIssueSpread): IssueConclusion {
	const family = familyOf(spread.issueType);
	const confidence = observerConfidenceOf(spread);
	const affectedShare = 0 < spread.totalClients
		? ` (${spread.affectedClients}/${spread.totalClients} clients)`
		: '';

	if (spread.affectedCalls <= 1) {
		return {
			faultDomain: 'call',
			confidence,
			summary: `'${spread.issueType}' is confined to a single call${affectedShare}; that is a meeting problem, not a fleet one`,
			recommendation: 'look at the call-scoped finding for this call rather than at the infrastructure',
		};
	}

	const domain = family.crossCallDomain ?? 'infrastructure';
	const text = family.infrastructure;

	return {
		faultDomain: domain,
		confidence,
		summary: text
			? `${text.summary} — ${spread.affectedCalls} of ${spread.totalCalls} calls${affectedShare}`
			: `'${spread.issueType}' is open in ${spread.affectedCalls} of ${spread.totalCalls} independent calls at once${affectedShare}; they share only the infrastructure`,
		recommendation: text?.recommendation,
	};
}
