import { ObservedCall } from '../ObservedCall';

export class DefaultCallScoreCalculator {

	public constructor(
		public readonly observedCall: ObservedCall,
	) {
	}

	public update() {
		let totalScore = 0;
		let totalWeight = 0;

		for (const client of this.observedCall.observedClients.values()) {
			if (client.score === undefined) continue;

			totalScore += client.score * client.calculatedScore.weight;
			totalWeight += client.calculatedScore.weight;
		}

		this.observedCall.calculatedScore.value = totalWeight ? totalScore / totalWeight : undefined;
	}
}