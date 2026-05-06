import { strict as assert } from "assert"
import { describe, it } from "mocha"
import { AutoModeSelector, autoModeSelector } from "../AutoModeSelector"

describe("AutoModeSelector", () => {
	describe("classify", () => {
		it("returns 'act' for short greeting 'bonjour'", () => {
			assert.strictEqual(autoModeSelector.classify("bonjour"), "act")
		})

		it("returns 'act' for short greeting 'salut'", () => {
			assert.strictEqual(autoModeSelector.classify("salut"), "act")
		})

		it("returns 'act' for 'liste les fichiers'", () => {
			assert.strictEqual(autoModeSelector.classify("liste les fichiers"), "act")
		})

		it("returns 'act' for 'montre moi le code'", () => {
			assert.strictEqual(autoModeSelector.classify("montre moi le code"), "act")
		})

		it("returns 'plan' for 'refactor cette fonction'", () => {
			assert.strictEqual(autoModeSelector.classify("refactor cette fonction"), "plan")
		})

		it("returns 'plan' for 'audit le code'", () => {
			assert.strictEqual(autoModeSelector.classify("audit le code"), "plan")
		})

		it("returns 'plan' for 'review the architecture'", () => {
			assert.strictEqual(autoModeSelector.classify("review the architecture"), "plan")
		})

		it("returns 'plan' for 'comment ferais-tu pour...'", () => {
			assert.strictEqual(autoModeSelector.classify("comment ferais-tu pour gérer les erreurs ?"), "plan")
		})

		it("returns 'plan' for 'architecture du projet'", () => {
			assert.strictEqual(autoModeSelector.classify("architecture du projet"), "plan")
		})

		it("returns 'plan' for 'analyse ce fichier'", () => {
			assert.strictEqual(autoModeSelector.classify("analyse ce fichier"), "plan")
		})

		it("returns null for empty string", () => {
			assert.strictEqual(autoModeSelector.classify(""), null)
		})

		it("returns null for whitespace-only string", () => {
			assert.strictEqual(autoModeSelector.classify("   "), null)
		})

		it("returns null for a prompt with no strong signal", () => {
			assert.strictEqual(autoModeSelector.classify("quelle est la météo aujourd'hui ?"), null)
		})

		it("does not switch to act for a very long act-keyword prompt", () => {
			// prompt > 120 chars with an act keyword — no strong enough signal
			const longPrompt =
				"liste tous les éléments disponibles dans le projet et donne moi une description complète et détaillée pour chacun avec des exemples"
			assert.strictEqual(autoModeSelector.classify(longPrompt), null)
		})

		it("switches to act for imperative verbs regardless of length", () => {
			const longImperative =
				"fais la structure de dossier complète pour ce projet en esp-idf et kicad avec une bonne organisation"
			assert.strictEqual(autoModeSelector.classify(longImperative), "act")
		})
	})

	describe("lastUserPrompt", () => {
		it("returns the last user message content", () => {
			const messages = [
				{ role: "user", content: "premier message" },
				{ role: "assistant", content: "réponse" },
				{ role: "user", content: "deuxième message" },
			]
			assert.strictEqual(AutoModeSelector.lastUserPrompt(messages), "deuxième message")
		})

		it("skips non-string content", () => {
			const messages = [
				{ role: "user", content: "premier message" },
				{ role: "user", content: [{ type: "text", text: "complex content" }] },
			]
			assert.strictEqual(AutoModeSelector.lastUserPrompt(messages), "premier message")
		})

		it("returns empty string when no user messages", () => {
			const messages = [{ role: "assistant", content: "réponse" }]
			assert.strictEqual(AutoModeSelector.lastUserPrompt(messages), "")
		})

		it("returns empty string for empty messages array", () => {
			assert.strictEqual(AutoModeSelector.lastUserPrompt([]), "")
		})
	})
})
