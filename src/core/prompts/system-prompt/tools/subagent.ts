import { DiracDefaultTool } from "@/shared/tools"
import type { DiracToolSpec } from "../spec"

const id = DiracDefaultTool.USE_SUBAGENTS

export const subagent: DiracToolSpec = {
	id,
	name: "use_subagents",
	description:
		"Run between two and five focused in-process subagents in parallel. Each subagent gets its own prompt and returns a comprehensive research result. Default timeout is 300 seconds. Particularly effective for investigating multiple independent paths simultaneously without consuming the your context window.",
	contextRequirements: (context) => context.subagentsEnabled === true,
	parameters: [
		{
			name: "include_history",
			required: false,
			instruction: "Optional boolean to include the main task's conversation history. This benefits from context caching and provides more context, but consumes context window space.",
		},
		{
			name: "prompt_1",
			required: true,
			instruction: "First subagent prompt.",
		},
		{
			name: "prompt_2",
			required: true,
			instruction: "Second subagent prompt.",
		},
		{
			name: "prompt_3",
			required: false,
			instruction: "Optional third subagent prompt.",
		},
		{
			name: "prompt_4",
			required: false,
			instruction: "Optional fourth subagent prompt.",
		},
		{
			name: "prompt_5",
			required: false,
			instruction: "Optional fifth subagent prompt.",
		},
		{
			name: "timeout",
			required: false,
			instruction: "Optional timeout in seconds for each subagent. Defaults to 300 seconds.",
		},
		{
			name: "max_turns",
			required: false,
			instruction: "Optional maximum number of turns for each subagent.",
		},
	],
}
