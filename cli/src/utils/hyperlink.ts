/**
 * OSC 8 hyperlink — supported by iTerm2, kitty, ghostty, WezTerm,
 * vte (gnome-terminal), Windows Terminal. Falls back to plain text.
 */
export function osc8(url: string, label: string): string {
	// Detect support: TERM_PROGRAM or COLORTERM hints
	const supported =
		!!process.env.TERM_PROGRAM ||
		process.env.COLORTERM === "truecolor" ||
		(process.env.TERM?.includes("xterm") ?? false)
	if (!supported) return label
	return `\x1b]8;;${url}\x1b\\${label}\x1b]8;;\x1b\\`
}
