// ailiance-agent fork: cross-task memory store
//
// Persists user-level knowledge (preferences, repo conventions, gotchas)
// across sessions. Modeled on Claude Code's memory system at
// ~/.claude/projects/<slug>/memory/. Each memory is a markdown file with
// YAML frontmatter; an index `MEMORY.md` at the root lists them all.
//
// Storage layout:
//   ~/.ailiance-agent/memory/
//   ├── MEMORY.md                   # one-line index, human-readable
//   ├── user_role.md                # individual memory files
//   ├── feedback_no_amend.md
//   └── project_<slug>/             # optional per-project scope
//       └── ...
//
// Each memory file:
//   ---
//   name: short-kebab-case-slug
//   description: one-line summary, used for relevance lookup
//   type: user | feedback | project | reference
//   scope: global | project:<repo-name>
//   created: ISO timestamp
//   ---
//   body in markdown
//
// This module ships the CRUD layer + listing + filtering. The auto-injection
// at turn-1 of new tasks is deferred to a follow-up PR — it touches the
// system prompt assembly and warrants its own focused review. The slash
// commands `/remember`, `/forget`, `/memories` are wired through
// `cli/src/commands/memory.ts`.

import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"

export type MemoryType = "user" | "feedback" | "project" | "reference"
export type MemoryScope = "global" | `project:${string}`

export interface MemoryFrontmatter {
	name: string
	description: string
	type: MemoryType
	scope: MemoryScope
	created: string
}

export interface Memory extends MemoryFrontmatter {
	body: string
	filePath: string
}

const MEMORY_ROOT = path.join(os.homedir(), ".ailiance-agent", "memory")
const INDEX_FILE = path.join(MEMORY_ROOT, "MEMORY.md")

/**
 * Ensure the memory directory exists. Idempotent.
 */
async function ensureMemoryRoot(): Promise<void> {
	await fs.mkdir(MEMORY_ROOT, { recursive: true })
}

/**
 * Build the canonical file path for a memory by its name + scope.
 * Project-scoped memories live in a subdirectory so listing/filtering
 * by scope is a directory scan rather than a content scan.
 */
function memoryFilePath(name: string, scope: MemoryScope): string {
	if (scope === "global") {
		return path.join(MEMORY_ROOT, `${name}.md`)
	}
	const projectSlug = scope.slice("project:".length)
	return path.join(MEMORY_ROOT, `project_${projectSlug}`, `${name}.md`)
}

/**
 * Parse a memory markdown file into its frontmatter + body.
 * Returns null when the file is missing, malformed, or missing required fields.
 */
async function parseMemory(filePath: string): Promise<Memory | null> {
	try {
		const raw = await fs.readFile(filePath, "utf-8")
		const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
		if (!match) return null
		const [, frontmatterRaw, body] = match
		const fm: Partial<MemoryFrontmatter> = {}
		for (const line of frontmatterRaw.split("\n")) {
			const colonIdx = line.indexOf(":")
			if (colonIdx === -1) continue
			const key = line.slice(0, colonIdx).trim()
			const value = line.slice(colonIdx + 1).trim()
			if (!key || !value) continue
			if (key === "name") fm.name = value
			else if (key === "description") fm.description = value
			else if (key === "type") fm.type = value as MemoryType
			else if (key === "scope") fm.scope = value as MemoryScope
			else if (key === "created") fm.created = value
		}
		if (!fm.name || !fm.description || !fm.type || !fm.scope || !fm.created) {
			return null
		}
		return {
			name: fm.name,
			description: fm.description,
			type: fm.type,
			scope: fm.scope,
			created: fm.created,
			body: body.trim(),
			filePath,
		}
	} catch {
		return null
	}
}

/**
 * Save a new memory (or overwrite an existing one with the same name+scope).
 * Returns the absolute path to the written file.
 */
export async function saveMemory(input: {
	name: string
	description: string
	type: MemoryType
	scope?: MemoryScope
	body: string
}): Promise<string> {
	await ensureMemoryRoot()
	const scope: MemoryScope = input.scope ?? "global"
	if (!/^[a-z0-9][a-z0-9_-]*$/i.test(input.name)) {
		throw new Error(`memory name must be kebab/snake-case ASCII, got: ${input.name}`)
	}
	const filePath = memoryFilePath(input.name, scope)
	await fs.mkdir(path.dirname(filePath), { recursive: true })
	const frontmatter = [
		"---",
		`name: ${input.name}`,
		`description: ${input.description.replace(/\n/g, " ")}`,
		`type: ${input.type}`,
		`scope: ${scope}`,
		`created: ${new Date().toISOString()}`,
		"---",
		"",
		input.body.trim(),
		"",
	].join("\n")
	await fs.writeFile(filePath, frontmatter, "utf-8")
	await rebuildIndex()
	return filePath
}

/**
 * List all memories, optionally filtered by scope and/or type.
 * Returns them sorted by created (newest first).
 */
export async function listMemories(filter?: {
	scope?: MemoryScope
	type?: MemoryType
}): Promise<Memory[]> {
	await ensureMemoryRoot()
	const memories: Memory[] = []
	// Top-level (global) memories.
	try {
		const entries = await fs.readdir(MEMORY_ROOT)
		for (const entry of entries) {
			if (!entry.endsWith(".md") || entry === "MEMORY.md") continue
			const m = await parseMemory(path.join(MEMORY_ROOT, entry))
			if (m) memories.push(m)
		}
	} catch {
		// directory doesn't exist or is unreadable; treat as empty
	}
	// Project-scoped memories live in project_<slug>/ subdirectories.
	try {
		const entries = await fs.readdir(MEMORY_ROOT, { withFileTypes: true })
		for (const entry of entries) {
			if (!entry.isDirectory() || !entry.name.startsWith("project_")) continue
			const subdir = path.join(MEMORY_ROOT, entry.name)
			const subEntries = await fs.readdir(subdir)
			for (const sub of subEntries) {
				if (!sub.endsWith(".md")) continue
				const m = await parseMemory(path.join(subdir, sub))
				if (m) memories.push(m)
			}
		}
	} catch {
		// best-effort
	}
	let filtered = memories
	if (filter?.scope) filtered = filtered.filter((m) => m.scope === filter.scope)
	if (filter?.type) filtered = filtered.filter((m) => m.type === filter.type)
	filtered.sort((a, b) => (a.created < b.created ? 1 : -1))
	return filtered
}

/**
 * Delete a memory by exact name (matching across scopes).
 * Returns the number of files removed.
 */
export async function deleteMemory(name: string): Promise<number> {
	const memories = await listMemories()
	const matches = memories.filter((m) => m.name === name)
	for (const m of matches) {
		try {
			await fs.unlink(m.filePath)
		} catch {
			// already gone; best-effort
		}
	}
	if (matches.length > 0) await rebuildIndex()
	return matches.length
}

/**
 * Find memories whose name or description contains the query (case-insensitive
 * substring). Used by `/forget <topic>` to disambiguate before delete.
 */
export async function findMemories(query: string): Promise<Memory[]> {
	const q = query.toLowerCase().trim()
	if (!q) return []
	const memories = await listMemories()
	return memories.filter(
		(m) => m.name.toLowerCase().includes(q) || m.description.toLowerCase().includes(q),
	)
}

/**
 * Rebuild the human-readable MEMORY.md index. One line per memory:
 * `- [name](relative-path) — description (type, scope)`.
 * Called after every save/delete so the index never drifts.
 */
async function rebuildIndex(): Promise<void> {
	const memories = await listMemories()
	const lines: string[] = [
		"# Memory Index",
		"",
		`_Generated ${new Date().toISOString()} — do not edit by hand._`,
		"",
	]
	if (memories.length === 0) {
		lines.push("_No memories yet. Use `/remember <topic>` to add one._")
	} else {
		for (const m of memories) {
			const rel = path.relative(MEMORY_ROOT, m.filePath)
			lines.push(`- [${m.name}](${rel}) — ${m.description} (${m.type}, ${m.scope})`)
		}
	}
	lines.push("")
	await fs.writeFile(INDEX_FILE, lines.join("\n"), "utf-8")
}

/**
 * Return the root memory directory. Exposed for testing + tooling.
 */
export function getMemoryRoot(): string {
	return MEMORY_ROOT
}
