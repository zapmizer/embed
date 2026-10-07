import type { EmbedAction, EmbedErrorCode, SessionRefused } from './state';
export declare const defaultMessages: Record<string, string>;
export declare function actionFor(code: EmbedErrorCode): EmbedAction;
export declare function codeForRefusal(refusal: SessionRefused): EmbedErrorCode;
export declare function toRefusal(error: unknown): SessionRefused;
