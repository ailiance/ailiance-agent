// agent-kiki fork: drain pending terminal-probe responses (CSI 14t / kitty Gi=31 / DA1)
// before Ink starts rendering. Some terminals (kitty, recent iTerm with imgproto)
// answer probes from libraries we transitively depend on, and the response bytes
// leak as printable garbage like "^[[4;704;920t ^[_Gi=31;OK^[\^[[?62c" before our banner.
// Putting stdin into raw mode briefly + draining pending bytes consumes those replies.
function drainPendingStdinProbes(): void {
	if (!process.stdin.isTTY) return
	try {
		const wasRaw = process.stdin.isRaw
		process.stdin.setRawMode(true)
		// Read whatever is currently buffered (probe replies arrive within a few ms of
		// terminal startup; by the time we render the banner they're already queued).
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

	// agent-kiki fork: consume probe replies before clear+render
	drainPendingStdinProbes()

	// Clear terminal for clean UI - robot will render at row 1
	process.stdout.write("\x1b[2J\x1b[H")

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
