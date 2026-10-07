export declare function resumeKey(brand: string, person: string): string;
export declare function defaultResumeStorage(): ResumeStorage | null;
export declare function webOriginOf(address: string): string | null;
export declare function readResume(storage: ResumeStorage | null, key: string, now: number): ResumeEntry | null;
export declare function rememberResume(storage: ResumeStorage | null, key: string, entry: ResumeEntry): void;
export declare function forgetResumeIf(storage: ResumeStorage | null, key: string, url: string): void;
export declare function forgetOtherResumes(storage: ResumeStorage | null, brand: string, key: string | null): void;
export declare function forgetAllResumes(storage: ResumeStorage | null, brand: string): void;
export interface ResumeStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
    key(index: number): string | null;
    readonly length: number;
}
export type ResumeEntry = {
    url: string;
    origin: string;
    until: string;
};
