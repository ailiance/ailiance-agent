import React, { useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { centerText } from '../utils/display';

export type PlaybackAPI = {
	play: () => void;
	pause: () => void;
	restart: () => void;
};

export type AsciiMotionCliProps = {
	hasDarkBackground?: boolean;
	onInteraction?: (input: string, key: any) => void;
	autoPlay?: boolean;
	loop?: boolean;
	onReady?: (api: PlaybackAPI) => void;
};

// agent-kiki fork: replaced upstream Dirac delta logo with the
// L'Electron Rare "ER" PCB-trace logo. Original asset:
// /Users/electron/Business OS/logo ER.png — three letters E·r·R
// with copper traces, pads, and through-holes, evoking a PCB.
const _ER_COLORS = {
	e: '#22D3EE',     // cyan — the "E" letter
	r_lower: '#84CC16', // green — the small "r"
	r_upper: '#EC4899', // magenta/pink — the "R" letter
	pad: '#E4E4E7',
	via: '#F59E0B',   // amber — the central yellow via
	component: '#3F3F46',
};

// ASCII art ER logo (E·r·R). Compact 12-line variant tuned for a
// terminal width of ~30 cols. Glyphs: ● = pad/via, ┐┘ = corners,
// ─│ = traces, [R1][C3][U2] = components.
const ER_LOGO = [
	" ●─────────●   ●        ●─────●",
	" │ ┌──┐    │   │       ╱        ",
	" │ │R1│ ●──┤   │   ●●●●         ",
	" │ └──┘    │   │   ●  ●         ",
	" ●────●    │   ●───●            ",
	" │         │   │      ╲         ",
	" │         │   │   r   ●        ",
	" │ ┌──┐    │   │      ╱         ",
	" │ │C3│ ●──┤   ●─────●           ",
	" │ └──┘    │   │      ╲    [U2] ",
	" ●─────────●   ●       ●────●   ",
];

export const StaticRobotFrame: React.FC<{ hasDarkBackground?: boolean }> = () => {
	return (
		<Box flexDirection="column" marginBottom={1} marginTop={1}>
			{ER_LOGO.map((line, idx) => (
				<Text color={_ER_COLORS.e} key={idx}>
					{centerText(line)}
				</Text>
			))}
		</Box>
	);
};

/**
 * AsciiMotionCli - Now a static version of the Dirac logo.
 * Maintained for compatibility with existing views, but with all animation logic removed.
 */
export const AsciiMotionCli: React.FC<AsciiMotionCliProps> = ({ onReady, onInteraction }) => {
	useEffect(() => {
		if (onReady) {
			onReady({
				play: () => {},
				pause: () => {},
				restart: () => {},
			});
		}
	}, [onReady]);

	// Trigger onInteraction to allow dismissing the welcome state via any keypress
	useInput((input, key) => {
		if (onInteraction) {
			onInteraction(input, key);
		}
	});

	return <StaticRobotFrame />;
};
