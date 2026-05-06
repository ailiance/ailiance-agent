import { expect } from "chai"
import { WebuiServer } from "../WebuiServer"

describe("WebuiServer", () => {
	afterEach(() => {
		delete process.env.AKI_WEBUI_URL
	})

	it("returns external mode when AKI_WEBUI_URL is set", async () => {
		process.env.AKI_WEBUI_URL = "http://localhost:3000"
		const server = new WebuiServer()
		const status = await server.start()
		expect(status.running).to.equal(true)
		expect(status.external).to.equal(true)
		expect(status.url).to.equal("http://localhost:3000")
	})

	it("returns running:false when no env var and no build dir", async () => {
		// No AKI_WEBUI_URL, no webview-ui/build in the test tree
		// WebuiServer.findBuildDir() will find no index.html and return null
		const server = new WebuiServer()
		// Override findBuildDir via a subclass to force null
		const result = await (server as any).findBuildDir.call({
			findBuildDir: async () => null,
		})
		// Direct test of spawnLocal path: when buildDir is null, returns running:false
		const status = await (server as any).spawnLocal.call({
			findBuildDir: async () => null,
			findFreePort: () => Promise.resolve(25463),
		})
		expect(status.running).to.equal(false)
		expect(status.external).to.equal(false)
	})

	it("findFreePort returns a valid port number", async () => {
		const server = new WebuiServer()
		const port = await (server as any).findFreePort(25463)
		expect(port).to.be.a("number")
		expect(port).to.be.greaterThanOrEqual(25463)
		expect(port).to.be.lessThanOrEqual(25563)
	})

	it("status() returns running:false before start()", () => {
		const server = new WebuiServer()
		const s = server.status()
		expect(s.running).to.equal(false)
		expect(s.external).to.equal(false)
	})

	it("status() returns external url after start() with AKI_WEBUI_URL", async () => {
		process.env.AKI_WEBUI_URL = "http://example.com:4000"
		const server = new WebuiServer()
		await server.start()
		const s = server.status()
		expect(s.running).to.equal(true)
		expect(s.url).to.equal("http://example.com:4000")
		expect(s.external).to.equal(true)
	})
})
