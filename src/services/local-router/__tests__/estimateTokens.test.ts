import { expect } from "chai"
import { describe, it } from "mocha"
import { estimateTokens } from "../estimateTokens"

describe("estimateTokens", () => {
	it("rough chars/4 estimation with 20% buffer", () => {
		const t = estimateTokens({ messages: [{ role: "user", content: "a".repeat(100) }] })
		// 108 chars / 4 * 1.2 ≈ 33
		expect(t).to.be.greaterThan(20)
		expect(t).to.be.lessThan(50)
	})

	it("includes max_tokens in budget", () => {
		const t1 = estimateTokens({ messages: [{ role: "user", content: "hi" }] })
		const t2 = estimateTokens({ messages: [{ role: "user", content: "hi" }], max_tokens: 1000 })
		expect(t2 - t1).to.equal(1000)
	})

	it("multi-message accumulation", () => {
		const t = estimateTokens({
			messages: [
				{ role: "system", content: "x".repeat(400) },
				{ role: "user", content: "y".repeat(200) },
			],
		})
		expect(t).to.be.greaterThan(150)
	})
})
