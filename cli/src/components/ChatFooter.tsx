import { Box, Text } from "ink"
import os from "node:os"
import React, { useEffect, useState } from "react"
import { COLORS } from "../constants/colors"
import { createContextBar } from "../utils/display"
import type { GitDiffStats } from "../utils/git"

/**
 * Replace the user's home prefix with `~` so the cwd row stays
 * compact, matching the Claude Code statusline convention.
 */
function tildify(p: string): string {
	const home = os.homedir()
	if (home && p.startsWith(home)) {
		return "~" + p.slice(home.length)
	}
	return p
}

/**
 * Map remaining-context percentage to a saturated badge color.
 * green ≥ 40, yellow ≥ 15, red otherwise (matches the user's
 * Claude Code statusline thresholds).
 */
function ctxBadgeColor(pct: number): "green" | "yellow" | "red" {
	if (pct >= 40) return "green"
	if (pct >= 15) return "yellow"
	return "red"
}

interface ChatFooterProps {
	mode: "act" | "plan"
	modelId: string
	lastApiReqTotalTokens: number
	contextWindowSize: number
	totalCost: number
	workspacePath: string
	gitBranch: string | null
	gitDiffStats: GitDiffStats | null
	autoApproveAll: boolean
	show?: boolean
}

export const ChatFooter: React.FC<ChatFooterProps> = ({
	mode,
	modelId,
	lastApiReqTotalTokens,
	contextWindowSize,
	totalCost,
	workspacePath,
	gitBranch,
	gitDiffStats,
	autoApproveAll,
	show = true,
}) => {
	// Tick the clock every second so the statusline time stays live.
	const [now, setNow] = useState<Date>(() => new Date())
	useEffect(() => {
		const id = setInterval(() => setNow(new Date()), 1000)
		return () => clearInterval(id)
	}, [])

	if (!show) return null

	const cwdDisplay = tildify(workspacePath)
	const isDirty = !!(gitDiffStats && gitDiffStats.files > 0)
	const branchBadgeBg = isDirty ? "yellow" : "green"
	const hasCtx = lastApiReqTotalTokens > 0 && contextWindowSize > 0
	const ctxRemainPct = hasCtx
		? Math.max(0, Math.round(100 * (1 - lastApiReqTotalTokens / contextWindowSize)))
		: null
	const ctxColor = ctxRemainPct === null ? "green" : ctxBadgeColor(ctxRemainPct)
	const timeStr = now.toLocaleTimeString("fr-FR", { hour12: false })

	return (
		<Box flexDirection="column" width="100%">
			{/* Statusline row 1: cwd + branch badge */}
			<Box gap={1} paddingLeft={1} paddingRight={1}>
				<Text bold color="cyan">
					▸ {cwdDisplay}
				</Text>
				{gitBranch && (
					<Text bold backgroundColor={branchBadgeBg} color="white">
						{` ${gitBranch}${isDirty ? "*" : ""} `}
					</Text>
				)}
			</Box>

			{/* Statusline row 2: model badge + ctx badge + time */}
			<Box gap={1} paddingLeft={1} paddingRight={1}>
				<Text bold backgroundColor="magenta" color="white">
					{` ${modelId} `}
				</Text>
				<Text bold backgroundColor={ctxColor} color="white">
					{ctxRemainPct === null ? "  ◉ —%  " : `  ◉ ${ctxRemainPct}%  `}
				</Text>
				<Text dimColor>⏱ {timeStr}</Text>
			</Box>

			{/* Row 1: Instructions (left, can wrap) | Plan/Act toggle (right, no wrap) */}
			<Box justifyContent="space-between" paddingLeft={1} paddingRight={1} width="100%">
				<Box flexShrink={1} flexWrap="wrap">
					<Text color="gray">/ for commands · @ for files · Press Shift+↓ for a new line</Text>
				</Box>
				<Box flexShrink={0} gap={1}>
					<Box>
						<Text bold={mode === "plan"} color={mode === "plan" ? "yellow" : undefined}>
							{mode === "plan" ? "●" : "○"} Plan
						</Text>
					</Box>
					<Box>
						<Text bold={mode === "act"} color={mode === "act" ? COLORS.primaryBlue : undefined}>
							{mode === "act" ? "●" : "○"} Act
						</Text>
					</Box>
					<Text color="gray">(Tab)</Text>
				</Box>
			</Box>

			{/* Row 2: Model/context/tokens/cost */}
			<Box paddingLeft={1} paddingRight={1}>
				<Text>
					{modelId}{" "}
					{(() => {
						const bar = createContextBar(lastApiReqTotalTokens, contextWindowSize)
						return (
							<Text>
								<Text>{bar.filled}</Text>
								<Text color="gray">{bar.empty}</Text>
							</Text>
						)
					})()}{" "}
					<Text color="gray">
						({lastApiReqTotalTokens.toLocaleString()}) | ${totalCost.toFixed(3)}
					</Text>
				</Text>
			</Box>

			{/* Row 3: Repo/branch/diff stats */}
			<Box paddingLeft={1} paddingRight={1}>
				<Text>
					{workspacePath.split("/").pop() || workspacePath}
					{gitBranch && ` (${gitBranch})`}
					{gitDiffStats && gitDiffStats.files > 0 && (
						<Text color="gray">
							{" "}
							| {gitDiffStats.files} file{gitDiffStats.files !== 1 ? "s" : ""}{" "}
							<Text color="green">+{gitDiffStats.additions}</Text>{" "}
							<Text color="red">-{gitDiffStats.deletions}</Text>
						</Text>
					)}
				</Text>
			</Box>

			{/* Row 4: Auto-approve toggle */}
			<Box paddingLeft={1} paddingRight={1}>
				{autoApproveAll ? (
					<Text>
						<Text color="green">⏵⏵ Auto-approve all enabled</Text>
						<Text color="gray"> (Shift+Tab)</Text>
					</Text>
				) : (
					<Text color="gray">Auto-approve all disabled (Shift+Tab)</Text>
				)}
			</Box>
		</Box>
	)
}
