/**
 * What a validator concluded, once it is done.
 *
 * `S` is the validator's own payload — a discriminated union on `verdict` plus whatever evidence
 * belongs to each outcome — so a report reads in the language of the thing being checked rather than
 * in generic pass/fail.
 *
 * Note this is a plain intersection with `S`, not `{ [K in keyof S]: S[K] }`. A mapped type over a
 * union collapses to the keys its members *share* (`keyof (A | B)` is the intersection), which would
 * silently drop every per-verdict evidence field and leave only `verdict` behind.
 */
export type ValidationReport<S extends Record<string, unknown> = Record<string, unknown>> =

	/** Still running — it has not seen the conditions it needs to judge anything yet. */
	| { ready: false }

	/** Done. `verdict` is narrowed by `S` to that validator's own vocabulary. */
	| ({
		ready: true,
		verdict: string,
		decidedAt: number
	} & S);

/**
 * A **one-shot structural check**: something true of the deployment rather than of this moment.
 *
 * The distinction from a `Detector` is what changes over time. A detector answers "is something wrong
 * *right now*" — congestion, a dead relay, a track nobody receives — and the answer legitimately
 * differs every tick, so it runs every tick, forever. A validator answers "is this deployment built
 * correctly" — does the SFU pick layers per receiver — and that only changes when you deploy. So a
 * validator **runs until it knows, then finishes**: it calls {@link onDone} once, the observer drops
 * it, and nothing more is computed.
 *
 * To check again — after a deploy, say — start a new one with `observer.addValidator(...)`. There is
 * no revalidation timer, because a deploy, not the passage of time, is what makes a structural
 * verdict stale.
 *
 * Validators are held in `observer.validators` and driven by `observer.update()`.
 */
export interface Validator<S extends Record<string, unknown> = Record<string, unknown>> {
	readonly name: string;

	/**
	 * The conclusion so far. `{ ready: false }` until {@link onDone} fires — and **that is not a
	 * pass**. A validator usually needs specific conditions to occur before it can judge anything,
	 * and plenty of deployments never present them.
	 */
	readonly report: ValidationReport<S>;

	/** Called exactly once, when the validator finishes. The observer uses this to unregister it. */
	onDone: (report: ValidationReport<S>) => void;

	/** Gather evidence; decide if there is now enough. Called on every `observer.update()`. */
	update(): void;

	/**
	 * Give up without a verdict. Finishes with `inconclusive`, so a caller waiting on it is freed.
	 *
	 * `reason` is carried into the report. Worth passing something specific — "cancelled" tells the
	 * reader nothing, whereas "sfu redeployed" explains why a check that was running has no verdict.
	 */
	cancel: (reason?: string) => void;
}

/**
 * The part of a validator the observer needs in order to drive it.
 *
 * `Validator<S>` is invariant in `S` — `onDone` takes a `ValidationReport<S>` and `report` returns one
 * — so a `Set<Validator>` cannot hold validators with different payloads. Driving one only needs the
 * three members that don't mention `S`.
 */
export type RunningValidator = Pick<Validator, 'name' | 'update' | 'cancel'>;
