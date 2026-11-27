import type { EmbedErrorCode, EmbedState, MachineView } from '../state.js';
export declare const AUTO_REOPEN_GAP_MS = 60000;
export declare const LINK_REOPENS_PER_GAP = 2;
export declare function failed(code: EmbedErrorCode, frame: 'none' | 'loading', retryAfter?: number): EmbedState;
export declare function exposed(view: MachineView): EmbedState;
export declare function canAutoReopen(lastAutoReopenAt: number | null, now: number): boolean;
export declare function recentReopens(reopenedAt: readonly number[], now: number): number[];
