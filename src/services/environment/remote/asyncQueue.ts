export class AsyncQueue<T> implements AsyncIterable<T> {
	private items: T[] = []
	private resolvers: Array<(r: IteratorResult<T>) => void> = []
	private closed = false
	push(item: T): void {
		const r = this.resolvers.shift()
		if (r) {
			r({ value: item, done: false })
		} else {
			this.items.push(item)
		}
	}
	close(): void {
		this.closed = true
		for (const r of this.resolvers.splice(0)) {
			r({ value: undefined as any, done: true })
		}
	}
	[Symbol.asyncIterator](): AsyncIterator<T> {
		return {
			next: () =>
				new Promise<IteratorResult<T>>((resolve) => {
					if (this.items.length) {
						resolve({ value: this.items.shift()!, done: false })
					} else if (this.closed) {
						resolve({ value: undefined as any, done: true })
					} else {
						this.resolvers.push(resolve)
					}
				}),
		}
	}
}
