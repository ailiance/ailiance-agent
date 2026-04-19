import { useEffect, useRef, useState } from "react"
import { useDebounceEffect } from "@/shared/lib/useDebounceEffect"

/**
 * A custom hook that provides debounced input handling to prevent jumpy text inputs
 * when saving changes directly to backend on every keystroke.
 *
 * @param initialValue - The initial value for the input
 * @param onChange - Callback function to save the value (e.g., to backend)
 * @param debounceMs - Debounce delay in milliseconds (default: 500ms)
 * @returns A tuple of [currentValue, setValue] similar to useState
 */
export function useDebouncedInput<T>(initialValue: T, onChange: (value: T) => void, debounceMs = 100): [T, (value: T) => void] {
	// Local state to prevent jumpy input - initialize once
	const [localValue, setLocalValue] = useState(initialValue)

	// Track previous initialValue to detect external changes
	const prevInitialValueRef = useRef<T>(initialValue)

	// Track the last value we sent to onChange to avoid syncing back older values from the store
	const lastSentValueRef = useRef<T>(initialValue)

	// Sync local state when initialValue changes externally (e.g., when switching Plan/Act tabs)
	useEffect(() => {
		if (prevInitialValueRef.current !== initialValue) {
			// Only update localValue if initialValue is different from what we last sent
			// This prevents the "jumping cursor" or "disappearing characters" bug when
			// the store update (triggered by our own onChange) reflects back to us.
			if (initialValue !== lastSentValueRef.current) {
				setLocalValue(initialValue)
			}
			prevInitialValueRef.current = initialValue
			lastSentValueRef.current = initialValue
		}
	}, [initialValue])

	// Debounced backend save - saves after user stops changing value
	useDebounceEffect(
		() => {
			if (localValue !== lastSentValueRef.current) {
				onChange(localValue)
				lastSentValueRef.current = localValue
			}
		},
		debounceMs,
		[localValue],
	)

	return [localValue, setLocalValue]
}
