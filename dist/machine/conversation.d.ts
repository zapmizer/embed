import type { EmbedMessage } from '../messages';
import type { MachineView, SessionOpened, SessionRefused } from '../state';
export declare function initialState(): ConversationMachine;
export declare function transition(state: ConversationMachine, event: ConversationEvent, ctx: {
    now: number;
}): ConversationStep;
export type ConversationMachine = {
    view: MachineView;
    gen: number;
    lastAutoReopenAt: number | null;
};
export type ConversationEvent = {
    type: 'start';
} | {
    type: 'session_opened';
    gen: number;
    session: SessionOpened;
} | {
    type: 'session_refused';
    gen: number;
    refusal: SessionRefused;
} | {
    type: 'iframe';
    message: EmbedMessage;
} | {
    type: 'ready_timeout';
    gen: number;
} | {
    type: 'retry';
} | {
    type: 'reopen';
} | {
    type: 'logout';
} | {
    type: 'destroy';
};
export type ConversationEffect = {
    type: 'open_session';
    gen: number;
} | {
    type: 'mount_iframe';
    url: string;
    origin: string;
} | {
    type: 'unmount_iframe';
} | {
    type: 'arm_ready_timeout';
    gen: number;
} | {
    type: 'clear_ready_timeout';
} | {
    type: 'emit_resize';
    height: number;
} | {
    type: 'emit_message_sent';
    message_id: string | number;
} | {
    type: 'notify';
};
export type ConversationStep = {
    state: ConversationMachine;
    effects: ConversationEffect[];
};
