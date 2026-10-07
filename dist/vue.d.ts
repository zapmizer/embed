import type { MaybeRefOrGetter, PropType, Ref, ShallowRef } from 'vue';
import type { InboxHost, InboxHostOptions } from './host';
import type { EmbedState, FrameOptions, OpenSession } from './state';
export declare const EmbedConversation: import("vue").DefineComponent<import("vue").ExtractPropTypes<{
    openSession: {
        type: PropType<OpenSession>;
        required: true;
    };
    brand: {
        type: StringConstructor;
        required: true;
    };
    frame: {
        type: PropType<FrameOptions>;
        default: undefined;
    };
    readyTimeoutMs: {
        type: NumberConstructor;
        default: undefined;
    };
}>, () => (import("vue").VNode<import("vue").RendererNode, import("vue").RendererElement, {
    [key: string]: any;
}>[] | import("vue").VNode<import("vue").RendererNode, import("vue").RendererElement, {
    [key: string]: any;
}> | undefined)[], {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, "message-sent"[], "message-sent", import("vue").PublicProps, Readonly<import("vue").ExtractPropTypes<{
    openSession: {
        type: PropType<OpenSession>;
        required: true;
    };
    brand: {
        type: StringConstructor;
        required: true;
    };
    frame: {
        type: PropType<FrameOptions>;
        default: undefined;
    };
    readyTimeoutMs: {
        type: NumberConstructor;
        default: undefined;
    };
}>> & Readonly<{
    "onMessage-sent"?: ((...args: any[]) => any) | undefined;
}>, {
    frame: FrameOptions;
    readyTimeoutMs: number;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
export declare function useInboxHost(options: UseInboxHostOptions): UseInboxHost;
export declare function useInboxSlot(host: InboxHost, options: UseInboxSlotOptions): Ref<HTMLElement | null>;
export type UseInboxHostOptions = Omit<InboxHostOptions, 'onState'> & {
    onState?: (state: EmbedState) => void;
};
export type UseInboxHost = {
    host: InboxHost;
    state: ShallowRef<EmbedState>;
    retry: () => void;
};
export type UseInboxSlotOptions = {
    person: MaybeRefOrGetter<string | null>;
    enabled?: MaybeRefOrGetter<boolean>;
};
