// `isaac webui` — start the local web dashboard standalone (outside a chat
// session). The dashboard lists gateway models, agent tools, and LISAEL
// memories. The server binds to 127.0.0.1 and picks a free port from 25463.
export async function runWebui(): Promise<void> {
	const { webuiServer } = await import("@/services/webui/WebuiServer")
	const status = await webuiServer.start()
	console.log(`✓ ISAAC webui running: ${status.url}`)
	console.log("  Press Ctrl+C to stop.")

	// The server unref()s itself, so keep the process alive explicitly. A timer
	// is more robust than stdin.resume() alone (stdin may be a non-TTY/closed
	// pipe when launched in the background).
	const keepAlive = setInterval(() => {}, 1 << 30)
	process.stdin.resume()
	const shutdown = async () => {
		clearInterval(keepAlive)
		try {
			await webuiServer.stop()
		} finally {
			process.exit(0)
		}
	}
	process.on("SIGINT", shutdown)
	process.on("SIGTERM", shutdown)
}
