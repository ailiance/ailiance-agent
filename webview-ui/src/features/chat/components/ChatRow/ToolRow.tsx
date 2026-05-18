import React from "react"
import { AlertCircleIcon, Loader2Icon, SquareArrowOutUpRightIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { DisplayUnit } from "./types"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip"
import { Button } from "@/shared/ui/button"

interface ToolRowProps {
	unit: DisplayUnit
	labelOverride?: string

	onToggleExpand?: (id: string) => void
	onPathClick?: (path: string) => void
	isExpanded?: boolean
}

const SIZES = {
	rowPadding: "py-1",
	icon: "size-4",
	actionIcon: "size-4",
	actionButton: "size-8",
	label: "text-sm",
	subLabel: "text-xs",
	statusDot: "size-2.5",
	statusIcon: "size-4",
}

const MiddleTruncatedText: React.FC<{ text: string; className?: string }> = ({ text, className }) => {
	return (
		<span className={cn("flex min-w-0 overflow-hidden", className)}>
			<span className="truncate flex-shrink">{text.slice(0, Math.max(0, text.length - 15))}</span>
			<span className="flex-shrink-0">{text.slice(-15)}</span>
		</span>
	)
}


/**
 * Format a duration in milliseconds as a short human-readable label
 * (e.g. "850ms", "2.3s", "1m 14s"). v0.6 Sprint 2-G.
 */
function formatDuration(ms: number): string {
	if (!Number.isFinite(ms) || ms < 0) return ""
	if (ms < 1000) return `${Math.round(ms)}ms`
	const totalSec = ms / 1000
	if (totalSec < 60) return `${totalSec.toFixed(1)}s`
	const m = Math.floor(totalSec / 60)
	const s = Math.floor(totalSec - m * 60)
	return `${m}m ${s}s`
}

export const ToolRow: React.FC<ToolRowProps> = ({ unit, onToggleExpand, onPathClick, isExpanded }) => {
	const Icon = unit.icon
	const isSuccess = unit.status === "success"
	const isError = unit.status === "error"
	const isActive = unit.status === "active"
	const isPending = unit.status === "pending"
	const isRunning = unit.status === "running"
	const isCancelled = unit.status === "cancelled"
	const isProcessing = isActive || isPending || isRunning // Show processing state for active, pending approval, and running async
	const durationLabel = unit.asyncDurationMs !== undefined ? formatDuration(unit.asyncDurationMs) : ""

	const handleClick = () => {
		if (unit.isExpandable && onToggleExpand) {
			onToggleExpand(unit.id)
		}
	}

	return (
		<div className="flex flex-col min-w-0">
			<div className={cn("flex items-center gap-2 min-w-0 group", SIZES.rowPadding)}>
				<Button
					variant="text"
					size="icon"
					className={cn(
						"flex items-center gap-1.5 cursor-pointer text-description py-0 hover:text-link min-w-0 max-w-full px-0 leading-tight h-auto",
						SIZES.label,
						!unit.isExpandable && "cursor-default hover:text-description"
					)}
					onClick={handleClick}>
					{unit.toolName ? (
						<Tooltip>
							<TooltipTrigger asChild>
								<Icon className={cn("opacity-90 shrink-0", SIZES.icon)} />
							</TooltipTrigger>
							<TooltipContent side="top">
								<p className="text-xs">{unit.toolName || "Tool"}</p>
							</TooltipContent>
						</Tooltip>
					) : (
						<Icon className={cn("opacity-90 shrink-0", SIZES.icon)} />
					)}
					<div className={cn("flex-1 min-w-0 flex items-center overflow-hidden text-left gap-1.5", SIZES.label)}>
						<span className="shrink-0">{unit.label}</span>
						{unit.subLabel && (
							<MiddleTruncatedText
								text={unit.subLabel}
								className={cn("opacity-60 tabular-nums flex-1", SIZES.subLabel)}
							/>
						)}
					</div>
				</Button>

				{unit.path && unit.isFilePath && onPathClick && (
					<Button
						variant="text"
						size="icon"
						className={cn("p-0 text-description hover:text-link shrink-0 -ml-1", SIZES.actionButton)}
						onClick={(e) => {
							e.stopPropagation()
							onPathClick(unit.path!)
						}}
						title="Open file in editor">
						<SquareArrowOutUpRightIcon className={SIZES.actionIcon} />
					</Button>
				)}

				<div className="flex items-center shrink-0 ml-auto pl-2 gap-2">
					{isActive && (
						<div className="flex items-center gap-1.5">
							<div className={cn("rounded-full bg-link animate-pulse", SIZES.statusDot)} />
							<span className="text-[10px] text-link/80 font-medium uppercase tracking-wider">Running</span>
						</div>
					)}
					{isPending && (
						<div className="flex items-center gap-1.5">
							<div className={cn("rounded-full border border-description/50", SIZES.statusDot)} />
							<span className="text-[10px] text-description/70 font-medium uppercase tracking-wider">Pending</span>
						</div>
					)}
					{isRunning && (
						<div className="flex items-center gap-1.5 text-link/80">
							<Loader2Icon className={cn("animate-spin", SIZES.statusIcon)} />
							<span className="text-[10px] font-medium uppercase tracking-wider">Running…</span>
						</div>
					)}
					{isSuccess && (
						<div className="flex items-center gap-1.5">
							<div className={cn("rounded-full bg-success/80", SIZES.statusDot)} />
							<span className="text-[10px] text-success/80 font-medium uppercase tracking-wider">
								Done{durationLabel ? ` · ${durationLabel}` : ""}
							</span>
						</div>
					)}
					{isError && (
						<div className="flex items-center gap-1.5 text-error">
							<AlertCircleIcon className={SIZES.statusIcon} />
							<span className="text-[10px] font-medium uppercase tracking-wider">
								Error{durationLabel ? ` · ${durationLabel}` : ""}
							</span>
						</div>
					)}
					{isCancelled && (
						<div className="flex items-center gap-1.5 text-warning">
							<div className={cn("rounded-full bg-warning/80", SIZES.statusDot)} />
							<span className="text-[10px] text-warning/80 font-medium uppercase tracking-wider">
								Cancelled{durationLabel ? ` · ${durationLabel}` : ""}
							</span>
						</div>
					)}
				</div>
			</div>
			{unit.isExpandable && isExpanded && unit.content && !unit.hasComponent && (
				<pre className="m-1 ml-4 text-xs opacity-80 whitespace-pre-wrap break-words p-2 max-h-40 overflow-auto rounded-xs bg-code border border-editor-group-border">
					{unit.content}
				</pre>
			)}
		</div>
	)
}
