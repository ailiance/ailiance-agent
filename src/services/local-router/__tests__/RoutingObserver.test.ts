import * as assert from "assert"
import { routingObserver } from "../RoutingObserver"
import type { RoutingEvent } from "../RoutingObserver"

const makeEvent = (overrides: Partial<RoutingEvent> = {}): RoutingEvent => ({
	ts: Date.now(),
	category: "general",
	workerId: "test-worker",
	cacheHit: false,
	estTokens: 10,
	...overrides,
})

describe("RoutingObserver", () => {
	beforeEach(() => {
		routingObserver.reset()
	})

	it("subscribe + emit invokes the listener", () => {
		const received: RoutingEvent[] = []
		routingObserver.subscribe((e) => received.push(e))
		const event = makeEvent({ workerId: "tower-gemma" })
		routingObserver.emit(event)
		assert.strictEqual(received.length, 1)
		assert.strictEqual(received[0].workerId, "tower-gemma")
	})

	it("unsubscribe removes the listener", () => {
		const received: RoutingEvent[] = []
		const unsub = routingObserver.subscribe((e) => received.push(e))
		unsub()
		routingObserver.emit(makeEvent())
		assert.strictEqual(received.length, 0)
	})

	it("last() returns the most recent event", () => {
		assert.strictEqual(routingObserver.last(), null)
		const e1 = makeEvent({ workerId: "w1" })
		const e2 = makeEvent({ workerId: "w2" })
		routingObserver.emit(e1)
		routingObserver.emit(e2)
		assert.strictEqual(routingObserver.last()?.workerId, "w2")
	})

	it("getHistory() caps at 50 entries", () => {
		for (let i = 0; i < 55; i++) {
			routingObserver.emit(makeEvent({ estTokens: i }))
		}
		const history = routingObserver.getHistory()
		assert.strictEqual(history.length, 50)
		// Oldest should have been dropped — first entry should have estTokens >= 5
		assert.ok(history[0].estTokens >= 5)
	})

	it("exception in listener does not crash emit", () => {
		routingObserver.subscribe(() => {
			throw new Error("listener error")
		})
		const received: RoutingEvent[] = []
		routingObserver.subscribe((e) => received.push(e))
		assert.doesNotThrow(() => routingObserver.emit(makeEvent()))
		assert.strictEqual(received.length, 1)
	})

	it("reset() clears all state", () => {
		const received: RoutingEvent[] = []
		routingObserver.subscribe((e) => received.push(e))
		routingObserver.emit(makeEvent())
		routingObserver.reset()
		assert.strictEqual(routingObserver.last(), null)
		assert.strictEqual(routingObserver.getHistory().length, 0)
		// Listener cleared — emit after reset should not call old listener
		routingObserver.emit(makeEvent())
		assert.strictEqual(received.length, 1) // only the one before reset
	})
})
