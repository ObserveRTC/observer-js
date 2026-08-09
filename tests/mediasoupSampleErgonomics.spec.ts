import { EventEmitter } from 'events';
import { ObservedMediasoupRouter } from '../src/ObservedMediasoupRouter';

/* eslint is not run on tests; these fakes stand in for the mediasoup `types.*` objects. */

const fakeRouter = (id = 'router-1') => ({ id, observer: new EventEmitter() }) as any;

const fakeWebRtcTransport = (id: string, appData: Record<string, unknown> = {}) => ({
	id,
	type: 'webrtc',
	appData,
	iceSelectedTuple: { localAddress: '1.1.1.1', localPort: 5000, protocol: 'udp' },
	observer: new EventEmitter(),
}) as any;

const fakeProducer = (id: string, appData: Record<string, unknown> = {}) => ({
	id,
	kind: 'audio',
	appData,
	rtpParameters: { codecs: [ { mimeType: 'audio/opus', payloadType: 111, clockRate: 48000 } ], encodings: [ { ssrc: 1 } ] },
	observer: new EventEmitter(),
}) as any;

const fakeConsumer = (id: string, producerId: string, appData: Record<string, unknown> = {}) => {
	const c: any = new EventEmitter();

	c.id = id;
	c.producerId = producerId;
	c.kind = 'audio';
	c.appData = appData;
	c.observer = new EventEmitter();

	return c;
};

const fakeDataProducer = (id: string) => ({ id, label: 'l', protocol: '', observer: new EventEmitter() }) as any;
const fakeDataConsumer = (id: string, dataProducerId: string) =>
	({ id, dataProducerId, label: 'l', protocol: '', observer: new EventEmitter() }) as any;

describe('mediasoup sample ergonomics', () => {
	it('indexes every entity by id, so a sample is reachable without scanning', () => {
		const router = fakeRouter();
		const observed = new ObservedMediasoupRouter({ router });
		const t = fakeWebRtcTransport('t1');

		router.observer.emit('newtransport', t);
		t.observer.emit('newproducer', fakeProducer('p1'));
		t.observer.emit('newconsumer', fakeConsumer('c1', 'p1'));
		t.observer.emit('newdataproducer', fakeDataProducer('dp1'));
		t.observer.emit('newdataconsumer', fakeDataConsumer('dc1', 'dp1'));

		expect(observed.getTransportSample('t1')?.id).toBe('t1');
		expect(observed.getProducerSample('p1')?.kind).toBe('audio');
		expect(observed.getConsumerSample('c1')?.producerId).toBe('p1');
		expect(observed.getDataProducerSample('dp1')?.id).toBe('dp1');
		expect(observed.getDataConsumerSample('dc1')?.dataProducerId).toBe('dp1');
		expect(observed.getProducerSample('nope')).toBeUndefined();

		// the indexed object IS the one in the array, not a copy
		expect(observed.getProducerSample('p1')).toBe(observed.sample.producers[0]);
	});

	it('attachTo() merges into any entity kind and reports an unknown id', () => {
		const router = fakeRouter();
		const observed = new ObservedMediasoupRouter({ router });
		const t = fakeWebRtcTransport('t1');

		router.observer.emit('newtransport', t);
		t.observer.emit('newproducer', fakeProducer('p1'));

		expect(observed.attachTo('p1', { participantId: 'alice' })).toBe(true);
		expect(observed.attachTo('p1', { purpose: 'screenshare' })).toBe(true);
		expect(observed.getProducerSample('p1')?.attachments).toEqual({ participantId: 'alice', purpose: 'screenshare' });

		expect(observed.attachTo('t1', { edge: 'eu-1' })).toBe(true);
		expect(observed.getTransportSample('t1')?.attachments).toEqual({ edge: 'eu-1' });

		// an unknown id answers honestly instead of silently doing nothing
		expect(observed.attachTo('unknown', { x: 1 })).toBe(false);
	});

	it('emits <entity>-sample-added carrying the live sample, so handlers can enrich on the fly', () => {
		const router = fakeRouter();
		const observed = new ObservedMediasoupRouter({ router });
		const seen: string[] = [];

		observed.on('transport-sample-added', ({ sample }) => seen.push(`transport:${sample.id}`));
		observed.on('producer-sample-added', ({ sample, producer }) => {
			seen.push(`producer:${sample.id}`);
			// the intended pattern: annotate the sample from application knowledge
			sample.attachments = { participantId: producer.appData.participantId };
		});
		observed.on('consumer-sample-added', ({ sample }) => seen.push(`consumer:${sample.id}`));
		observed.on('data-producer-sample-added', ({ sample }) => seen.push(`dataProducer:${sample.id}`));
		observed.on('data-consumer-sample-added', ({ sample }) => seen.push(`dataConsumer:${sample.id}`));

		const t = fakeWebRtcTransport('t1');

		router.observer.emit('newtransport', t);
		t.observer.emit('newproducer', fakeProducer('p1', { participantId: 'bob' }));
		t.observer.emit('newconsumer', fakeConsumer('c1', 'p1'));
		t.observer.emit('newdataproducer', fakeDataProducer('dp1'));
		t.observer.emit('newdataconsumer', fakeDataConsumer('dc1', 'dp1'));

		expect(seen).toEqual([ 'transport:t1', 'producer:p1', 'consumer:c1', 'dataProducer:dp1', 'dataConsumer:dc1' ]);
		// mutation through the event reached the real sample
		expect(observed.sample.producers[0].attachments).toEqual({ participantId: 'bob' });
	});

	it('emits <entity>-sample-closed when the entity goes away', () => {
		const router = fakeRouter();
		const observed = new ObservedMediasoupRouter({ router });
		const closed: string[] = [];

		observed.on('producer-sample-closed', ({ sample }) => closed.push(`producer:${sample.id}`));
		observed.on('consumer-sample-closed', ({ sample }) => closed.push(`consumer:${sample.id}`));
		observed.on('transport-sample-closed', ({ sample }) => closed.push(`transport:${sample.id}`));

		const t = fakeWebRtcTransport('t1');
		const p = fakeProducer('p1');
		const c = fakeConsumer('c1', 'p1');

		router.observer.emit('newtransport', t);
		t.observer.emit('newproducer', p);
		t.observer.emit('newconsumer', c);

		p.observer.emit('close');
		c.observer.emit('close');
		t.observer.emit('close');

		expect(closed).toEqual([ 'producer:p1', 'consumer:c1', 'transport:t1' ]);
		expect(observed.getProducerSample('p1')?.closedAt).toBeDefined();
	});

	it('the enrich hook mirrors mediasoup appData before the event fires', () => {
		const router = fakeRouter();
		const observed = new ObservedMediasoupRouter({
			router,
			enrich: {
				transport: (t) => ({ transportRole: t.appData.role }),
				producer: (p) => ({ participantId: p.appData.participantId }),
				consumer: (c) => ({ subscriberId: c.appData.subscriberId }),
			},
		});

		let attachmentsAtEventTime: unknown;

		observed.on('producer-sample-added', ({ sample }) => {
			attachmentsAtEventTime = { ...sample.attachments };
			// a handler can build on top of what the enricher already attached
			sample.attachments = { ...sample.attachments, enrichedThenExtended: true };
		});

		const t = fakeWebRtcTransport('t1', { role: 'publishing' });

		router.observer.emit('newtransport', t);
		t.observer.emit('newproducer', fakeProducer('p1', { participantId: 'carol' }));
		t.observer.emit('newconsumer', fakeConsumer('c1', 'p1', { subscriberId: 'dave' }));

		expect(observed.getTransportSample('t1')?.attachments).toEqual({ transportRole: 'publishing' });
		expect(attachmentsAtEventTime).toEqual({ participantId: 'carol' });   // enrichment ran first
		expect(observed.getProducerSample('p1')?.attachments).toEqual({ participantId: 'carol', enrichedThenExtended: true });
		expect(observed.getConsumerSample('c1')?.attachments).toEqual({ subscriberId: 'dave' });
	});

	it('a throwing enricher does not break the router', () => {
		const router = fakeRouter();
		const observed = new ObservedMediasoupRouter({
			router,
			enrich: { producer: () => { throw new Error('boom'); } },
		});
		const t = fakeWebRtcTransport('t1');

		router.observer.emit('newtransport', t);
		expect(() => t.observer.emit('newproducer', fakeProducer('p1'))).not.toThrow();
		expect(observed.getProducerSample('p1')).toBeDefined();
	});

	it('snapshot() detaches, so a report built from it stops changing', () => {
		const router = fakeRouter();
		const observed = new ObservedMediasoupRouter({ router });
		const t = fakeWebRtcTransport('t1');

		router.observer.emit('newtransport', t);
		t.observer.emit('newproducer', fakeProducer('p1'));

		const snapshot = observed.snapshot();

		expect(snapshot.producers).toHaveLength(1);

		// the live sample keeps growing…
		t.observer.emit('newproducer', fakeProducer('p2'));
		expect(observed.sample.producers).toHaveLength(2);
		// …the snapshot does not
		expect(snapshot.producers).toHaveLength(1);

		// and mutating the snapshot cannot corrupt the live sample
		snapshot.producers[0].attachments = { mine: true };
		expect(observed.sample.producers[0].attachments).toBeUndefined();
	});
});
