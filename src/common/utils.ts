
export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>

export type Writable<T> = T extends object ? { -readonly [K in keyof T]: Writable<T[K]> } : T;
