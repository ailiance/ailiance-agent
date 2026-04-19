/**
 * Shared utility for hash-anchored line protocol.
 * Used by both the extension (to generate/reconcile hashes) and the webview (to strip hashes for display).
 */

export const ANCHOR_DELIMITER = "§"

/**
 * Returns the centralized delimiter used to separate anchors from content.
 *
 * @returns The anchor delimiter string
 */
export function getDelimiter(): string {
	return ANCHOR_DELIMITER
}

/**
 * Helper to escape characters for use in a regular expression.
 */
function escapeRegExp(string: string) {
	return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Strips hash prefixes from a content string.
 * Removes patterns like "Apple" followed by the delimiter from each line.
 * Anchors are guaranteed to start with a capital letter.
 *
 * @param content - The content containing hashed lines
 * @returns The clean content without hashes
 */
export function stripHashes(content: string): string {
	if (!content) {
		return ""
	}

	// Regex matches anchor patterns (alphabetic words starting with a capital letter) followed by the delimiter.
	// Uses a word boundary \b to ensure we match the anchor accurately.
	const delimiterRegex = new RegExp(`\\b[A-Z][a-zA-Z]*?${escapeRegExp(ANCHOR_DELIMITER)}`, "g")
	return content.replace(delimiterRegex, "")
}

/**
 * Extracts the ID from a line reference provided by the model.
 * Handles both "ID" and "ID:CONTENT" formats.
 *
 * @param ref - The line reference string
 * @returns The extracted ID
 */
export function extractId(ref: string): string {
	if (!ref) {
		return ""
	}
	const delimiterIndex = ref.indexOf(ANCHOR_DELIMITER)
	return delimiterIndex === -1 ? ref : ref.substring(0, delimiterIndex)
}
