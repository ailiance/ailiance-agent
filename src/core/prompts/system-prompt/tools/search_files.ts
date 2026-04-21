import { DiracDefaultTool } from "@/shared/tools"
import type { DiracToolSpec } from "../spec"

const id = DiracDefaultTool.SEARCH

export const search_files: DiracToolSpec = {
	id,
	name: "search_files",
	description:
		"Regex search across files in the specified paths (files or directories). Skips non-useful content (.git, node_modules, build artifacts, etc. and all files and directories starting with a dot). Prefer AST tools over this when reasonable.",
	parameters: [
		{
			name: "paths",
			required: true,
			type: "array",
			items: { type: "string" },
			instruction: "The paths of the files or directories to search in.",
			usage: '["src/core", "src/services"]',
		},
		{
			name: "regex",
			required: true,
			instruction: "The regular expression pattern to search for (Rust regex syntax).",
			usage: "Regex pattern here",
		},
		{
			name: "file_pattern",
			required: false,
			instruction: "Glob pattern to filter files (e.g., '*.ts').",
			usage: "*.ts",
		},
		{
			name: "context_lines",
			required: false,
			instruction: "Optional number of context lines to show before and after each match (0-10, default 0).",
			usage: "2",
		},
	],
}
