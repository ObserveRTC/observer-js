import { ObserverStorage } from './ObserverStorage';

export class SimpleStorage<K, V> implements ObserverStorage<K, V> {
	private _map = new Map<K, V>();

	public constructor(public readonly id: string) {}

	public size(): Promise<number> {
		return Promise.resolve(this._map.size);
	}

	public clear(): Promise<void> {
		this._map.clear();

		return Promise.resolve();
	}

	public get(key: K): Promise<V | undefined> {
		return Promise.resolve(this._map.get(key));
	}

	public getAll(keys: Iterable<K>): Promise<ReadonlyMap<K, V>> {
		const result = new Map<K, V>();

		for (const key of keys) {
			const value = this._map.get(key);

			if (value) {
				result.set(key, value);
			}
		}
		
		return Promise.resolve(result);
	}

	public set(key: K, value: V): Promise<V | undefined> {
		const result = this._map.get(key);

		this._map.set(key, value);
		
		return Promise.resolve(result);
	}

	public setAll(entries: ReadonlyMap<K, V>): Promise<ReadonlyMap<K, V>> {
		const result = new Map<K, V>();

		for (const [ key, value ] of entries) {
			const oldValue = this._map.get(key);

			if (oldValue) {
				result.set(key, oldValue);
			}
			this._map.set(key, value);
		}
		
		return Promise.resolve(result);
	}

	public insert(key: K, value: V): Promise<V | undefined> {
		const result = this._map.get(key);

		if (result) {
			return Promise.resolve(result);
		}
		this._map.set(key, value);

		return Promise.resolve(undefined);
	}

	public insertAll(entries: ReadonlyMap<K, V>): Promise<ReadonlyMap<K, V>> {
		const result = new Map<K, V>();

		for (const [ key, value ] of entries) {
			const oldValue = this._map.get(key);

			if (oldValue) {
				result.set(key, oldValue);
			} else {
				this._map.set(key, value);
			}
		}
		
		return Promise.resolve(result);
	}

	public remove(key: K): Promise<V | undefined> {
		const result = this._map.get(key);

		this._map.delete(key);
		
		return Promise.resolve(result);
	}

	public removeAll(keys: Iterable<K>): Promise<ReadonlyMap<K, V>> {
		const result = new Map<K, V>();

		for (const key of keys) {
			const value = this._map.get(key);

			this._map.delete(key);
			if (value) {
				result.set(key, value);
			}
		}
		
		return Promise.resolve(result);
	}

	public async *[Symbol.asyncIterator](): AsyncIterableIterator<[K, V]> {
		await Promise.resolve();
		
		for (const entry of this._map.entries()) {
			yield entry;
		}
	}

	public localEntries(): IterableIterator<[K, V]> {
		return this._map.entries();
	}
}
