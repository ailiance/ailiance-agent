// ailiance-agent fork: telemetry phone-home regression test.
// Asserts that the telemetry config ships with no apiKey/host so the
// EU-sovereign fork never sends events to dirac.run / posthog.

import { isaacTelemetryConfig, isIsaacTelemetryConfigValid } from "@shared/services/config/isaac-telemetry-config"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

describe("ailiance-agent fork: telemetry is disabled at the config layer", () => {
	it("ships without a hardcoded telemetry apiKey", () => {
		expect(isaacTelemetryConfig.apiKey).toBeFalsy()
	})

	it("ships without a hardcoded error-tracking apiKey", () => {
		expect(isaacTelemetryConfig.errorTrackingApiKey).toBeFalsy()
	})

	it("ships with empty host / uiHost so no upstream URL is reachable", () => {
		expect(isaacTelemetryConfig.host).toBe("")
		expect(isaacTelemetryConfig.uiHost).toBe("")
	})

	it("isIsaacTelemetryConfigValid returns false on the shipped config", () => {
		expect(isIsaacTelemetryConfigValid(isaacTelemetryConfig)).toBe(false)
	})
})

describe("ailiance-agent fork: providers no-op when config is invalid", () => {
	let fetchSpy: ReturnType<typeof vi.spyOn>

	beforeEach(() => {
		fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }))
	})

	afterEach(() => {
		fetchSpy.mockRestore()
	})

	it("IsaacTelemetryProvider.logRequired issues zero fetches when apiKey is missing", async () => {
		const { IsaacTelemetryProvider } = await import("@services/telemetry/providers/IsaacTelemetryProvider")
		const provider = new IsaacTelemetryProvider()
		// logRequired is the most aggressive code path — it bypasses isEnabled
		// and goes straight to captureToIsaac. The only thing that should stop
		// the fetch is the apiKey guard inside captureToIsaac.
		provider.logRequired("ailiance_agent_phone_home_probe", { foo: "bar" })
		// Allow any pending microtask in captureToIsaac to flush.
		await new Promise((r) => setImmediate(r))
		expect(fetchSpy).not.toHaveBeenCalled()
	})

	it("IsaacFeatureFlagsProvider.getAllFlagsAndPayloads issues zero fetches when apiKey is missing", async () => {
		const { IsaacFeatureFlagsProvider } = await import("@services/feature-flags/providers/IsaacFeatureFlagsProvider")
		const provider = new IsaacFeatureFlagsProvider()
		await provider.getAllFlagsAndPayloads({}).catch(() => {})
		expect(fetchSpy).not.toHaveBeenCalled()
	})
})
