class Queue {
    private q: any[] = []
    // just remember last 10 records
    private readonly maxSize = 10
    public add(value: any) {
        this.q.push(value)
        if (this.size() > this.maxSize) {
            this.pool()
        }
    }
    public peek(): any {
        if (this.size() === 0) {
            return undefined
        }
        return this.q[0]
    }

    public pool(): any {
        if (this.size() === 0) {
            return undefined
        }
        const firstElement = this.q.shift()
        return firstElement
    }

    public size(): number {
        return this.q.length
    }

    public clear() {
        this.q = []
    }
}

export default Queue
