import { type ChildProcess, spawn } from "node:child_process"
import { promises as fs } from "node:fs"
import { createServer } from "node:net"
import path from "node:path"

/**
 * Resolve the directory of this module, compatible with both CJS (mocha tests)
 * and ESM (CLI runtime). We avoid import.meta.url at module level since the
 * unit-test tsconfig compiles to CommonJS where import.meta is unavailable.
 */
function resolveModuleDir(): string {
	// In CJS context (ts-node / mocha), __dirname is a real variable
	if (typeof __dirname === "string") {
		return __dirname
	}
	// In ESM context, use import.meta — wrapped in Function to prevent tsc
	// from transforming it in CJS mode (ts-node evaluates this lazily)
	try {
		// biome-ignore lint: intentional runtime ESM detection
		const meta = new Function("return import.meta")() as { url: string }
		const { fileURLToPath } = require("node:url") as typeof import("node:url")
		return path.dirname(fileURLToPath(meta.url))
	} catch {
		// Absolute fallback: resolve from cwd (works when source is co-located)
		return path.resolve(process.cwd(), "src", "services", "webui")
	}
}

export interface WebuiServerStatus {
	running: boolean
	url?: string
	port?: number
	external: boolean // true if AKI_WEBUI_URL set, no spawn
}

export class WebuiServer {
	private childProcess: ChildProcess | null = null
	private port: number | null = null
	private externalUrl: string | null = null

	/**
	 * Resolve the webui URL.
	 * - If AKI_WEBUI_URL env var is set → use it (no spawn)
	 * - Else → spawn a static file server in background and return its URL
	 */
	async start(): Promise<WebuiServerStatus> {
		const fromEnv = process.env.AKI_WEBUI_URL?.trim()
		if (fromEnv) {
			this.externalUrl = fromEnv
			return { running: true, url: fromEnv, external: true }
		}
		return this.spawnLocal()
	}

	private async spawnLocal(): Promise<WebuiServerStatus> {
		const buildDir = await this.findBuildDir()
		if (!buildDir) {
			return { running: false, external: false }
		}
		const port = await this.findFreePort(25463)
		const moduleDir = resolveModuleDir()
		const serverScript = path.join(moduleDir, "webui-static-server.cjs")
		const proc = spawn(process.execPath, [serverScript, buildDir, String(port)], {
			stdio: "ignore",
			detached: true,
		})
		proc.unref()
		this.childProcess = proc
		this.port = port
		return { running: true, url: `http://127.0.0.1:${port}`, port, external: false }
	}

	private async findBuildDir(): Promise<string | null> {
		const moduleDir = resolveModuleDir()
		// Try several locations relative to this module at runtime
		const candidates = [
			path.resolve(moduleDir, "..", "..", "..", "webview-ui", "build"),
			path.resolve(moduleDir, "..", "..", "webview-ui", "build"),
			path.resolve(moduleDir, "..", "..", "..", "..", "webview-ui", "build"),
		]
		for (const c of candidates) {
			try {
				await fs.access(path.join(c, "index.html"))
				return c
			} catch {}
		}
		return null
	}

	private findFreePort(start: number): Promise<number> {
		return new Promise((resolve, reject) => {
			const tryPort = (p: number) => {
				const srv = createServer()
				srv.once("error", () => {
					srv.close()
					if (p > start + 100) reject(new Error("no free port"))
					else tryPort(p + 1)
				})
				srv.once("listening", () => {
					const port = (srv.address() as { port: number }).port
					srv.close(() => resolve(port))
				})
				srv.listen(p, "127.0.0.1")
			}
			tryPort(start)
		})
	}

	async stop(): Promise<void> {
		if (this.childProcess?.pid) {
			try {
				process.kill(this.childProcess.pid, "SIGTERM")
			} catch {}
			this.childProcess = null
		}
	}

	status(): WebuiServerStatus {
		if (this.externalUrl) return { running: true, url: this.externalUrl, external: true }
		if (this.childProcess && this.port)
			return { running: true, url: `http://127.0.0.1:${this.port}`, port: this.port, external: false }
		return { running: false, external: false }
	}
}

export const webuiServer = new WebuiServer()
