export declare function parseEmbedMessage(event: MessageEvent, expected: ExpectedSender): EmbedMessage | null;
export type EmbedEndType = 'session_expired' | 'session_revoked' | 'subscription_required' | 'session_replaced';
export type EmbedMessage = {
    type: 'ready';
} | {
    type: 'resize';
    height: number;
} | {
    type: 'message_sent';
    message_id: string | number;
} | {
    type: EmbedEndType;
};
type ExpectedSender = {
    brand: string;
    origin: string;
    frame: Window | null;
};
export {};
