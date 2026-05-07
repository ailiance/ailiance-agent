import { DiracDefaultTool } from "@/shared/tools"
import type { DiracToolSpec } from "../spec"

const id = DiracDefaultTool.FILE_READ

export const read_file: DiracToolSpec = {
	id,
	name: "read_file",
	description:
		'Reads the complete contents of one or more files at the specified paths. Automatically extracts raw text from PDF and DOCX files. Returns the hash anchored lines that you can use with the edit_file tool. For large files, two pagination styles are supported (mutually exclusive): (a) `start_line` / `end_line` (1-based, inclusive) — preferred when you already think in line numbers; (b) `offset` / `limit` (0-based start, count of lines) — preferred when paginating chunk-by-chunk through a file. If neither pagination is provided and the file exceeds the configured `readFileMaxSize` (default 50000 bytes, capped at 5MB), the read is refused with an actionable error. Examples: { paths: ["src/main.ts", "package.json"] }, { paths: ["src/main.ts"], start_line: 10, end_line: 50 }, { paths: ["src/main.ts"], offset: 0, limit: 200 }, { paths: ["src/main.ts"], offset: 200, limit: 200 }. Consider using surgical tools like get_file_skeleton or get_function over this.',
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
			instruction:
				"Optional. 1-based inclusive start line. Mutually exclusive with `offset`/`limit`. If not supplied, output starts from line 1.",
			usage: "10",
		},
		{
			name: "end_line",
			required: false,
			type: "integer",
			instruction:
				"Optional. 1-based inclusive end line. Mutually exclusive with `offset`/`limit`. If not supplied, output goes until the last line.",
			usage: "50",
		},
		{
			name: "offset",
			required: false,
			type: "integer",
			instruction:
				"Optional. 0-based line index at which to start reading. Mutually exclusive with `start_line`/`end_line`. Must be >= 0.",
			usage: "0",
		},
		{
			name: "limit",
			required: false,
			type: "integer",
			instruction:
				"Optional. Maximum number of lines to read starting from `offset`. Mutually exclusive with `start_line`/`end_line`. Must be > 0.",
			usage: "200",
		},
	],
}
