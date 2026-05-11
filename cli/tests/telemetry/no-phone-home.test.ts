// ailiance-agent fork: telemetry phone-home regression test.
// Asserts that the telemetry config ships with no apiKey/host so the
// EU-sovereign fork never sends events to dirac.run / posthog.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
	diracTelemetryConfig,
	isDiracTelemetryConfigValid,
} from "@shared/services/config/dirac-telemetry-config"

describe("ailiance-agent fork: telemetry is disabled at the config layer", () => {
	it("ships without a hardcoded telemetry apiKey", () => {
		expect(diracTelemetryConfig.apiKey).toBeFalsy()
	})

	it("ships without a hardcoded error-tracking apiKey", () => {
		expect(diracTelemetryConfig.errorTrackingApiKey).toBeFalsy()
	})

	it("ships with empty host / uiHost so no upstream URL is reachable", () => {
		expect(diracTelemetryConfig.host).toBe("")
		expect(diracTelemetryConfig.uiHost).toBe("")
	})

	it("isDiracTelemetryConfigValid returns false on the shipped config", () => {
		expect(isDiracTelemetryConfigValid(diracTelemetryConfig)).toBe(false)
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

	it("DiracTelemetryProvider.logRequired issues zero fetches when apiKey is missing", async () => {
		const { DiracTelemetryProvider } = await import("@services/telemetry/providers/DiracTelemetryProvider")
		const provider = new DiracTelemetryProvider()
		// logRequired is the most aggressive code path — it bypasses isEnabled
		// and goes straight to captureToDirac. The only thing that should stop
		// the fetch is the apiKey guard inside captureToDirac.
		provider.logRequired("ailiance_agent_phone_home_probe", { foo: "bar" })
		// Allow any pending microtask in captureToDirac to flush.
		await new Promise((r) => setImmediate(r))
		expect(fetchSpy).not.toHaveBeenCalled()
	})

	it("DiracFeatureFlagsProvider.getAllFlagsAndPayloads issues zero fetches when apiKey is missing", async () => {
		const { DiracFeatureFlagsProvider } = await import("@services/feature-flags/providers/DiracFeatureFlagsProvider")
		const provider = new DiracFeatureFlagsProvider()
		await provider.getAllFlagsAndPayloads({}).catch(() => {})
		expect(fetchSpy).not.toHaveBeenCalled()
	})
})
