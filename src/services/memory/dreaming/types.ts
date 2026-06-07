// src/services/memory/dreaming/types.ts
export interface DreamCursor {
	processed: Record<string, string[]> // projectKey -> taskIds
}
export interface MemoryCandidate {
	scope: "global" | string // "global" | `project:<slug>`
	type: "project" | "user" | "feedback" | "reference"
	name: string
	description: string
	body: string
}
