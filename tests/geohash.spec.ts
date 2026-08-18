import { geohash } from '../src/utils/geohash';

/**
 * `geohash` — the grouping key behind `ClientPopulationIssueDetector`'s `location` axis.
 *
 * Two properties matter for that use, and neither is "is this a correct geohash" in the abstract:
 * nearby points must share a prefix (so a cell is a *place*), and garbage input must not encode into
 * a plausible-looking cell.
 */
describe('geohash', () => {
	// The canonical example: geohash of the Empire State Building area.
	it('encodes a known point', () => {
		expect(geohash({ latitude: 42.6, longitude: -5.6 }, 5)).toBe('ezs42');
	});

	it('is stable — the same point always gives the same key', () => {
		const point = { latitude: 47.4979, longitude: 19.0402 };

		expect(geohash(point, 4)).toBe(geohash(point, 4));
	});

	// This is the property the detector relies on: one cell key per place, shared by its occupants.
	it('gives nearby points the same cell, and distant points different ones', () => {
		const budapest = { latitude: 47.4979, longitude: 19.0402 };
		const alsoBudapest = { latitude: 47.5100, longitude: 19.0600 };
		const london = { latitude: 51.5074, longitude: -0.1278 };

		expect(geohash(alsoBudapest, 3)).toBe(geohash(budapest, 3));
		expect(geohash(london, 3)).not.toBe(geohash(budapest, 3));
	});

	it('gets more specific as precision grows, keeping the coarser key as a prefix', () => {
		const point = { latitude: 47.4979, longitude: 19.0402 };
		const coarse = geohash(point, 3)!;
		const fine = geohash(point, 6)!;

		expect(fine).toHaveLength(6);
		expect(fine.startsWith(coarse)).toBe(true);
	});

	// A detector that grouped clients under a cell key derived from NaN would report a "place" that
	// does not exist, and every client with bad coordinates would look like each other's neighbour.
	it('refuses coordinates that are not finite or not on the earth', () => {
		expect(geohash({ latitude: NaN, longitude: 19 })).toBeUndefined();
		expect(geohash({ latitude: 47, longitude: Infinity })).toBeUndefined();
		expect(geohash({ latitude: 91, longitude: 19 })).toBeUndefined();
		expect(geohash({ latitude: 47, longitude: -181 })).toBeUndefined();
		expect(geohash({ latitude: 47, longitude: 19 }, 0)).toBeUndefined();
	});

	it('handles the extremes without throwing', () => {
		expect(geohash({ latitude: 90, longitude: 180 }, 3)).toHaveLength(3);
		expect(geohash({ latitude: -90, longitude: -180 }, 3)).toHaveLength(3);
		expect(geohash({ latitude: 0, longitude: 0 }, 3)).toHaveLength(3);
	});

	it('caps precision so a huge value cannot spin', () => {
		expect(geohash({ latitude: 47, longitude: 19 }, 1000)).toHaveLength(12);
	});
});
