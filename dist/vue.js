import"./chunks/conversation-k9ba15ty.js";
import"./chunks/conversation-6md6txsp.js";
import {
  createConversation2
} from "./chunks/conversation-pj4k3fb2.js";
import"./chunks/conversation-bjypth2h.js";
import {
  createInboxHost2
} from "./chunks/conversation-yx2gn52p.js";
import"./chunks/conversation-b0rwqgkr.js";

// src/vue.ts
import { defineComponent, getCurrentScope, h, onBeforeUnmount, onMounted, onScopeDispose, ref, shallowRef, toValue, watch } from "vue";
var EmbedConversation = defineComponent({
  name: "EmbedConversation",
  inheritAttrs: false,
  props: {
    openSession: { type: Function, required: true },
    brand: { type: String, required: true },
    frame: { type: Object, default: undefined },
    readyTimeoutMs: { type: Number, default: undefined }
  },
  emits: ["message-sent"],
  setup(props, { slots, emit }) {
    const container = ref(null);
    const state = shallowRef({ status: "opening", frame: "none" });
    const height = ref(null);
    let conversation = null;
    onMounted(() => {
      const element = container.value;
      if (element === null) {
        return;
      }
      conversation = createConversation2({
        container: element,
        brand: props.brand,
        frame: props.frame,
        readyTimeoutMs: props.readyTimeoutMs,
        openSession: () => props.openSession(),
        onState: (next) => {
          state.value = next;
        },
        onResize: (next) => {
          height.value = next;
        },
        onMessageSent: (messageId) => emit("message-sent", messageId)
      });
    });
    onBeforeUnmount(() => {
      conversation?.destroy();
      conversation = null;
    });
    const retry = () => conversation?.retry();
    const reopen = () => conversation?.reopen();
    return () => [h("div", { ref: container }), slots.default?.({ state: state.value, retry, reopen, height: height.value })];
  }
});
function useInboxHost(options) {
  const state = shallowRef({ status: "closed", frame: "none" });
  const host = createInboxHost2({
    ...options,
    onState: (next) => {
      state.value = next;
      options.onState?.(next);
    }
  });
  if (getCurrentScope() !== undefined) {
    onScopeDispose(() => host.destroy());
  }
  return { host, state, retry: () => host.retry() };
}
function useInboxSlot(host, options) {
  const slot = ref(null);
  const isEnabled = () => toValue(options.enabled ?? true);
  function attachIfEnabled() {
    const element = slot.value;
    if (element !== null && isEnabled()) {
      host.attach(element, toValue(options.person));
    }
  }
  onMounted(attachIfEnabled);
  watch([() => toValue(options.person), isEnabled], ([, enabled], [, wasEnabled]) => {
    if (enabled) {
      attachIfEnabled();
    } else if (wasEnabled) {
      host.close();
    }
  });
  onBeforeUnmount(() => {
    const element = slot.value;
    if (element !== null) {
      host.detach(element);
    }
  });
  return slot;
}
export {
  EmbedConversation,
  useInboxHost,
  useInboxSlot
};
