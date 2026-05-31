import type { ReactNode } from "react"
import { vi } from "vitest"

// ink-picture's <TerminalInfoProvider> emits a CSI 16 t (cell-size-in-pixels)
// query to stdout on mount to size terminal images. In the non-TTY test
// environment that escape pollutes rendered frames — lastFrame() returns
// "[16t" instead of the component output, failing every component test
// that mounts <App> (or any tree wrapped by the provider). Stub the whole
// module to inert no-ops so tests render real frames. Runtime is untouched;
// this mock is test-only and applies to every test file via setupFiles.
vi.mock("ink-picture", () => {
	const PassThrough = ({ children }: { children?: ReactNode }): ReactNode => children ?? null
	const Empty = (): ReactNode => null
	return {
		default: Empty, // <Image /> default export
		TerminalInfoProvider: PassThrough,
		TerminalInfoContext: { Provider: PassThrough, Consumer: PassThrough },
		useTerminalInfo: () => ({}),
		useTerminalDimensions: () => ({ columns: 80, rows: 24, width: 80, height: 24 }),
		useTerminalCapabilities: () => ({}),
		AsciiImage: Empty,
		BrailleImage: Empty,
		HalfBlockImage: Empty,
		SixelImage: Empty,
		usePosition: () => ({}),
	}
})
