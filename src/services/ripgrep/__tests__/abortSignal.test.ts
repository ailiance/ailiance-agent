import { regexSearchFiles } from "@services/ripgrep"
import { strict as assert } from "assert"
import { describe, it } from "mocha"

/**
 * S2-B plumbing test: regexSearchFiles must respect a pre-aborted AbortSignal
 * and reject with AbortError without spawning the rg binary.
 *
 * We deliberately do NOT exercise the in-flight kill path here because that
 * would require shelling out to a real `rg` instance and tying the test to
 * the host's binary layout. The signal-already-aborted path is the only
 * branch worth a deterministic unit test; the SIGTERM bridge is covered by
 * code review + manual smoke (rg on a huge tree, abort mid-flight).
 */
describe("regexSearchFiles AbortSignal (S2-B)", () => {
	it("rejects with AbortError when signal is already aborted", async () => {
		const ctrl = new AbortController()
		ctrl.abort()

		let thrown: unknown
		try {
			await regexSearchFiles("/tmp", "/tmp", "never-matches", "*", undefined, undefined, 0, undefined, ctrl.signal)
		} catch (e) {
			thrown = e
		}

		assert.ok(thrown instanceof Error, "expected an Error to be thrown")
		assert.equal((thrown as Error).name, "AbortError")
	})

	it("does not throw AbortError when no signal is provided", async () => {
		// Sanity: backward-compat — calling without a signal must not change
		// behavior. We point at /tmp with a regex unlikely to match anything
		// real; if rg is missing on the host, this will throw a generic
		// "Error calling ripgrep" wrapper which is also acceptable here —
		// what we assert is the *absence* of AbortError contamination.
		try {
			await regexSearchFiles("/tmp", "/tmp", "never-matches-xyzzy-123", "*")
		} catch (e) {
			assert.notEqual((e as Error).name, "AbortError")
		}
	})
})
