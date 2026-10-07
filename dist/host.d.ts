import type { ResumeStorage } from './resume';
import type { Clock, EmbedState, FrameOptions, KeepAlive, OpenSession } from './state';
export declare function createInboxHost(options: InboxHostOptions): InboxHost;
export type InboxHostOptions = {
    brand: string;
    openSession: OpenSession;
    onState: (state: EmbedState) => void;
    keepAlive?: KeepAlive;
    storage?: ResumeStorage | null;
    frame?: FrameOptions;
    idleMs?: number;
    readyTimeoutMs?: number;
    keepAliveMs?: number;
    clock?: Clock;
};
export type InboxHost = {
    readonly element: HTMLDivElement;
    readonly overlay: HTMLDivElement;
    readonly state: EmbedState;
    attach(slot: HTMLElement, person: string | null): void;
    detach(slot: HTMLElement): void;
    retry(): void;
    close(): void;
    destroy(): void;
};
