import {
	ActivatedConditionalRule,
	getRemoteRulesTotalContentWithMetadata,
	getRuleFilesTotalContentWithMetadata,
	RULE_SOURCE_PREFIX,
	RuleLoadResultWithInstructions,
	synchronizeRuleToggles,
} from "@core/context/instructions/user-instructions/rule-helpers"
import { formatResponse } from "@core/prompts/responses"
import { ensureRulesDirectoryExists, GlobalFileNames } from "@core/storage/disk"
import { StateManager } from "@core/storage/StateManager"
import { IsaacRulesToggles } from "@shared/isaac-rules"
import { parseYamlFrontmatter } from "@utils/frontmatter"
import { fileExistsAtPath, isDirectory, readDirectory } from "@utils/fs"
import fs from "fs/promises"
import path from "path"
import { Controller } from "@/core/controller"
import { pluginDiscoveryService } from "@/core/plugins/PluginDiscoveryService"
import { Logger } from "@/shared/services/Logger"
import { evaluateRuleConditionals, type RuleEvaluationContext } from "./rule-conditionals"

export const getGlobalIsaacRules = async (
	globalIsaacRulesFilePath: string,
	toggles: IsaacRulesToggles,
	opts?: { evaluationContext?: RuleEvaluationContext },
): Promise<RuleLoadResultWithInstructions> => {
	let combinedContent = ""
	const activatedConditionalRules: ActivatedConditionalRule[] = []

	// 1. Get file-based rules
	if (await fileExistsAtPath(globalIsaacRulesFilePath)) {
		if (await isDirectory(globalIsaacRulesFilePath)) {
			try {
				const rulesFilePaths = await readDirectory(globalIsaacRulesFilePath)
				// Note: ruleNamePrefix explicitly set to "global" for clarity (matches the default)
				const rulesFilesTotal = await getRuleFilesTotalContentWithMetadata(
					rulesFilePaths,
					globalIsaacRulesFilePath,
					toggles,
					{
						evaluationContext: opts?.evaluationContext,
						ruleNamePrefix: "global",
					},
				)
				if (rulesFilesTotal.content) {
					combinedContent = rulesFilesTotal.content
					activatedConditionalRules.push(...rulesFilesTotal.activatedConditionalRules)
				}
			} catch {
				Logger.error(`Failed to read .isaacrules directory at ${globalIsaacRulesFilePath}`)
			}
		} else {
			Logger.error(`${globalIsaacRulesFilePath} is not a directory`)
		}
	}

	// 2. Append remote config rules
	const stateManager = StateManager.get()
	const remoteRules: any[] = []
	const remoteToggles = stateManager.getGlobalStateKey("remoteRulesToggles") || {}
	const remoteResult = getRemoteRulesTotalContentWithMetadata(remoteRules, remoteToggles, {
		evaluationContext: opts?.evaluationContext,
	})
	if (remoteResult.content) {
		if (combinedContent) combinedContent += "\n\n"
		combinedContent += remoteResult.content
		activatedConditionalRules.push(...remoteResult.activatedConditionalRules)
	}

	// 3. Append plugin CLAUDE.md rules
	try {
		const claudeMdPaths = await pluginDiscoveryService.getClaudeMdPaths()
		for (const { pluginName, mdPath } of claudeMdPaths) {
			try {
				const content = (await fs.readFile(mdPath, "utf8")).trim()
				if (content) {
					if (combinedContent) combinedContent += "\n\n"
					combinedContent += `# [plugin: ${pluginName}]\n\n${content}`
				}
			} catch {
				// CLAUDE.md not present or unreadable — skip silently
			}
		}
	} catch (error) {
		Logger.warn("[isaac-rules] Failed to load plugin CLAUDE.md rules", error)
	}

	// 4. Return formatted instructions
	if (!combinedContent) {
		return { instructions: undefined, activatedConditionalRules: [] }
	}

	return {
		instructions: formatResponse.isaacRulesGlobalDirectoryInstructions(globalIsaacRulesFilePath, combinedContent),
		activatedConditionalRules,
	}
}

export const getLocalIsaacRules = async (
	cwd: string,
	toggles: IsaacRulesToggles,
	opts?: { evaluationContext?: RuleEvaluationContext },
): Promise<RuleLoadResultWithInstructions> => {
	const isaacRulesFilePath = path.resolve(cwd, GlobalFileNames.isaacRules)

	let instructions: string | undefined
	const activatedConditionalRules: ActivatedConditionalRule[] = []

	if (await fileExistsAtPath(isaacRulesFilePath)) {
		if (await isDirectory(isaacRulesFilePath)) {
			try {
				const rulesFilePaths = await readDirectory(isaacRulesFilePath, [
					[".isaacrules", "workflows"],
					[".isaacrules", "hooks"],
					[".isaacrules", "skills"],
				])

				const rulesFilesTotal = await getRuleFilesTotalContentWithMetadata(rulesFilePaths, cwd, toggles, {
					evaluationContext: opts?.evaluationContext,
					ruleNamePrefix: "workspace",
				})
				if (rulesFilesTotal.content) {
					instructions = formatResponse.isaacRulesLocalDirectoryInstructions(cwd, rulesFilesTotal.content)
					activatedConditionalRules.push(...rulesFilesTotal.activatedConditionalRules)
				}
			} catch {
				Logger.error(`Failed to read .isaacrules directory at ${isaacRulesFilePath}`)
			}
		} else {
			try {
				if (isaacRulesFilePath in toggles && toggles[isaacRulesFilePath] !== false) {
					const raw = (await fs.readFile(isaacRulesFilePath, "utf8")).trim()
					if (raw) {
						// Keep single-file .isaacrules behavior consistent with directory/remote rules:
						// - Parse YAML frontmatter (fail-open on parse errors)
						// - Evaluate conditionals against the request's evaluation context
						const parsed = parseYamlFrontmatter(raw)
						if (parsed.hadFrontmatter && parsed.parseError) {
							// Fail-open: preserve the raw contents so the LLM can still see the author's intent.
							instructions = formatResponse.isaacRulesLocalFileInstructions(cwd, raw)
						} else {
							const { passed, matchedConditions } = evaluateRuleConditionals(
								parsed.data,
								opts?.evaluationContext ?? {},
							)
							if (passed) {
								instructions = formatResponse.isaacRulesLocalFileInstructions(cwd, parsed.body.trim())
								if (parsed.hadFrontmatter && Object.keys(matchedConditions).length > 0) {
									activatedConditionalRules.push({
										name: `${RULE_SOURCE_PREFIX.workspace}:${GlobalFileNames.isaacRules}`,
										matchedConditions,
									})
								}
							}
						}
					}
				}
			} catch {
				Logger.error(`Failed to read .isaacrules file at ${isaacRulesFilePath}`)
			}
		}
	}

	return { instructions, activatedConditionalRules }
}

export async function refreshIsaacRulesToggles(
	controller: Controller,
	workingDirectory: string,
): Promise<{
	globalToggles: IsaacRulesToggles
	localToggles: IsaacRulesToggles
}> {
	// Global toggles
	const globalIsaacRulesToggles = controller.stateManager.getGlobalSettingsKey("globalIsaacRulesToggles")
	const globalIsaacRulesFilePath = await ensureRulesDirectoryExists()
	const updatedGlobalToggles = await synchronizeRuleToggles(globalIsaacRulesFilePath, globalIsaacRulesToggles)
	controller.stateManager.setGlobalState("globalIsaacRulesToggles", updatedGlobalToggles)

	// Local toggles
	const localIsaacRulesToggles = controller.stateManager.getWorkspaceStateKey("localIsaacRulesToggles")
	const localIsaacRulesFilePath = path.resolve(workingDirectory, GlobalFileNames.isaacRules)
	const updatedLocalToggles = await synchronizeRuleToggles(localIsaacRulesFilePath, localIsaacRulesToggles, "", [
		[".isaacrules", "workflows"],
		[".isaacrules", "hooks"],
		[".isaacrules", "skills"],
	])
	controller.stateManager.setWorkspaceState("localIsaacRulesToggles", updatedLocalToggles)

	return {
		globalToggles: updatedGlobalToggles,
		localToggles: updatedLocalToggles,
	}
}
