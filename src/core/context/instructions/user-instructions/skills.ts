import { pluginDiscoveryService } from "@core/plugins/PluginDiscoveryService"
import { getSkillsDirectoriesForScan } from "@core/storage/disk"
import type { SkillContent, SkillMetadata } from "@shared/skills"
import { fileExistsAtPath, isDirectory } from "@utils/fs"
import * as fs from "fs/promises"
import * as path from "path"
import { Logger } from "@/shared/services/Logger"
import { parseYamlFrontmatter } from "@utils/frontmatter"


/**
 * Scan a directory for skill subdirectories containing SKILL.md files.
 */
async function scanSkillsDirectory(dirPath: string, source: "global" | "project"): Promise<SkillMetadata[]> {
	const skills: SkillMetadata[] = []

	if (!(await fileExistsAtPath(dirPath)) || !(await isDirectory(dirPath))) {
		return skills
	}

	try {
		const entries = await fs.readdir(dirPath)

		for (const entryName of entries) {
			const entryPath = path.join(dirPath, entryName)
			const stats = await fs.stat(entryPath).catch(() => null)
			if (!stats?.isDirectory()) continue

			const skill = await loadSkillMetadata(entryPath, source, entryName)
			if (skill) {
				skills.push(skill)
			}
		}
	} catch (error: unknown) {
		if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "EACCES") {
			Logger.warn(`Permission denied reading skills directory: ${dirPath}`)
		}
	}

	return skills
}

/**
 * Load skill metadata from a skill directory.
 */
async function loadSkillMetadata(
	skillDir: string,
	source: "global" | "project",
	skillName: string,
): Promise<SkillMetadata | null> {
	const skillMdPath = path.join(skillDir, "SKILL.md")
	if (!(await fileExistsAtPath(skillMdPath))) return null

	try {
		const fileContent = await fs.readFile(skillMdPath, "utf-8")
		const { data: frontmatter, parseError } = parseYamlFrontmatter(fileContent)

		if (parseError) {
			Logger.warn(`Failed to parse YAML frontmatter for skill at ${skillDir}: ${parseError}`)
			return null
		}

		// Validate required fields
		if (!frontmatter.name || typeof frontmatter.name !== "string") {
			Logger.warn(`Skill at ${skillDir} missing required 'name' field in frontmatter`)
			return null
		}
		if (!frontmatter.description || typeof frontmatter.description !== "string") {
			Logger.warn(`Skill at ${skillDir} missing required 'description' field in frontmatter`)
			return null
		}

		// Name must match directory name per spec
		if (frontmatter.name !== skillName) {
			Logger.warn(`Skill name "${frontmatter.name}" in frontmatter doesn't match directory "${skillName}" at ${skillDir}`)
			return null
		}

		return {
			name: skillName,
			description: frontmatter.description,
			path: skillMdPath,
			source,
		}
	} catch (error) {
		Logger.warn(`Failed to load skill at ${skillDir}:`, error)
		return null
	}
}

/**
 * Discover all skills from global (~/.dirac/skills) and project directories.
 * Returns skills in order: project skills first, then global skills.
 * Global skills take precedence over project skills with the same name.
 */
export async function discoverSkills(cwd: string): Promise<SkillMetadata[]> {
	const skills: SkillMetadata[] = []

	const scanDirs = getSkillsDirectoriesForScan(cwd)

	for (const dir of scanDirs) {
		const dirSkills = await scanSkillsDirectory(dir.path, dir.source)
		skills.push(...dirSkills)
	}

	// Plugin skills (Claude Code plugin compat) — treated as global priority.
	try {
		const pluginDirs = await pluginDiscoveryService.getSkillsDirectories()
		for (const pluginDir of pluginDirs) {
			const pluginSkills = await scanSkillsDirectory(pluginDir, "global")
			skills.push(...pluginSkills)
		}
	} catch (err) {
		Logger.warn("Failed to load plugin skills:", err)
	}

	return skills
}

/**
 * Get available skills with override resolution (global > project).
 */
export function getAvailableSkills(skills: SkillMetadata[]): SkillMetadata[] {
	const seen = new Set<string>()
	const result: SkillMetadata[] = []

	// Iterate backwards: global skills (added last) are seen first and take precedence
	for (let i = skills.length - 1; i >= 0; i--) {
		const skill = skills[i]
		if (!seen.has(skill.name)) {
			seen.add(skill.name)
			result.unshift(skill)
		}
	}

	return result
}

/**
 * Get full skill content including instructions.
 */
/**
 * List supporting files (docs and scripts) in a skill directory.
 */
export async function listSupportingFiles(skillMdPath: string): Promise<{ docs: string[]; scripts: string[] }> {
	const skillDir = path.dirname(skillMdPath)
	const docsDir = path.join(skillDir, "docs")
	const scriptsDir = path.join(skillDir, "scripts")

	const docs: string[] = []
	const scripts: string[] = []

	try {
		if (await fileExistsAtPath(docsDir)) {
			const files = await fs.readdir(docsDir)
			docs.push(...files.filter((f) => f.endsWith(".md") || f.endsWith(".txt")))
		}
	} catch (error) {
		Logger.warn(`Failed to read docs directory for skill at ${skillDir}:`, error)
	}

	try {
		if (await fileExistsAtPath(scriptsDir)) {
			const files = await fs.readdir(scriptsDir)
			scripts.push(...files.filter((f) => !f.startsWith(".")))
		}
	} catch (error) {
		Logger.warn(`Failed to read scripts directory for skill at ${skillDir}:`, error)
	}

	return { docs, scripts }
}


export async function getSkillContent(skillName: string, availableSkills: SkillMetadata[]): Promise<SkillContent | null> {
	const skill = availableSkills.find((s) => s.name === skillName)
	if (!skill) return null

	try {
		const fileContent = await fs.readFile(skill.path, "utf-8")
		const { body } = parseYamlFrontmatter(fileContent)

		return {
			...skill,
			instructions: body.trim(),
		}
	} catch {
		return null
	}
}

/**
 * Get skills from cache or discover them from disk if not already cached.
 * This ensures we only scan the file system once per task.
 */
export async function getOrDiscoverSkills(
	cwd: string,
	cacheProvider: { discoveredSkillsCache?: SkillMetadata[] },
): Promise<SkillMetadata[]> {
	if (cacheProvider.discoveredSkillsCache !== undefined) {
		return cacheProvider.discoveredSkillsCache
	}

	const allSkills = await discoverSkills(cwd)
	const resolvedSkills = getAvailableSkills(allSkills)
	cacheProvider.discoveredSkillsCache = resolvedSkills
	return resolvedSkills
}
