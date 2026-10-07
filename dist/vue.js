import"./chunks/conversation-8vvt7dm7.js";
import"./chunks/conversation-6md6txsp.js";
import {
  createConversation2
} from "./chunks/conversation-2pbqf8y2.js";
import"./chunks/conversation-fwv8fg91.js";
import {
  createInboxHost2
} from "./chunks/conversation-gc5c7ppn.js";
import"./chunks/conversation-zyx12f77.js";
import"./chunks/conversation-zmxh8xgq.js";

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
  const { person, enabled, onState, ...hostOptions } = options;
  const state = shallowRef({ status: "closed", frame: "none" });
  const host = createInboxHost2({
    ...hostOptions,
    onState: (next) => {
      state.value = next;
      onState?.(next);
    }
  });
  if (person !== undefined || enabled !== undefined) {
    watch([() => toValue(person), () => toValue(enabled ?? true)], ([nextPerson, isEnabled]) => {
      if (!isEnabled || person !== undefined && nextPerson !== host.person) {
        host.close();
      }
    });
  }
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
  watch([() => toValue(options.person), isEnabled], ([person, enabled], [previousPerson, wasEnabled]) => {
    if (enabled && person === null && previousPerson !== null) {
      host.close();
    } else if (enabled) {
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
