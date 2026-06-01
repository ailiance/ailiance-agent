import * as crypto from "crypto"
import * as fs from "fs"
import * as path from "path"
import type { Embedder } from "./Embedder"

export interface ToolText {
	qualifiedName: string
	text: string
}

interface CacheEntry {
	hash: string
	vec: number[]
}

function hashText(text: string): string {
	return crypto.createHash("sha256").update(text).digest("hex").slice(0, 16)
}

export class ToolVectorIndex {
	constructor(
		private readonly embedder: Embedder,
		private readonly cachePath: string,
	) {}

	private readCache(): Record<string, CacheEntry> {
		try {
			return JSON.parse(fs.readFileSync(this.cachePath, "utf8"))
		} catch {
			return {}
		}
	}

	private writeCache(cache: Record<string, CacheEntry>): void {
		fs.mkdirSync(path.dirname(this.cachePath), { recursive: true })
		fs.writeFileSync(this.cachePath, JSON.stringify(cache))
	}

	async build(tools: ToolText[]): Promise<Map<string, Float32Array>> {
		const cache = this.readCache()
		const stale = tools.filter((t) => cache[t.qualifiedName]?.hash !== hashText(t.text))
		if (stale.length > 0) {
			const vecs = await this.embedder.embed(stale.map((t) => t.text))
			stale.forEach((t, i) => {
				cache[t.qualifiedName] = { hash: hashText(t.text), vec: Array.from(vecs[i]) }
			})
			this.writeCache(cache)
		}
		const result = new Map<string, Float32Array>()
		for (const t of tools) {
			result.set(t.qualifiedName, Float32Array.from(cache[t.qualifiedName].vec))
		}
		return result
	}
}
