// ailiance-agent fork: parser for hallucinated XML tool-call format
//
// Background: some workers (Mistral-Medium-128B on MLX in particular)
// receive a request with tools[] but their backend does not support
// OpenAI native function calling. The gateway is supposed to force
// such requests onto a FC-capable worker (Qwen 32B vLLM), but the
// ailiance auto-router model can leak through — see the companion
// gateway-side fix that hardens that route.
//
// When this leak happens, the model imitates Anthropic-style XML but
// emits a flat shape neither Anthropic nor any of the 5
// universal-emulation formats (CHANGELOG 0.5.0) handles:
//
//   <function=list_files>
//   <parameter=paths>
//   ["."]
//   </parameter>
//   </function>
//
// The CLI's text-block parser previously stripped the outer
// <function_calls>...</function_calls> Anthropic wrapper but did not
// recognise this flat <function=name> shape. The model repeats it,
// the CLI never dispatches a tool, the agent loop hits 5 consecutive
// "no tool call detected" errors and aborts.
//
// This module gives the CLI a tolerant parser so the same input ends
// up as a structured tool call regardless of which format the model
// chose. It is best-effort, never throws, and returns the residual
// text so the caller can still display non-tool prose.

export interface ParsedXmlToolCall {
	name: string
	params: Record<string, string>
}

export interface XmlToolParseResult {
	calls: ParsedXmlToolCall[]
	// Text remaining after the tool-call blocks have been excised.
	residualText: string
}

// Tolerant patterns:
// - <function=NAME>...</function>  (the observed hallucination)
// - <invoke=NAME>...</invoke>      (a near-cousin some models emit)
const FUNCTION_BLOCK_RE = /<(function|invoke)=([a-zA-Z0-9_.-]+)>([\s\S]*?)<\/\1>/g
// Inside a block, parameters are <parameter=KEY>VALUE</parameter>.
// Some models drop the equals: <parameter name="KEY"> — accept both.
const PARAM_RE =
	/<parameter(?:=|\s+name=["'])([a-zA-Z0-9_.-]+)["']?\s*>([\s\S]*?)<\/parameter>/g

/**
 * Extract tool calls from an assistant text block.
 *
 * Returns the structured calls plus the residual text after the
 * matched blocks are excised. Always succeeds — if no pattern matches,
 * `calls` is empty and `residualText` is the input untouched.
 */
export function parseHallucinatedToolXml(text: string): XmlToolParseResult {
	if (!text || !text.includes("<function") && !text.includes("<invoke")) {
		return { calls: [], residualText: text ?? "" }
	}

	const calls: ParsedXmlToolCall[] = []
	let residual = text

	residual = residual.replace(FUNCTION_BLOCK_RE, (_match, _outerTag, name, inner) => {
		const params: Record<string, string> = {}
		let paramMatch: RegExpExecArray | null
		// Reset lastIndex; PARAM_RE is global so it carries state across calls.
		PARAM_RE.lastIndex = 0
		while ((paramMatch = PARAM_RE.exec(inner)) !== null) {
			const key = paramMatch[1]
			const value = paramMatch[2].trim()
			params[key] = value
		}
		calls.push({ name, params })
		// Excise the block; trim a single surrounding newline so we don't
		// pile blank lines in the residual prose.
		return ""
	})

	// Collapse runs of >2 newlines left by the excision.
	residual = residual.replace(/\n{3,}/g, "\n\n").trim()

	return { calls, residualText: residual }
}

/**
 * Heuristic: does this text look like it contains a hallucinated tool
 * call? Cheap check used to decide whether to invoke the full parser.
 */
export function hasHallucinatedToolXml(text: string): boolean {
	if (!text) return false
	// Must contain BOTH the opening tag and a closing — partial streams
	// should not trigger (the assistant-message parser handles partials
	// elsewhere; we only act on complete blocks).
	const hasOpen = /<(function|invoke)=[a-zA-Z0-9_.-]+>/.test(text)
	const hasClose = /<\/(function|invoke)>/.test(text)
	return hasOpen && hasClose
}
