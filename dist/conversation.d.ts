import type { Clock, EmbedState, FrameOptions, OpenSession } from './state';
export declare function createConversation(options: ConversationOptions): Conversation;
export type ConversationOptions = {
    container: HTMLElement;
    brand: string;
    openSession: OpenSession;
    onState: (state: EmbedState) => void;
    onResize?: (height: number) => void;
    onMessageSent?: (messageId: string | number) => void;
    frame?: FrameOptions;
    readyTimeoutMs?: number;
    clock?: Clock;
};
export type Conversation = {
    readonly state: EmbedState;
    retry(): void;
    reopen(): void;
    destroy(): void;
};
