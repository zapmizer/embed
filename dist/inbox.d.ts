import type { ResumeStorage } from './resume';
import type { Clock, EmbedState, FrameOptions, KeepAlive, OpenSession } from './state';
export declare function createInbox(options: InboxOptions): Inbox;
export type InboxOptions = {
    container: HTMLElement;
    brand: string;
    openSession: OpenSession;
    person: string | null;
    onState: (state: EmbedState) => void;
    keepAlive?: KeepAlive;
    storage?: ResumeStorage | null;
    frame?: FrameOptions;
    readyTimeoutMs?: number;
    keepAliveMs?: number;
    clock?: Clock;
};
export type Inbox = {
    readonly state: EmbedState;
    retry(): void;
    setVisible(value: boolean): void;
    destroy(): void;
};
