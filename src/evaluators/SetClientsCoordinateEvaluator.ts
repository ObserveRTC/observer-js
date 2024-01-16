import { createLogger } from '../common/logger';
import * as Models from '../models/Models';
import ipaddr from 'ipaddr.js';
import { EvaluatorProcess } from '..';

export const logger = createLogger('SetClientsCoordinateEvaluator');

export type ClientCoordinate = {
	latitude: number;
	longitude: number;
};

export type GetClientCoordinate = (ipAddress: string) => ClientCoordinate | undefined;

export function createSetClientsCoordinateEvaluator(
	getCoordinate: GetClientCoordinate,
): EvaluatorProcess {
	const process: EvaluatorProcess = async (context) => {

		const clientIds = new Set<string>();

		for (const observedCall of context.observedCalls.observedCalls()) {
			for (const observedClient of observedCall.observedClients()) {
				clientIds.add(observedClient.clientId);
			}
		}
		if (clientIds.size < 1) return;

		const storedClients = await context.storages.clientStorage.getAll(clientIds);
		
		for (const observedCall of context.observedCalls.observedCalls()) {
			for (const observedClient of observedCall.observedClients()) {
				const { clientId } = observedClient;
				const storedClient = storedClients.get(clientId);

				if (!storedClient || storedClient.coordinates) continue;
				
				let ipAddress: string | undefined;

				searchForIp: for (const observedPeerConnection of observedClient.observedPeerConnections()) {
					for (const iceLocalCandidate of observedPeerConnection.iceLocalCandidates()) {
						if (!iceLocalCandidate.address) continue;

						try {
							const addr = ipaddr.parse(iceLocalCandidate.address);
							
							ipAddress = addr.toString();

							break searchForIp;
						} catch (e) {
							logger.warn(`Failed to parse ip address: ${iceLocalCandidate.address}`, e);

							continue;
						}
						
					}
				}

				if (!ipAddress) continue;

				try {
					const coordinate = getCoordinate(ipAddress);

					if (!coordinate) continue;

					storedClient.coordinates = new Models.ClientCoordinate({
						latitude: coordinate.latitude,
						longitude: coordinate.longitude,
					});
				} catch (e) {
					logger.warn(`Failed to get coordinate for ip address: ${ipAddress}`, e);
				}
			}
		}
	};
	
	return process;
}
