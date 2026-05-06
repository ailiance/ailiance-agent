import * as assert from "assert"
import { PromptClassifier } from "../PromptClassifier"

describe("PromptClassifier", () => {
	let classifier: PromptClassifier

	beforeEach(() => {
		classifier = new PromptClassifier()
	})

	const msg = (content: string) => [{ role: "user", content }]

	it("classifies code via fenced code block", () => {
		assert.strictEqual(classifier.classify(msg("Here is my issue:\n```python\nprint('hi')\n```")), "code")
	})

	it("classifies code via keyword 'implement'", () => {
		assert.strictEqual(classifier.classify(msg("Can you implement a binary search?")), "code")
	})

	it("classifies French via stop words", () => {
		assert.strictEqual(classifier.classify(msg("Comment est-ce que je peux faire ça ?")), "fr")
	})

	it("classifies French via 'les'", () => {
		assert.strictEqual(classifier.classify(msg("Quels sont les avantages de TypeScript ?")), "fr")
	})

	it("classifies reasoning via 'step by step'", () => {
		assert.strictEqual(classifier.classify(msg("Explain step by step why this proof works")), "reason")
	})

	it("returns general for empty or unclassified content", () => {
		assert.strictEqual(classifier.classify(msg("Hello, how are you?")), "general")
		assert.strictEqual(classifier.classify([]), "general")
	})

	it("uses last user message, ignoring assistant turns", () => {
		const messages = [
			{ role: "user", content: "def foo(): pass" },
			{ role: "assistant", content: "Sure!" },
			{ role: "user", content: "Pourquoi est-ce que ça marche ?" },
		]
		// Last user message is French
		assert.strictEqual(classifier.classify(messages), "fr")
	})
})
