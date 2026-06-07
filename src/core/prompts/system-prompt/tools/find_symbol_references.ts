import { IsaacDefaultTool } from "@/shared/tools"
import type { IsaacToolSpec } from "../spec"
import type { ParamNames } from "../tool-unit"

const id = IsaacDefaultTool.FIND_SYMBOL_REFERENCES

export const find_symbol_references = {
	id,
	name: "find_symbol_references",
	description:
		"Finds all exact AST references and invocations of one or more functions, classes, or variables across specified files or directories. Returns precise file paths.",
	parameters: [
		{
			name: "paths",
			required: true,
			type: "array",
			items: { type: "string" },
			instruction: "An array of relative paths to the directories or files to search.",
			usage: '["src/", "tests/"]',
		},
		{
			name: "symbols",
			required: true,
			type: "array",
			items: { type: "string" },
			instruction: "An array of exact symbol names to find references for.",
			usage: '["calculateTotal", "UserAccount"]',
		},
		{
			name: "find_type",
			required: false,
			type: "string",
			enum: ["definition", "reference", "both"],
			instruction:
				'Specifies the type of references to find. "definition" returns only definitions, "reference" returns only references, and "both" (default) returns both.',
		},
	],
} as const satisfies IsaacToolSpec

/**
 * Lot E: typed param-name union derived from the spec literal above.
 * The handler reads the scalar `find_type` param through this contract; a
 * rename/removal of a spec parameter changes this union and breaks the handler
 * compile (kills drift). The `enum` field on `find_type` is preserved verbatim
 * by `as const satisfies IsaacToolSpec` and flows through to the OpenAI schema.
 */
export type FindSymbolReferencesParam = ParamNames<typeof find_symbol_references>
