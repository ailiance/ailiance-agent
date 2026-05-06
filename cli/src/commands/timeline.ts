/**
 * aki timeline — show recent tasks grouped by day
 */
export async function runTimeline(options: { days?: string | number; limit?: string | number }) {
	const days = typeof options.days === "string" ? Number.parseInt(options.days, 10) : (options.days ?? 30)
	const limit = typeof options.limit === "string" ? Number.parseInt(options.limit, 10) : (options.limit ?? 200)

	const React = (await import("react")).default
	const { render } = await import("ink")
	const { TimelineView } = await import("../components/TimelineView")
	const { restoreConsole } = await import("../utils/console")

	restoreConsole()

	const { waitUntilExit, unmount } = render(React.createElement(TimelineView, { days, limit }), {
		exitOnCtrlC: true,
		patchConsole: false,
	})

	try {
		await waitUntilExit()
	} finally {
		try {
			unmount()
		} catch {
			// already unmounted
		}
	}
}
