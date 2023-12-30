/**
 * The `ObserverStorage` interface defines the methods used for managing storage of key-value pairs.
 */
export interface ObserverStorage<K, V> {

	/**
	 * The identifier of the storage
	 */
	readonly id: string;

	/**
	 * Returns the number of entries the storage has.
	 */
	size(): Promise<number>;

	/**
	 * Clears the storage and evicts all entries.
	 */
	clear(): Promise<void>;

	/**
	 * Retrieves the value associated with the given key or returns undefined if the entry is not found.
	 *
	 * @param key The key to be accessed in the storage.
	 * @returns The value or undefined if the entry was not found.
	 */
	get(key: K): Promise<V | undefined>;

	/**
	 * Retrieves a map filled with key-value pairs found in the storage for the given keys.
	 *
	 * @param keys A set of keys to be retrieved from the storage.
	 * @returns A ReadonlyMap containing the key-value pairs found in the storage.
	 */
	getAll(keys: Iterable<K>): Promise<ReadonlyMap<K, V>>;

	/**
	 * Sets the value for the specified key and returns the previous value or undefined.
	 *
	 * @param key The key to be set.
	 * @param value The value to be set.
	 * @returns The previous value or undefined.
	 */
	set(key: K, value: V): Promise<V | undefined>;

	/**
	 * Sets all the key-value pairs in the provided ReadonlyMap.
	 *
	 * @param entries A ReadonlyMap containing the key-value pairs to be set.
	 * @returns A Promise of the ReadonlyMap containing the key-value pairs.
	 */
	setAll(entries: ReadonlyMap<K, V>): Promise<ReadonlyMap<K, V>>;

	/**
	 * Inserts a key-value pair only if the key does not already exist and returns the value or undefined.
	 *
	 * @param key The key to be inserted.
	 * @param value The value to be inserted.
	 * @returns The value already stored in the storage, or undefined if there was no value stored for the given key.
	 */
	insert(key: K, value: V): Promise<V | undefined>;

	/**
	 * Inserts all key-value pairs in the provided ReadonlyMap only if the keys do not already exist.
	 * Returns a ReadonlyMap containing the values already stored in the storage for the given keys,
	 * or undefined for each key that had no value stored.
	 *
	 * @param entries A ReadonlyMap containing the key-value pairs to be inserted.
	 * @returns A Promise of the ReadonlyMap containing the values already stored in the storage for the given keys,
	 *          or undefined for each key that had no value stored.
	 */
	insertAll(entries: ReadonlyMap<K, V>): Promise<ReadonlyMap<K, V | undefined>>;

	/**
	 * Removes the key-value pair associated with the specified key and returns the removed value or undefined.
	 *
	 * @param key The key to be removed.
	 * @returns The removed value or undefined.
	 */
	remove(key: K): Promise<V | undefined>;

	/**
	 * Removes all key-value pairs associated with the specified keys and returns a ReadonlyMap of the removed pairs.
	 *
	 * @param keys An iterable of keys to be removed.
	 * @returns A Promise of the ReadonlyMap containing the removed key-value pairs.
	 */
	removeAll(keys: Iterable<K>): Promise<ReadonlyMap<K, V>>;

	/**
	 * Returns an async iterable iterator for the key-value pairs in the storage.
	 */
	[Symbol.asyncIterator](): AsyncIterableIterator<[K, V]>;

	/**
	 * Returns an iterable iterator for the key-value pairs stored in this local instance of the storage.
	 */
	localEntries(): IterableIterator<[K, V]>;
}
