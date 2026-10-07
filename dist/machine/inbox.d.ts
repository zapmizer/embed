import type { EmbedMessage } from '../messages';
import type { ResumeEntry } from '../resume';
import type { MachineView, SessionOpened, SessionRefused } from '../state';
export declare function initialState(options: {
    resumable: boolean;
    visible: boolean;
}): InboxMachine;
export declare function transition(state: InboxMachine, event: InboxEvent, ctx: {
    now: number;
}): InboxStep;
export type InboxMachine = {
    view: MachineView;
    gen: number;
    resumable: boolean;
    via: 'fresh' | 'resume';
    ownResumeUrl: string | null;
    pendingResume: ResumeEntry | null;
    lastAutoReopenAt: number | null;
    visible: boolean;
    reopenOnShow: boolean;
    retryOnShow: boolean;
    resumeHopUsed: boolean;
    reading: 'start' | 'replaced' | 'retry' | null;
};
export type InboxEvent = {
    type: 'start';
} | {
    type: 'resume_read';
    entry: ResumeEntry | null;
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
    type: 'visible';
    value: boolean;
} | {
    type: 'keepalive_tick';
} | {
    type: 'keepalive_failed';
    status: number;
} | {
    type: 'logout';
} | {
    type: 'destroy';
};
export type InboxEffect = {
    type: 'read_resume';
} | {
    type: 'remember_resume';
    entry: ResumeEntry;
} | {
    type: 'forget_resume_if';
    url: string;
} | {
    type: 'forget_other_resumes';
} | {
    type: 'forget_all_resumes';
} | {
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
    type: 'keep_alive';
} | {
    type: 'notify';
};
export type InboxStep = {
    state: InboxMachine;
    effects: InboxEffect[];
};
