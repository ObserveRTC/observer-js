import { EventEmitter } from 'events';
import { ObservedMediasoupRouter } from '../src/ObservedMediasoupRouter';

/* eslint is not run on tests; these fakes stand in for the mediasoup `types.*` objects. */

const fakeRouter = (id = 'router-1') => ({ id, observer: new EventEmitter() }) as any;

const fakeWebRtcTransport = (id: string) => ({
	id,
	type: 'webrtc',
	iceSelectedTuple: { localAddress: '1.1.1.1', localPort: 5000, protocol: 'udp' },
	observer: new EventEmitter(),
}) as any;

const fakeProducer = (id: string) => ({
	id,
	kind: 'audio',
	rtpParameters: { codecs: [{ mimeType: 'audio/opus', payloadType: 111, clockRate: 48000 }], encodings: [{ ssrc: 12345 }] },
	observer: new EventEmitter(),
}) as any;

describe('ObservedMediasoupRouter (in-memory sample)', () => {
	it('accumulates transports/producers into observedRouter.sample and tracks webrtcTransportIds', () => {
		const router = fakeRouter();
		const observed = new ObservedMediasoupRouter({ router, attachments: { region: 'eu' } });

		const t = fakeWebRtcTransport('t1');

		router.observer.emit('newtransport', t);
		t.observer.emit('newproducer', fakeProducer('p1'));

		expect(observed.sample.routerId).toBe('router-1');
		expect(observed.sample.attachments).toEqual({ region: 'eu' });
		expect(observed.sample.transports.map((x) => x.id)).toEqual(['t1']);
		expect(observed.sample.producers.map((x) => x.id)).toEqual(['p1']);
		expect(observed.webrtcTransportIds.has('t1')).toBe(true);
	});

	it('keeps closed entities in the sample with closedAt set, and records router close', () => {
		const router = fakeRouter();
		const observed = new ObservedMediasoupRouter({ router });

		const t = fakeWebRtcTransport('t1');

		router.observer.emit('newtransport', t);
		const p = fakeProducer('p1');

		t.observer.emit('newproducer', p);
		p.observer.emit('close');

		// closed producer is retained, with closedAt
		const producer = observed.sample.producers.find((x) => x.id === 'p1');

		expect(producer).toBeDefined();
		expect(producer!.closedAt).toBeDefined();

		let closed = false;

		observed.on('close', () => { closed = true; });
		router.observer.emit('close');

		expect(observed.closed).toBe(true);
		expect(observed.sample.closedAt).toBeDefined();
		expect(closed).toBe(true);
	});
});
