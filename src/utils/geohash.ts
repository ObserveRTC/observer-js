/** A point on the earth, as an application reports it for one client. */
export type ClientLocation = {
	latitude: number;
	longitude: number;
};

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

/**
 * Approximate cell width at each geohash length, for choosing a precision.
 *
 * Index is the character count; the value is the rough cell size at the equator. Cells are taller
 * than they are wide at high latitudes, so treat these as an order of magnitude, not a radius.
 */
export const GEOHASH_CELL_SIZES = [
	'',
	'~5000 km',
	'~1250 km',
	'~156 km',
	'~39 km',
	'~5 km',
	'~1.2 km',
	'~150 m',
] as const;

/**
 * Encode a point as a geohash of `precision` characters — a **grid cell key**, not a cluster.
 *
 * ### Why cells rather than "within N kilometres"
 *
 * Grouping clients "within a radius" sounds like the natural thing and is a much worse fit. It is a
 * clustering problem, not a keying one: the groups depend on which client you start from, two
 * clients can each be within the radius of a third but not of each other, group identity is not
 * stable as participants join and leave, and maintaining it costs pairwise distance work. None of
 * that survives contact with a detector that has to produce the *same* group name on every tick so
 * a cooldown and a control group mean anything.
 *
 * A geohash prefix is a plain function of the coordinates: O(1), stable for the life of the client,
 * and usable directly as a population label. The honest cost is that a cell boundary can separate
 * two clients who are physically adjacent, which splits a real group into two smaller ones. That
 * biases towards **missing** a finding rather than inventing one, which is the right direction for
 * something that raises issues.
 *
 * Returns `undefined` for coordinates that are not finite or not on the earth, rather than encoding
 * nonsense into a plausible-looking cell key.
 */
export function geohash(location: ClientLocation, precision = 3): string | undefined {
	const { latitude, longitude } = location;

	if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined;
	if (latitude < -90 || 90 < latitude) return undefined;
	if (longitude < -180 || 180 < longitude) return undefined;
	if (!Number.isFinite(precision) || precision < 1) return undefined;

	const chars = Math.min(12, Math.floor(precision));
	const latRange = { min: -90, max: 90 };
	const lonRange = { min: -180, max: 180 };

	let hash = '';
	let bits = 0;
	let value = 0;
	let isLongitude = true;

	while (hash.length < chars) {
		// Geohash interleaves longitude and latitude bits, longitude first.
		const range = isLongitude ? lonRange : latRange;
		const mid = (range.min + range.max) / 2;
		const coordinate = isLongitude ? longitude : latitude;

		if (mid <= coordinate) {
			value = (value << 1) + 1;
			range.min = mid;
		} else {
			value <<= 1;
			range.max = mid;
		}

		isLongitude = !isLongitude;

		if (++bits === 5) {
			hash += BASE32[value];
			bits = 0;
			value = 0;
		}
	}

	return hash;
}
