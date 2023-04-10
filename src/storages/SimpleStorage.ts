import { ObserverStorage } from './ObserverStorage';

export class SimpleStorage<K, V> implements ObserverStorage<K, V> {
	private _map = new Map<K, V>();

	public constructor(public readonly id: string) {}

	public async size(): Promise<number> {
		return this._map.size;
	}

	public async clear(): Promise<void> {
		this._map.clear();
	}

	public async get(key: K): Promise<V | undefined> {
		return this._map.get(key);
	}

	public async getAll(keys: Iterable<K>): Promise<ReadonlyMap<K, V>> {
		const result = new Map<K, V>();
		for (const key of keys) {
			const value = this._map.get(key);
			if (value) {
				result.set(key, value);
			}
		}
		return result;
	}

	public async set(key: K, value: V): Promise<V | undefined> {
		const result = this._map.get(key);
		this._map.set(key, value);
		return result;
	}

	public async setAll(entries: ReadonlyMap<K, V>): Promise<ReadonlyMap<K, V>> {
		const result = new Map<K, V>();
		for (const [key, value] of entries) {
			const oldValue = this._map.get(key);
			if (oldValue) {
				result.set(key, oldValue);
			}
			this._map.set(key, value);
		}
		return result;
	}

	public async insert(key: K, value: V): Promise<V | undefined> {
		const result = this._map.get(key);
		if (result) {
			return result;
		}
		this._map.set(key, value);
	}

	public async insertAll(entries: ReadonlyMap<K, V>): Promise<ReadonlyMap<K, V>> {
		const result = new Map<K, V>();
		for (const [key, value] of entries) {
			const oldValue = this._map.get(key);
			if (oldValue) {
				result.set(key, oldValue);
			} else {
				this._map.set(key, value);
			}
		}
		return result;
	}

	public async remove(key: K): Promise<V | undefined> {
		const result = this._map.get(key);
		this._map.delete(key);
		return result;
	}

	public async removeAll(keys: Iterable<K>): Promise<ReadonlyMap<K, V>> {
		const result = new Map<K, V>();
		for (const key of keys) {
			const value = this._map.get(key);
			this._map.delete(key);
			if (value) {
				result.set(key, value);
			}
		}
		return result;
	}

	public async *[Symbol.asyncIterator](): AsyncIterableIterator<[K, V]> {
		for (const entry of this._map.entries()) {
			yield entry;
		}
	}
}
