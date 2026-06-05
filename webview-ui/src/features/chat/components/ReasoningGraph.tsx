import { motion } from "framer-motion"
import React, { memo } from "react"
import { cn } from "@/lib/utils"

interface ReasoningNode {
	id: string
	content: string
	type: "thought" | "action" | "result"
	timestamp: number
}

interface ReasoningGraphProps {
	nodes: ReasoningNode[]
	className?: string
}

export const ReasoningGraph: React.FC<ReasoningGraphProps> = memo(({ nodes, className }) => {
	if (nodes.length === 0) return null

	return (
		<div className={cn("flex flex-col gap-4 p-4 relative", className)}>
			{/* Connection Line */}
			<div className="absolute left-[27px] top-8 bottom-8 w-0.5 bg-border/30 z-0" />

			{nodes.map((node, index) => (
				<motion.div
					animate={{ opacity: 1, x: 0 }}
					className="flex gap-4 relative z-10"
					initial={{ opacity: 0, x: -20 }}
					key={node.id}
					transition={{ delay: index * 0.1 }}>
					{/* Node Icon/Bullet */}
					<div className="flex-shrink-0 w-6 h-6 rounded-full bg-background border-2 border-isaac flex items-center justify-center shadow-sm">
						<div className="w-2 h-2 rounded-full bg-isaac" />
					</div>

					{/* Node Content */}
					<div className="flex-1 glass p-3 rounded-lg text-sm border border-white/10">
						<div className="text-description italic whitespace-pre-wrap">{node.content}</div>
					</div>
				</motion.div>
			))}
		</div>
	)
})

ReasoningGraph.displayName = "ReasoningGraph"
