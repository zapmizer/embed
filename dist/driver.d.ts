import type { EmbedMessage } from './messages';
import type { Clock, FrameOptions, OpenSession, SessionOpened, SessionRefused } from './state';
export declare const CONVERSATION_FRAME: FrameKind;
export declare const INBOX_FRAME: FrameKind;
export declare const defaultClock: Clock;
export declare function serialDispatcher<E>(handle: (event: E) => void): (event: E) => void;
export declare function isUsableSession(session: unknown): session is SessionOpened;
export declare function requestSession(openSession: OpenSession, onOpened: (session: SessionOpened) => void, onRefused: (refusal: SessionRefused) => void): void;
export declare function createFrameSlot(options: FrameSlotOptions): FrameSlot;
export type FrameKind = {
    allow: string;
    sandbox: string;
    title: string;
};
export type FrameSlot = {
    mount(url: string, origin: string): void;
    unmount(): void;
    stop(): void;
};
type FrameSlotOptions = {
    container: HTMLElement;
    brand: string;
    kind: FrameKind;
    frame: FrameOptions | undefined;
    onMessage: (message: EmbedMessage) => void;
};
export {};
