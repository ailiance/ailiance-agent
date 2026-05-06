import http from "node:http"
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

	it("starts local server even when no webview-ui build dir", async () => {
		// No AKI_WEBUI_URL, no webview-ui/build — landing should still be served
		const server = new WebuiServer()
		const status = await server.start()
		expect(status.running).to.equal(true)
		expect(status.external).to.equal(false)
		expect(status.url).to.match(/^http:\/\/127\.0\.0\.1:\d+$/)
		await server.stop()
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

	describe("HTTP endpoints", () => {
		let server: WebuiServer
		let port: number

		beforeEach(async () => {
			server = new WebuiServer()
			const status = await server.start()
			port = status.port!
		})

		afterEach(async () => {
			await server.stop()
		})

		function get(path: string): Promise<{ status: number; body: string; contentType: string }> {
			return new Promise((resolve, reject) => {
				http.get(`http://127.0.0.1:${port}${path}`, (res) => {
					let body = ""
					res.on("data", (chunk: Buffer) => {
						body += chunk.toString()
					})
					res.on("end", () => {
						resolve({
							status: res.statusCode ?? 0,
							body,
							contentType: (res.headers["content-type"] as string) ?? "",
						})
					})
				}).on("error", reject)
			})
		}

		it("GET / returns landing page containing agent-kiki heading", async () => {
			const { status, body, contentType } = await get("/")
			expect(status).to.equal(200)
			expect(contentType).to.include("text/html")
			expect(body).to.include("<h1>agent-kiki</h1>")
		})

		it("GET /api/version returns current version string", async () => {
			const { status, body, contentType } = await get("/api/version")
			expect(status).to.equal(200)
			expect(contentType).to.include("text/plain")
			// version is either a semver string or "?"
			expect(body.trim()).to.match(/^\d+\.\d+\.\d+$|^\?$/)
		})

		it("GET /spa returns HTML (SPA build present) or 503 (build absent)", async () => {
			const { status, contentType } = await get("/spa")
			// Build exists in dev tree → 200 with HTML; absent in CI → 503
			expect([200, 503]).to.include(status)
			if (status === 200) {
				expect(contentType).to.include("text/html")
			}
		})
	})
})
