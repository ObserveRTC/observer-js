import { Observer } from '../src/Observer';
import type { ClientSample } from '../src/schema/ClientSample';

/**
 * Coverage for the peer-connection sub-stat entities that the higher-level tests don't reach:
 * codecs, data channels, media playouts, certificates and peer-connection transports.
 */

const pcOf = (observer: Observer) =>
	observer.getObservedCall('call-1')?.getObservedClient('client-1')?.observedPeerConnections.get('pc-1');

function sample(timestamp: number, overrides: Record<string, unknown>): ClientSample {
	return {
		callId: 'call-1',
		clientId: 'client-1',
		timestamp,
		peerConnections: [ { peerConnectionId: 'pc-1', ...overrides } ],
	} as ClientSample;
}

describe('peer-connection sub-stats', () => {
	it('models codecs', () => {
		const observer = new Observer({ autoUpdateOnCallUpdate: false });
		const codecs = (timestamp: number) => sample(timestamp, {
			codecs: [ {
				timestamp, id: 'codec-1', payloadType: 111, mimeType: 'audio/opus',
				clockRate: 48000, channels: 2, sdpFmtpLine: 'minptime=10',
			} ],
		});

		observer.accept(codecs(1000));
		observer.accept(codecs(2000));

		const codec = pcOf(observer)?.observedCodecs.get('codec-1');

		expect(codec?.mimeType).toBe('audio/opus');
		expect(codec?.payloadType).toBe(111);
		expect(codec?.clockRate).toBe(48000);

		observer.close();
	});

	it('models data channels and derives message/byte deltas', () => {
		const observer = new Observer({ autoUpdateOnCallUpdate: false });
		const dc = (timestamp: number, messagesSent: number, bytesSent: number) => sample(timestamp, {
			dataChannels: [ {
				timestamp, id: 'dc-1', label: 'chat', protocol: '', state: 'open',
				messagesSent, bytesSent, messagesReceived: messagesSent, bytesReceived: bytesSent,
			} ],
		});

		observer.accept(dc(1000, 10, 1000));
		observer.accept(dc(2000, 25, 4000));

		const channel = pcOf(observer)?.observedDataChannels.get('dc-1');

		expect(channel?.label).toBe('chat');
		expect(channel?.state).toBe('open');
		expect(channel?.deltaMessagesSent).toBe(15);
		expect(channel?.deltaBytesSent).toBe(3000);

		observer.close();
	});

	it('models media playouts', () => {
		const observer = new Observer({ autoUpdateOnCallUpdate: false });
		const playout = (timestamp: number, synthesized: number) => sample(timestamp, {
			mediaPlayouts: [ {
				timestamp, id: 'mp-1', kind: 'audio',
				synthesizedSamplesDuration: synthesized, synthesizedSamplesEvents: 2,
				totalSamplesDuration: 100, totalPlayoutDelay: 1,
			} ],
		});

		observer.accept(playout(1000, 1));
		observer.accept(playout(2000, 3));

		expect(pcOf(observer)?.observedMediaPlayouts.get('mp-1')?.kind).toBe('audio');

		observer.close();
	});

	it('models certificates and peer-connection transports', () => {
		const observer = new Observer({ autoUpdateOnCallUpdate: false });
		const s = (timestamp: number) => sample(timestamp, {
			certificates: [ {
				timestamp, id: 'cert-1', fingerprint: 'AA:BB', fingerprintAlgorithm: 'sha-256',
				base64Certificate: 'x', issuerCertificateId: undefined,
			} ],
			peerConnectionTransports: [ {
				timestamp, id: 'tr-1', dataChannelsOpened: 1, dataChannelsClosed: 0,
			} ],
		});

		observer.accept(s(1000));
		observer.accept(s(2000));

		expect(pcOf(observer)?.observedCertificates.get('cert-1')?.fingerprint).toBe('AA:BB');
		expect(pcOf(observer)?.observedPeerConnectionTransports.get('tr-1')?.dataChannelsOpened).toBe(1);

		observer.close();
	});
});

describe('auto-update propagation', () => {
	const twoClients = (timestamp: number, clientId: string): ClientSample => ({
		callId: 'call-1',
		clientId,
		timestamp,
		peerConnections: [ { peerConnectionId: `pc-${clientId}` } ],
	} as ClientSample);

	it('aggregates on every sample (any client update updates the call)', () => {
		const observer = new Observer({ autoUpdateOnCallUpdate: false });
		let updates = 0;

		observer.on('call-updated', () => (updates += 1));

		observer.accept(twoClients(1000, 'a'));
		observer.accept(twoClients(2000, 'a'));

		expect(0 < updates).toBe(true);

		observer.close();
	});

	it('a call update propagates to the observer', () => {
		const observer = new Observer();
		let observerUpdates = 0;

		observer.on('observer-updated', () => (observerUpdates += 1));

		observer.accept(twoClients(1000, 'a'));
		observer.accept(twoClients(2000, 'a'));

		expect(0 < observerUpdates).toBe(true);

		observer.close();
	});
});
