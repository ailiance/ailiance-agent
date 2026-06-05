import { IsaacDefaultTool } from "@/shared/tools"
import type { IsaacToolSpec } from "../spec"
import type { ParamNames } from "../tool-unit"

const id = IsaacDefaultTool.DIAGNOSTICS_SCAN

export const diagnostics_scan = {
	id,
	name: "diagnostics_scan",
	description:
		"Runs diagnostics (linter and syntax checks) on the specified files and returns the results. This is useful for checking if recent changes introduced any errors or for getting a summary of existing problems in specific files.",
	parameters: [
		{
			name: "paths",
			required: true,
			type: "array",
			items: { type: "string" },
			instruction: "An array of relative paths to the files to scan.",
			usage: '["src/utils/math.ts", "src/utils/string.ts"]',
		},
	],
} as const satisfies IsaacToolSpec

/**
 * Lot E: typed param-name union derived from the spec literal above.
 * A rename/removal of a spec parameter changes this union and breaks any
 * handler that reads params through the typed contract (kills drift).
 */
export type DiagnosticsScanParam = ParamNames<typeof diagnostics_scan>
