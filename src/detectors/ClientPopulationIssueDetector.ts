import type { Detector } from './Detector';
import type { Observer } from '../Observer';
import type { ObservedClient } from '../ObservedClient';
import type { ActiveClientIssue } from '../issues/ActiveClientIssue';
import type { ActiveIssueTracker } from '../issues/ActiveIssueTracker';

export const ClientPopulationIssueTypes = {
	/** One issue type is concentrated on one client population while the rest of the fleet is fine. */
	clientPopulationIssue: 'CLIENT_POPULATION_ISSUE',
} as const;

/** The client attribute to group by. One axis per detector — see the class description. */
export type ClientPopulationAxis = 'browser' | 'engine' | 'platform' | 'operationSystem';

export type ClientPopulationIssueDetectorConfig = {

	/**
	 * The issue types to watch. **Required, and must not be empty.**
	 *
	 * The types worth grouping this way are the ones an endpoint owns: `cpulimitation`,
	 * `encoder-bottleneck`, `capture-bottleneck`, `stuck-decoder`, `video-decoder-overloaded`.
	 * Grouping a *network* symptom by browser is a category error — `congestion` clusters by ISP and
	 * geography, neither of which this detector can see, and it would happily report a browser
	 * correlation that is really a "most of our users are on Chrome" artefact.
	 */
	issueTypes: string[];

	/** Which client attribute to group by. Default `'browser'`. */
	groupBy: ClientPopulationAxis;

	/**
	 * Group by `name` only, or by `name + version`. Default `true` (include version).
	 *
	 * Version is usually the point: "Chrome" is not actionable, "Chrome 141" is, because it names a
	 * thing that changed on a date. Set to `false` when comparing whole engines.
	 */
	includeVersion: boolean;

	/** Minimum clients in a population before its rate means anything. Default `20`. */
	minPopulationSize: number;

	/** Minimum affected clients in the population. Default `5`. */
	minAffectedClients: number;

	/** Share of the population that must be affected. Default `0.3`. */
	affectedRatioThreshold: number;

	/**
	 * How many times worse the suspect population must be than the rest of the fleet. Default `3`.
	 *
	 * This is the control, and it is what makes the finding mean anything. See the class description.
	 */
	minRelativeRisk: number;

	/** Minimum clients **outside** the suspect population before a comparison is possible. Default `20`. */
	minControlSize: number;

	/** Re-arm time (ms) per (population, issue type). Default `300_000`. */
	cooldownMs: number;
};

/** The rollup for one population on one issue type. */
export type ClientPopulation = {

	/** e.g. `'Chrome 141'`, or `'Chrome'` when `includeVersion` is off. */
	population: string;
	axis: ClientPopulationAxis;
	issueType: string;

	clients: number;
	affectedClients: number;
	affectedRatio: number;
	affectedClientIds: string[];

	/** Everyone not in this population. */
	controlClients: number;
	controlAffectedClients: number;
	controlAffectedRatio: number;

	/** `affectedRatio / controlAffectedRatio`. `Infinity` when the control group is completely clean. */
	relativeRisk: number;
};

/**
 * Finds an issue that is concentrated on **one kind of client** — one browser, one browser version,
 * one OS — rather than on anything the servers own.
 *
 * ### Why this exists
 *
 * The other observer-scoped detectors all answer "who else has this open, and what do they share?"
 * with the answer *the infrastructure*, because clients in unrelated calls share nothing else. That
 * inference is right for network symptoms and **wrong for endpoint symptoms**, and the difference
 * matters at 3am. `cpulimitation` opening across six unrelated calls is not an SFU event: CPU is
 * owned by the endpoint, so what those endpoints have in common is a client release, a browser
 * update, or a fleet of identical VDI hosts. `IssueConclusion` already says exactly this — it maps
 * the endpoint-capacity family to a `client-population` fault domain instead of `infrastructure` —
 * but until now nothing in the library actually computed the grouping that claim refers to. This
 * detector is that computation.
 *
 * It is the one correlation in this library that is neither per-call nor per-server. A client knows
 * its own browser and nothing about anyone else's; only something sitting above the whole fleet can
 * notice that every complaint is coming from the same build.
 *
 * ### The control group is the whole point
 *
 * "30% of Chrome 141 users report encoder-bottleneck" is not a finding on its own. If 30% of
 * *everyone* reports it, Chrome 141 is not the story — you have a fleet-wide problem and this
 * detector would be pointing at the largest population rather than at a cause. Naive share-based
 * grouping always indicts whichever browser is most popular, which is why the gate here is
 * **relative risk**: the suspect population's rate divided by the rate among everyone else. A
 * population only qualifies when it is `minRelativeRisk` times worse than the rest of the fleet, and
 * only when the rest of the fleet is large enough (`minControlSize`) for "the rest of the fleet" to
 * be a real measurement.
 *
 * A completely clean control group gives `Infinity`, which is honest — nobody outside this
 * population has the problem at all — and is exactly why `minAffectedClients` and
 * `minPopulationSize` are checked independently, so a single unlucky user on a rare browser cannot
 * page anyone.
 *
 * ### One axis per detector
 *
 * `groupBy` takes a single attribute. Add a second instance if you want a second axis:
 *
 * ```ts
 * observer.addObserverDetector('client-population-issue-detector', {
 *   issueTypes: [ 'cpulimitation', 'encoder-bottleneck', 'stuck-decoder' ],
 *   groupBy: 'browser',
 * });
 *
 * observer.on('observer-issue', ({ issue }) => {
 *   if (issue.type !== ClientPopulationIssueTypes.clientPopulationIssue) return;
 *   // → { population: 'Chrome 141', issueType: 'encoder-bottleneck',
 *   //     affectedRatio: 0.34, controlAffectedRatio: 0.02, relativeRisk: 17 }
 * });
 * ```
 *
 * Deliberately not a cross-product of every axis at once: an issue that clusters on macOS *and* on
 * Safari is usually one fact reported twice, and a detector that emits both leaves the reader to
 * work out which one is causal. Pick the axis you want to reason about.
 *
 * ### Clients that never reported their metadata
 *
 * `browser` / `engine` / `platform` / `operationSystem` arrive as client metadata and may be absent —
 * a client that closed before sending them, or an application that does not collect them. Those
 * clients are excluded from **both** the population and the control group rather than bucketed as
 * `'unknown'`. A synthetic `'unknown'` population would be a mixture of every real one, so any rate
 * computed for it means nothing, and leaving those clients in the control group would dilute the
 * comparison with clients whose kind we cannot verify.
 */
export class ClientPopulationIssueDetector implements Detector, ActiveIssueTracker {
	public static readonly NAME = 'client-population-issue-detector' as const;

	public readonly name = ClientPopulationIssueDetector.NAME;

	private readonly _config: ClientPopulationIssueDetectorConfig;
	private readonly _lastRaisedAt = new Map<string, number>();
	private readonly _issues = new Set<ActiveClientIssue>();

	/** The populations that qualified on the most recent `update()`. Exposed for tests/dashboards. */
	public lastPopulations: ClientPopulation[] = [];

	public constructor(
		private readonly _observer: Observer,
		config: Partial<ClientPopulationIssueDetectorConfig> = {},
	) {
		this._config = {
			issueTypes: [],
			groupBy: 'browser',
			includeVersion: true,
			minPopulationSize: 20,
			minAffectedClients: 5,
			affectedRatioThreshold: 0.3,
			minRelativeRisk: 3,
			minControlSize: 20,
			cooldownMs: 300_000,
			...config,
		};

		for (const type of this._config.issueTypes) {
			this._observer.activeIssuesRegistry.addIssueTracker(type, this);
		}
	}

	public get size(): number {
		return this._issues.size;
	}

	public has(issue: ActiveClientIssue): boolean {
		return this._issues.has(issue);
	}

	public add(issue: ActiveClientIssue): void {
		this._issues.add(issue);
	}

	public delete(issue: ActiveClientIssue): boolean {
		return this._issues.delete(issue);
	}

	public clear(): void {
		this._issues.clear();
		this.lastPopulations = [];
	}

	public update(): void {
		this.lastPopulations = [];

		if (this._issues.size === 0) return;

		const now = Date.now();
		// The denominators: how many clients of each population exist at all. Built from the fleet
		// rather than from the affected set, because a rate needs everyone, not just the unhappy.
		const populationSizes = new Map<string, number>();

		for (const call of this._observer.observedCalls.values()) {
			for (const client of call.observedClients.values()) {
				const population = this._populationOf(client);

				if (population === undefined) continue;

				populationSizes.set(population, (populationSizes.get(population) ?? 0) + 1);
			}
		}

		if (populationSizes.size === 0) return;

		// (issueType, population) -> the affected client ids. Built from the issues we hold, so the
		// cost is the number of open issues rather than the size of the fleet.
		const affected = new Map<string, Map<string, Set<string>>>();

		for (const issue of this._issues) {
			const client = this._observer.observedCalls.get(issue.callId)?.observedClients.get(issue.clientId);

			if (!client) continue;

			const population = this._populationOf(client);

			if (population === undefined) continue;

			let byPopulation = affected.get(issue.type);

			if (!byPopulation) {
				byPopulation = new Map();
				affected.set(issue.type, byPopulation);
			}

			const clientIds = byPopulation.get(population) ?? new Set<string>();

			clientIds.add(issue.clientId);
			byPopulation.set(population, clientIds);
		}

		for (const [ issueType, byPopulation ] of affected) {
			// The fleet total for this issue type, so each population can be compared against everyone
			// else rather than against an absolute threshold.
			let totalAffected = 0;

			for (const clientIds of byPopulation.values()) totalAffected += clientIds.size;

			let totalClients = 0;

			for (const size of populationSizes.values()) totalClients += size;

			for (const [ population, clientIds ] of byPopulation) {
				const clients = populationSizes.get(population) ?? clientIds.size;
				const rollup = this._rollupOf(
					population,
					issueType,
					clientIds,
					clients,
					totalClients - clients,
					totalAffected - clientIds.size,
				);

				if (rollup.clients < this._config.minPopulationSize) continue;
				if (rollup.affectedClients < this._config.minAffectedClients) continue;
				if (rollup.affectedRatio < this._config.affectedRatioThreshold) continue;
				// Without a control group there is nothing to be "worse than", and a bare share would
				// simply indict the most popular browser.
				if (rollup.controlClients < this._config.minControlSize) continue;
				if (rollup.relativeRisk < this._config.minRelativeRisk) continue;

				this.lastPopulations.push(rollup);

				const key = `${population}:${issueType}`;

				if (now - (this._lastRaisedAt.get(key) ?? 0) < this._config.cooldownMs) continue;

				this._lastRaisedAt.set(key, now);

				this._observer.addIssue({
					type: ClientPopulationIssueTypes.clientPopulationIssue,
					timestamp: now,
					payload: {
						type: ClientPopulationIssueTypes.clientPopulationIssue,
						...rollup,
						conclusion: {
							faultDomain: 'client-population',
							summary: `'${issueType}' is ${this._riskText(rollup.relativeRisk)} more likely on ${population} than on the rest of the fleet (${rollup.affectedClients}/${rollup.clients} vs ${rollup.controlAffectedClients}/${rollup.controlClients})`,
							recommendation: 'this is not an SFU symptom — look at what those clients share: a recent release, a browser version, or shared/virtualised hardware',
							confidence: this._confidenceOf(rollup),
						},
					},
				});
			}
		}
	}

	public close(): void {
		this._observer.activeIssuesRegistry.removeIssueTracker(this);
		this._lastRaisedAt.clear();
		this.clear();
	}

	/** `undefined` when the client never reported this attribute — see the class description. */
	private _populationOf(client: ObservedClient): string | undefined {
		const attribute = client[this._config.groupBy];

		if (!attribute?.name) return undefined;

		return this._config.includeVersion && attribute.version
			? `${attribute.name} ${attribute.version}`
			: attribute.name;
	}

	private _rollupOf(
		population: string,
		issueType: string,
		clientIds: Set<string>,
		clients: number,
		controlClients: number,
		controlAffectedClients: number,
	): ClientPopulation {
		const affectedRatio = 0 < clients ? clientIds.size / clients : 0;
		const controlAffectedRatio = 0 < controlClients ? controlAffectedClients / controlClients : 0;

		return {
			population,
			axis: this._config.groupBy,
			issueType,
			clients,
			affectedClients: clientIds.size,
			affectedRatio,
			affectedClientIds: [ ...clientIds ],
			controlClients,
			controlAffectedClients,
			controlAffectedRatio,
			// A spotless control group means nobody outside this population has the problem at all.
			// `Infinity` says that plainly rather than dividing by zero or inventing a ceiling.
			relativeRisk: 0 < controlAffectedRatio
				? affectedRatio / controlAffectedRatio
				: (0 < affectedRatio ? Infinity : 0),
		};
	}

	private _riskText(relativeRisk: number): string {
		return Number.isFinite(relativeRisk) ? `${relativeRisk.toFixed(1)}x` : 'exclusively';
	}

	/** Bigger populations and starker contrasts are harder to produce by chance. */
	private _confidenceOf(rollup: ClientPopulation): number {
		let confidence = 0.4;

		if (100 <= rollup.clients) confidence += 0.2;
		else if (50 <= rollup.clients) confidence += 0.1;

		if (10 <= rollup.relativeRisk) confidence += 0.3;
		else if (5 <= rollup.relativeRisk) confidence += 0.2;
		else confidence += 0.1;

		return Math.min(1, Math.round(confidence * 100) / 100);
	}
}
