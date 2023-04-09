
export interface ObserverStorage<K, V> {

	/**
     * The identifer of the storage
     */
    readonly id: string;

    /**
     * The number of entries the storage has
     *
     * @return The number of entries the Storage has
     */
    size(): Promise<number>;

    /**
     * Clear the storage and evict all entries
     */
    clear(): Promise<void>;

    /**
     * 
     * @param key the key tried to be accessed to in the storage
     * @returns the value of undefined if entry was not found
     */
    get(key: K): Promise<V | undefined>;

    /**
     * 
     * @param keys set of keys tried to be retrieved from the storage
     * @returns a map filled with key, value pair found in the storage
     */
    getAll(keys: Iterable<K>): Promise<ReadonlyMap<K, V>>;
    
    set(key: K, value: V): Promise<V | undefined>;
    setAll(entries: ReadonlyMap<K, V>): Promise<ReadonlyMap<K, V>>;

    insert(key: K, value: V): Promise<V | undefined>;
    insertAll(entries: ReadonlyMap<K, V>): Promise<ReadonlyMap<K, V>>;

    remove(key: K): Promise<V | undefined>;
    removeAll(keys: Iterable<K>): Promise<ReadonlyMap<K, V>>;

    [Symbol.asyncIterator](): AsyncIterableIterator<[K, V]>;

}