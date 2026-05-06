/**
 * Pre-import bootstrap: must be the first import of cli/src/index.ts.
 *
 * ESM spec evaluates imported modules in source order, so any side effects in
 * this module run BEFORE the rest of `index.ts` imports (commander, ink, etc.)
 * load and potentially trigger terminal probes (CSI 14t / kitty Gi=31 / DA1).
 *
 * Putting stdin in raw mode here causes those probe replies to land in stdin
 * (where we can drain them later) instead of being echoed by the tty driver
 * onto stdout as visible garbage like "^[[4;704;920t ^[_Gi=31;OK^[\^[[?62c".
 */

if (process.stdin.isTTY) {
	try {
		process.stdin.setRawMode(true)
	} catch {
		// non-TTY, unsupported, or already raw — ignore
	}
}
