import { IsaacMessage, IsaacSayTool } from "@shared/ExtensionMessage"
import { StringRequest } from "@shared/proto/isaac/common"
import { useCallback, useMemo, useState } from "react"
import { FileServiceClient } from "@/shared/api/grpc-client"
import { useChatStore } from "../../store/chatStore"
import { useMessageHandlers } from "../ChatView/hooks/useMessageHandlers"
import { serializeToolToDisplayUnits } from "../ChatView/utils/toolSerialization"
import { ApprovalBox } from "./ApprovalBox"
import { getComponentForTool } from "./ToolRegistry"
import { ToolRow } from "./ToolRow"

const handlePathClick = (path: string) => {
	FileServiceClient.openFileRelativePath(StringRequest.create({ value: path })).catch((err: any) =>
		console.error("Failed to open file:", err),
	)
}

interface ToolOutputProps {
	tool: IsaacSayTool
	message: IsaacMessage
	isExpanded: boolean
	onToggleExpand: (ts: number) => void
	onHeightChange?: (isTaller: boolean) => void
	backgroundEditEnabled?: boolean
}

export const ToolOutput = ({ tool, message, isExpanded, onToggleExpand, backgroundEditEnabled }: ToolOutputProps) => {
	const [isProcessing, setIsProcessing] = useState(false)
	const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({})
	const messages = useChatStore((state) => state.isaacMessages)
	const chatState = {
		isaacAsk: message.ask,
		lastMessage: message,
		setInputValue: () => {},
		setActiveQuote: () => {},
		setSelectedImages: () => {},
		setSelectedFiles: () => {},
		setSendingDisabled: () => {},
		setEnableButtons: () => {},
	} as any
	const { executeButtonAction } = useMessageHandlers(messages, chatState)

	const handleAction = useCallback(
		async (action: any) => {
			if (isProcessing) return
			setIsProcessing(true)
			try {
				await executeButtonAction(action)
			} finally {
				setIsProcessing(false)
			}
		},
		[executeButtonAction, isProcessing],
	)

	const displayUnits = useMemo(() => {
		const units = serializeToolToDisplayUnits(tool, message)
		return units.map((unit) => ({
			...unit,
			hasComponent: !!getComponentForTool(unit.type),
		}))
	}, [tool, message])

	const handleToggleExpand = useCallback((id: string) => {
		setExpandedItems((prev) => ({ ...prev, [id]: !prev[id] }))
	}, [])

	const Component = getComponentForTool(tool.tool)

	const isPending = displayUnits.some((u) => u.status === "pending")

	const content = (
		<div className="flex flex-col gap-1 min-w-0">
			{displayUnits.map((unit) => (
				<div className="flex flex-col gap-1" key={unit.id}>
					<ToolRow
						isExpanded={expandedItems[unit.id] ?? isExpanded}
						onPathClick={handlePathClick}
						onToggleExpand={handleToggleExpand}
						unit={unit}
					/>
					{Component && (expandedItems[unit.id] ?? isExpanded) && (
						<div className="ml-4 mt-1 border-l-2 border-editor-group-border pl-2">
							<Component
								backgroundEditEnabled={backgroundEditEnabled}
								isExpanded={true}
								message={message}
								onToggleExpand={() => handleToggleExpand(unit.id)}
								tool={tool}
								unit={unit}
							/>
						</div>
					)}
				</div>
			))}
		</div>
	)

	if (isPending) {
		const description =
			displayUnits.length > 1 ? `Approve ${displayUnits.length} actions` : `Approve ${displayUnits[0].label}`

		const hint = tool.hint
			? `

\${tool.hint}`
			: ""
		const fullDescription = description + hint

		return (
			<ApprovalBox
				description={fullDescription}
				isProcessing={isProcessing}
				onApprove={() => handleAction("approve")}
				onEdit={undefined}
				onReject={() => handleAction("reject")}>
				{content}
			</ApprovalBox>
		)
	}

	return content
}
