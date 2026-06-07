// src/services/memory/dreaming/MemorySynthesizer.ts
import type { MemoryCandidate } from "./types"

export interface SynthDeps {
	createMessage: (systemPrompt: string, content: string) => AsyncIterable<{ type: string; text?: string }>
}

const SYSTEM_PROMPT =
	"You distill durable memory from a coding session transcript. Output ONLY a JSON array of " +
	'{scope,type,name,description,body}. scope is "global" (about the user) or "project:<slug>" ' +
	"(about this repo). type in [project,user,feedback,reference]. name is a short kebab-slug. " +
	"Keep entries durable and general; skip ephemeral details. Empty array if nothing worth remembering."

export async function synthesizeMemories(
	condensed: string,
	existing: Array<{ name: string }>,
	deps: SynthDeps,
): Promise<MemoryCandidate[]> {
	let text = ""
	try {
		for await (const chunk of deps.createMessage(SYSTEM_PROMPT, condensed)) {
			if (chunk.type === "text" && chunk.text) text += chunk.text
		}
	} catch {
		return []
	}
	const arr = parseJsonArray(text)
	if (!arr) return []
	const existingNames = new Set(existing.map((e) => e.name))
	const out: MemoryCandidate[] = []
	for (const c of arr) {
		if (!c || typeof c.name !== "string" || typeof c.body !== "string") continue
		// Slugify so the name always satisfies saveMemory's /^[a-z0-9][a-z0-9_-]*$/i.
		// A non-conforming name (spaces, accents) makes saveMemory throw, which —
		// caught per-run without advancing the cursor — re-synthesizes that run forever.
		const name = slugifyName(c.name)
		if (!name || existingNames.has(name)) continue
		existingNames.add(name)
		out.push({
			scope: c.scope === "global" || String(c.scope).startsWith("project:") ? c.scope : "global",
			type: ["project", "user", "feedback", "reference"].includes(c.type) ? c.type : "project",
			name,
			description: typeof c.description === "string" ? c.description : "",
			body: c.body,
		})
	}
	return out
}

/** Coerce an LLM-proposed name into a safe kebab slug accepted by saveMemory. */
export function slugifyName(raw: string): string {
	return raw
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "") // strip diacritics
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 64)
		.replace(/-+$/g, "")
}

function parseJsonArray(text: string): any[] | null {
	try {
		const start = text.indexOf("[")
		const end = text.lastIndexOf("]")
		if (start === -1 || end < start) return null
		const parsed = JSON.parse(text.slice(start, end + 1))
		return Array.isArray(parsed) ? parsed : null
	} catch {
		return null
	}
}
