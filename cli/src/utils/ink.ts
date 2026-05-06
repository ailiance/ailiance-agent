// agent-kiki fork: drain pending terminal-probe responses (CSI 14t / kitty Gi=31 / DA1)
// before Ink starts rendering. Some terminals (kitty, recent iTerm, ghostty) answer
// probes from libraries we transitively depend on, and the response bytes leak as
// printable garbage like "^[[4;704;920t ^[_Gi=31;OK^[\^[[?62c" before our banner.
//
// Strategy: switch stdin to raw mode + give terminal ~30ms to flush any pending
// probe replies, then drain everything from the buffer before the first render.
async function drainPendingStdinProbes(): Promise<void> {
	if (!process.stdin.isTTY) return
	try {
		const wasRaw = process.stdin.isRaw
		process.stdin.setRawMode(true)
		// Some terminals send probe replies asynchronously up to ~20ms after our
		// process starts. Wait briefly so they land in the buffer before we drain.
		await new Promise((resolve) => setTimeout(resolve, 30))
		let chunk: Buffer | string | null
		// biome-ignore lint/suspicious/noAssignInExpressions: idiomatic drain loop
		while ((chunk = process.stdin.read()) !== null) {
			void chunk
		}
		if (!wasRaw) process.stdin.setRawMode(false)
	} catch {
		// Non-TTY or unsupported terminal — nothing to drain.
	}
}

/**
 * Run an Ink app with proper cleanup handling
 */
export async function runInkApp(element: any, cleanup: () => Promise<void>): Promise<void> {
	const { render } = await import("ink")
	const { restoreConsole } = await import("./console")

	// agent-kiki fork: consume probe replies BEFORE clearing — the clear-screen
	// itself can race with late probe replies, so we drain (with a short wait)
	// then immediately clear so any garbage that already printed is hidden.
	await drainPendingStdinProbes()

	// Clear terminal for clean UI - robot will render at row 1
	process.stdout.write("\x1b[2J\x1b[H")

	// Final drain after clear in case the terminal sent late replies between
	// the two steps. No wait this time — pure non-blocking flush.
	if (process.stdin.isTTY) {
		try {
			let chunk: Buffer | string | null
			// biome-ignore lint/suspicious/noAssignInExpressions: idiomatic drain
			while ((chunk = process.stdin.read()) !== null) {
				void chunk
			}
		} catch {
			// ignore
		}
	}

	// Note: incrementalRendering is enabled to reduce terminal bandwidth and improve responsiveness.
	// We previously disabled this due to resize glitches, but our useTerminalSize hook now
	// handles this by clearing the screen and forcing a full React remount on resize,
	// which resets Ink's internal line tracking.
	const { waitUntilExit, unmount } = render(element, {
		exitOnCtrlC: true,
		patchConsole: false,
		// @ts-expect-error: synchronizedUpdateMode is supported by @jrichman/ink but not in the type definitions
		synchronizedUpdateMode: true,
		incrementalRendering: true,
	})

	try {
		await waitUntilExit()
	} finally {
		try {
			unmount()
		} catch {
			// Already unmounted
		}
		restoreConsole()
		await cleanup()
	}
}
