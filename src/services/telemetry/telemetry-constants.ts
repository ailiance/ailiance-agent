/**
 * Telemetry metric and event name constants.
 *
 * Extracted verbatim from TelemetryService for readability. These are pure data
 * tables with no behavior. `TelemetryService.METRICS` and the internal
 * `TelemetryService` event table reference these objects so the public surface
 * (e.g. `TelemetryService.METRICS.TASK.TOKENS_INPUT_TOTAL`) is unchanged.
 */

/**
 * Metric (counter/histogram/gauge) name constants grouped by domain.
 */
export const TELEMETRY_METRICS = {
	TASK: {
		TURNS_TOTAL: "isaac.turns.total",
		TURNS_PER_TASK: "isaac.turns.per_task",
		TOKENS_INPUT_TOTAL: "isaac.tokens.input.total",
		TOKENS_INPUT_PER_RESPONSE: "isaac.tokens.input.per_response",
		TOKENS_OUTPUT_TOTAL: "isaac.tokens.output.total",
		TOKENS_OUTPUT_PER_RESPONSE: "isaac.tokens.output.per_response",
		COST_TOTAL: "isaac.cost.total",
		COST_PER_EVENT: "isaac.cost.per_event",
	},
	CACHE: {
		WRITE_TOTAL: "isaac.cache.write.tokens.total",
		WRITE_PER_EVENT: "isaac.cache.write.tokens.per_event",
		READ_TOTAL: "isaac.cache.read.tokens.total",
		READ_PER_EVENT: "isaac.cache.read.tokens.per_event",
		HITS_TOTAL: "isaac.cache.hits.total",
	},
	TOOLS: {
		CALLS_TOTAL: "isaac.tool.calls.total",
		CALLS_PER_TASK: "isaac.tool.calls.per_task",
	},
	ERRORS: {
		TOTAL: "isaac.errors.total",
		PER_TASK: "isaac.errors.per_task",
	},
	API: {
		TTFT_SECONDS: "isaac.api.ttft.seconds",
		DURATION_SECONDS: "isaac.api.duration.seconds",
		THROUGHPUT_TOKENS_PER_SECOND: "isaac.api.throughput.tokens_per_second",
	},
	HOOKS: {
		EXECUTIONS_TOTAL: "isaac.hooks.executions.total",
		DURATION_SECONDS: "isaac.hooks.duration.seconds",
		FAILURES_TOTAL: "isaac.hooks.failures.total",
		CANCELLATIONS_TOTAL: "isaac.hooks.cancellations.total",
		CONTEXT_MODIFICATIONS_TOTAL: "isaac.hooks.context_modifications.total",
		CACHE_ACCESSES_TOTAL: "isaac.hooks.cache.accesses.total",
	},
	AI_OUTPUT: {
		ACCEPTED_LINES_ADDED: "isaac.ai_output.accepted.lines_added.total",
		ACCEPTED_LINES_DELETED: "isaac.ai_output.accepted.lines_deleted.total",
		ACCEPTED_LINES_CHANGED: "isaac.ai_output.accepted.lines_changed.total",
		ACCEPTED_FILES_CREATED: "isaac.ai_output.accepted.files_created.total",
		ACCEPTED_FILES_DELETED: "isaac.ai_output.accepted.files_deleted.total",
		ACCEPTED_FILES_MOVED: "isaac.ai_output.accepted.files_moved.total",
		REJECTED_LINES_ADDED: "isaac.ai_output.rejected.lines_added.total",
		REJECTED_LINES_DELETED: "isaac.ai_output.rejected.lines_deleted.total",
		REJECTED_LINES_CHANGED: "isaac.ai_output.rejected.lines_changed.total",
		REJECTED_FILES_CREATED: "isaac.ai_output.rejected.files_created.total",
		REJECTED_FILES_DELETED: "isaac.ai_output.rejected.files_deleted.total",
		REJECTED_FILES_MOVED: "isaac.ai_output.rejected.files_moved.total",
	},
	GRPC: {
		RESPONSE_SIZE_BYTES: "isaac.grpc.response.size_bytes",
	},
} as const

/**
 * Event name constants for tracking user interactions and system events,
 * grouped by domain.
 */
export const TELEMETRY_EVENTS = {
	// Task-related events for tracking conversation and execution flow

	USER: {
		OPT_OUT: "user.opt_out",
		OPT_IN: "user.opt_in",
		TELEMETRY_ENABLED: "user.telemetry_enabled",
		EXTENSION_ACTIVATED: "user.extension_activated",
		EXTENSION_STORAGE_ERROR: "user.extension_storage_error",
		AUTH_STARTED: "user.auth_started",
		AUTH_SUCCEEDED: "user.auth_succeeded",
		AUTH_FAILED: "user.auth_failed",
		AUTH_LOGGED_OUT: "user.auth_logged_out",
		ONBOARDING_PROGRESS: "user.onboarding_progress",
	},
	// Workspace-related events for multi-root support
	WORKSPACE: {
		// Track workspace initialization
		INITIALIZED: "workspace.initialized",
		// Track initialization errors
		INIT_ERROR: "workspace.init_error",
		// Track VCS detection
		VCS_DETECTED: "workspace.vcs_detected",
		// Track multi-root checkpoint operations
		MULTI_ROOT_CHECKPOINT: "workspace.multi_root_checkpoint",
		// Track workspace resolution
		PATH_RESOLVED: "workspace.path_resolved",
	},
	TASK: {
		// Tracks when a new task/conversation is started
		CREATED: "task.created",
		// Tracks when a task is reopened
		RESTARTED: "task.restarted",
		// Tracks when a task is finished, with acceptance or rejection status
		COMPLETED: "task.completed",
		// Tracks user feedback on completed tasks
		FEEDBACK: "task.feedback",
		// Tracks when a message is sent in a conversation
		CONVERSATION_TURN: "task.conversation_turn",
		// Tracks token consumption for cost and usage analysis
		TOKEN_USAGE: "task.tokens",
		// Tracks switches between plan and act modes
		MODE_SWITCH: "task.mode",
		// Tracks when users select an option from AI-generated followup questions
		OPTION_SELECTED: "task.option_selected",
		// Tracks when users type a custom response instead of selecting an option from AI-generated followup questions
		OPTIONS_IGNORED: "task.options_ignored",
		// Tracks usage of the git-based checkpoint system (shadow_git_initialized, commit_created, branch_created, branch_deleted_active, branch_deleted_inactive, restored)
		CHECKPOINT_USED: "task.checkpoint_used",
		// Tracks when tools (like file operations, commands) are used
		TOOL_USED: "task.tool_used",
		// Tracks when a historical task is loaded from storage
		HISTORICAL_LOADED: "task.historical_loaded",
		// Tracks when the retry button is clicked for failed operations
		RETRY_CLICKED: "task.retry_clicked",
		// Tracks when a diff edit (replace_in_file) operation fails

		// Tracks when the browser tool is started
		BROWSER_TOOL_START: "task.browser_tool_start",
		// Tracks when the browser tool is completed
		BROWSER_TOOL_END: "task.browser_tool_end",
		// Tracks when browser errors occur
		BROWSER_ERROR: "task.browser_error",
		// Tracks Gemini API specific performance metrics
		GEMINI_API_PERFORMANCE: "task.gemini_api_performance",
		// Tracks when API providers return errors
		PROVIDER_API_ERROR: "task.provider_api_error",
		// Tracks when the context window is auto-condensed with the summarize_task tool call
		AUTO_COMPACT: "task.summarize_task",
		// Tracks when slash commands or workflows are activated
		SLASH_COMMAND_USED: "task.slash_command_used",
		// Tracks when a feature is toggled on/off
		FEATURE_TOGGLED: "task.feature_toggled",
		// Tracks when individual Isaac rules are toggled on/off
		RULE_TOGGLED: "task.rule_toggled",
		// Tracks when auto condense setting is toggled on/off
		AUTO_CONDENSE_TOGGLED: "task.auto_condense_toggled",
		// Tracks when yolo mode setting is toggled on/off
		YOLO_MODE_TOGGLED: "task.yolo_mode_toggled",
		// Tracks when Isaac web tools setting is toggled on/off
		CLINE_WEB_TOOLS_TOGGLED: "task.isaac_web_tools_toggled",
		// Tracks task initialization timing
		INITIALIZATION: "task.initialization",
		// Terminal execution telemetry events
		TERMINAL_EXECUTION: "task.terminal_execution",
		TERMINAL_OUTPUT_FAILURE: "task.terminal_output_failure",
		TERMINAL_USER_INTERVENTION: "task.terminal_user_intervention",
		TERMINAL_HANG: "task.terminal_hang",
		// Mention telemetry events
		MENTION_USED: "task.mention_used",
		MENTION_FAILED: "task.mention_failed",
		MENTION_SEARCH_RESULTS: "task.mention_search_results",
		// Multi-workspace search pattern tracking
		WORKSPACE_SEARCH_PATTERN: "task.workspace_search_pattern",
		// CLI Subagents telemetry events
		SUBAGENT_ENABLED: "task.subagent_enabled",
		SUBAGENT_DISABLED: "task.subagent_disabled",
		SUBAGENT_STARTED: "task.subagent_started",
		SUBAGENT_COMPLETED: "task.subagent_completed",
		// Skills telemetry events
		SKILL_USED: "task.skill_used",
		// Tracks when a tool name parsed from the model is rejected
		// (hallucinated or forbidden shape, e.g. `digikey:search`)
		INVALID_TOOL_NAME: "task.invalid_tool_name",
	},
	// UI interaction events for tracking user engagement
	UI: {
		// Tracks when a different model is selected
		MODEL_SELECTED: "ui.model_selected",
		// Tracks when users use the "favorite" button in the model picker
		MODEL_FAVORITE_TOGGLED: "ui.model_favorite_toggled",
		// Tracks when a button is clicked
		BUTTON_CLICKED: "ui.button_clicked",
		// Tracks when the rules menu button is clicked
		RULES_MENU_OPENED: "ui.rules_menu_opened",
	},
	// Hooks-related events for tracking hook execution
	HOOKS: {
		// Tracks when hooks feature is enabled
		ENABLED: "hooks.enabled",
		// Tracks when hooks feature is disabled
		DISABLED: "hooks.disabled",
		// Tracks when a hook requests task cancellation
		CANCEL_REQUESTED: "hooks.cancel_requested",
		// Tracks when a hook modifies context
		CONTEXT_MODIFIED: "hooks.context_modified",
		// Tracks when hook discovery completes
		DISCOVERY_COMPLETED: "hooks.discovery_completed",
	},
	// Worktree-related events for tracking worktree feature usage
	WORKTREE: {
		// Tracks when user opens worktrees view from home page
		VIEW_OPENED: "worktree.view_opened",
		// Tracks when a worktree is created
		CREATED: "worktree.created",
		// Tracks when a worktree merge is attempted
		MERGE_ATTEMPTED: "worktree.merge_attempted",
	},
	HOST: {
		// Tracks events detected from the host environment
		DETECTED: "host.detected",
	},
} as const
