import React, { createContext, useContext, useMemo } from "react"
import { useSettingsStore } from "@/features/settings/store/settingsStore"
import { useChatStore } from "../../../store/chatStore"
export type InteractionState = "IDLE" | "RUNNING" | "AWAITING_RESPONSE" | "COMPLETED"

interface InteractionStateContextType {
	state: InteractionState
	isPlanMode: boolean
}

const InteractionStateContext = createContext<InteractionStateContextType | undefined>(undefined)

export const InteractionStateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
	const messages = useChatStore((state: any) => state.isaacMessages)
	const mode = useSettingsStore((state: any) => state.mode)

	const interactionState = useMemo((): InteractionState => {
		if (messages.length === 0) return "IDLE"

		const lastMessage = messages.at(-1)
		if (!lastMessage) return "IDLE"

		if (lastMessage.type === "ask") {
			if (lastMessage.ask === "completion_result") return "COMPLETED"
			return "AWAITING_RESPONSE"
		}

		if (lastMessage.type === "say") {
			if (lastMessage.partial) return "RUNNING"
			if (lastMessage.say === "api_req_started") {
				try {
					const info = JSON.parse(lastMessage.text || "{}")
					if (info.cost == null) return "RUNNING"
				} catch {
					return "RUNNING"
				}
			}
		}

		// Default to running if we have messages but no clear completion/ask
		return "RUNNING"
	}, [messages])

	const value = useMemo(
		() => ({
			state: interactionState,
			isPlanMode: mode === "plan",
		}),
		[interactionState, mode],
	)

	return <InteractionStateContext.Provider value={value}>{children}</InteractionStateContext.Provider>
}

export const useInteractionState = () => {
	const context = useContext(InteractionStateContext)
	if (context === undefined) {
		throw new Error("useInteractionState must be used within an InteractionStateProvider")
	}
	return context
}
