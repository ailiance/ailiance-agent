import { IsaacDefaultTool } from "@/shared/tools"
import type { IsaacToolSpec } from "../spec"
import type { ParamNames } from "../tool-unit"

const id = IsaacDefaultTool.FILE_READ

export const read_file = {
	id,
	name: "read_file",
	description:
		'Reads the complete contents of one or more files at the specified paths. Automatically extracts raw text from PDF and DOCX files. Returns the hash anchored lines that you can use with the edit_file tool. You can also specify a line range to read only a specific part of the file(s). Examples: { paths: ["src/main.ts", "package.json"] }, { paths: ["src/main.ts"] }, { paths: ["src/main.ts"], start_line: 10, end_line: 50 }, { paths: ["src/main.ts"], start_line: 100 }, { paths: ["src/main.ts"], end_line: 50 }. Consider using surgical tools like get_file_skeleton or get_function over this.',
	parameters: [
		{
			name: "paths",
			required: true,
			type: "array",
			items: { type: "string" },
			instruction: "An array of relative paths to the source files.",
			usage: '["src/utils/math.ts", "src/utils/string.ts"]',
		},
		{
			name: "start_line",
			required: false,
			type: "integer",
			instruction: "Optional. If not supplied, output will start from line 1.",
			usage: "10",
		},
		{
			name: "end_line",
			required: false,
			type: "integer",
			instruction: "Optional. If not supplied, the output will go until the last line",
			usage: "50",
		},
	],
} as const satisfies IsaacToolSpec

/**
 * Lot E: typed param-name union derived from the spec literal above.
 * The handler reads scalar params through these names; a rename/removal of a
 * spec parameter changes this union and breaks the handler compile (kills drift).
 */
export type ReadFileParam = ParamNames<typeof read_file>
