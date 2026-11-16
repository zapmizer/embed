import type { ResumeStorage } from './resume.js';
export declare function endEmbeds(options: EndEmbedsOptions): void;
export declare function listenToLogout(options: ListenToLogoutOptions): () => void;
export type EndEmbedsOptions = {
    brand: string;
    storage?: ResumeStorage | null;
    broadcast?: boolean;
};
export type ListenToLogoutOptions = {
    brand: string;
    storage?: ResumeStorage | null;
};
