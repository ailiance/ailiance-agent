import type { ExtensionState, IsaacMessage } from "@shared/ExtensionMessage"
import { EmptyRequest } from "@shared/proto/isaac/common"
import { create } from "zustand"
import { StateServiceClient } from "@/shared/api/grpc-client"

interface ChatState {
	isaacMessages: IsaacMessage[]

	// Actions
	setIsaacMessages: (messages: IsaacMessage[]) => void
	updatePartialMessage: (message: IsaacMessage) => void

	// Hydration
	hydrate: () => () => void
}

export const useChatStore = create<ChatState>((set) => ({
	isaacMessages: [],

	setIsaacMessages: (messages) => set({ isaacMessages: messages }),

	updatePartialMessage: (message) =>
		set((state) => {
			const lastIndex = state.isaacMessages.findLastIndex((msg) => msg.ts === message.ts)
			if (lastIndex !== -1) {
				const newMessages = [...state.isaacMessages]
				newMessages[lastIndex] = message
				return { isaacMessages: newMessages }
			}
			return state
		}),

	hydrate: () => {
		const cleanup = StateServiceClient.subscribeToState({} as EmptyRequest, {
			onResponse: (state) => {
				if (!state.stateJson) return
				const parsedState = JSON.parse(state.stateJson) as ExtensionState

				if (parsedState.isaacMessages) {
					const lastUserMessage = parsedState.isaacMessages.filter((m) => m.type === "say" && m.say === "text").at(-1)

					set((state) => {
						return { isaacMessages: parsedState.isaacMessages }
					})
				}
			},
			onError: (error) => {
				console.error("Error in chatStore state subscription:", error)
			},
			onComplete: () => {},
		})
		return cleanup
	},
}))
