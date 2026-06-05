import { IsaacDefaultTool } from "@/shared/tools"
import type { IsaacToolSpec } from "../spec"
import type { ParamNames } from "../tool-unit"

const id = IsaacDefaultTool.GET_FILE_SKELETON

export const get_file_skeleton = {
	id,
	name: "get_file_skeleton",
	description:
		"Reads the structural outline of one or more files by extracting the lines where classes, functions, and methods are defined (including nested definitions) while stripping all implementation logic. Use this to quickly understand multiple files' structures and APIs before requesting specific functions.",
	parameters: [
		{
			name: "paths",
			required: true,
			type: "array",
			items: { type: "string" },
			instruction: "An array of relative paths to the source files.",
			usage: '["src/utils/math.ts", "src/utils/string.py"]',
		},
	],
} as const satisfies IsaacToolSpec

/**
 * Lot E: typed param-name union derived from the spec literal above.
 * A rename/removal of a spec parameter changes this union and breaks any
 * handler that reads params through the typed contract (kills drift).
 */
export type GetFileSkeletonParam = ParamNames<typeof get_file_skeleton>
