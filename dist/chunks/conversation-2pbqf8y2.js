import {
  codeForRefusal2
} from "./conversation-8vvt7dm7.js";
import {
  failed,
  exposed,
  canAutoReopen
} from "./conversation-zyx12f77.js";
import {
  CONVERSATION_FRAME,
  defaultClock,
  isolated,
  serialDispatcher,
  requestSession,
  createFrameSlot,
  registerEmbed
} from "./conversation-zmxh8xgq.js";

// src/machine/conversation.ts
function initialState() {
  return { view: { status: "idle", frame: "none" }, gen: 0, lastAutoReopenAt: null };
}
function transition(state, event, ctx) {
  const step = decide(state, event, ctx.now);
  return step.state.view === state.view ? step : { state: step.state, effects: [...step.effects, { type: "notify" }] };
}
function decide(state, event, now) {
  if (state.view.status === "closed") {
    return stay(state);
  }
  if (event.type === "logout" || event.type === "destroy") {
    return {
      state: { ...state, gen: state.gen + 1, view: { status: "closed", frame: "none" } },
      effects: [{ type: "clear_ready_timeout" }, { type: "unmount_iframe" }]
    };
  }
  if (event.type === "start") {
    return state.view.status === "idle" ? opening(state, "none") : stay(state);
  }
  if (event.type === "session_opened") {
    return sessionOpened(state, event.gen, event.session);
  }
  if (event.type === "session_refused") {
    return sessionRefused(state, event.gen, event.refusal);
  }
  if (event.type === "ready_timeout") {
    return readyTimeout(state, event.gen);
  }
  if (event.type === "retry") {
    return retry(state);
  }
  if (event.type === "reopen") {
    return reopen(state);
  }
  return fromFrame(state, event.message, now);
}
function opening(state, frame, before = []) {
  return {
    state: { ...state, view: { status: "opening", frame } },
    effects: [...before, { type: "open_session", gen: state.gen }]
  };
}
function sessionOpened(state, gen, session) {
  if (state.view.status !== "opening" || gen !== state.gen) {
    return stay(state);
  }
  const next = state.gen + 1;
  const before = state.view.frame === "stale" ? [{ type: "unmount_iframe" }] : [];
  return {
    state: { ...state, gen: next, view: { status: "loading", frame: "loading" } },
    effects: [...before, { type: "mount_iframe", url: session.url, origin: session.origin }, { type: "arm_ready_timeout", gen: next }]
  };
}
function sessionRefused(state, gen, refusal) {
  if (state.view.status !== "opening" || gen !== state.gen) {
    return stay(state);
  }
  return {
    state: { ...state, view: failed(codeForRefusal2(refusal), "none", refusal.retryAfter) },
    effects: state.view.frame === "stale" ? [{ type: "unmount_iframe" }] : []
  };
}
function readyTimeout(state, gen) {
  if (state.view.status !== "loading" || gen !== state.gen) {
    return stay(state);
  }
  return { state: { ...state, view: failed("ready_timeout", "loading") }, effects: [] };
}
function retry(state) {
  if (state.view.status !== "error") {
    return stay(state);
  }
  return opening({ ...state, gen: state.gen + 1 }, "none", [{ type: "unmount_iframe" }]);
}
function reopen(state) {
  const view = state.view;
  const reopenable = view.status === "opening" || view.status === "loading" || view.status === "ready" || view.status === "error" && view.action === "retry";
  if (!reopenable) {
    return stay(state);
  }
  return opening({ ...state, gen: state.gen + 1 }, view.frame === "none" ? "none" : "stale");
}
function fromFrame(state, message, now) {
  const view = state.view;
  const framed = view.status === "loading" || view.status === "error" && view.frame === "loading";
  if (message.type === "resize") {
    return framed || view.status === "ready" ? { state, effects: [{ type: "emit_resize", height: message.height }] } : stay(state);
  }
  if (message.type === "message_sent") {
    return view.status === "ready" ? { state, effects: [{ type: "emit_message_sent", message_id: message.message_id }] } : stay(state);
  }
  if (message.type === "ready") {
    if (!framed) {
      return stay(state);
    }
    return {
      state: { ...state, view: { status: "ready", frame: "live" } },
      effects: view.status === "loading" ? [{ type: "clear_ready_timeout" }] : []
    };
  }
  if (message.type === "session_replaced") {
    return stay(state);
  }
  if (framed) {
    return ended(state, message.type, view.status === "loading" ? [{ type: "clear_ready_timeout" }] : []);
  }
  if (view.status !== "ready") {
    return stay(state);
  }
  if (message.type === "session_expired" && canAutoReopen(state.lastAutoReopenAt, now)) {
    return opening({ ...state, lastAutoReopenAt: now }, "stale");
  }
  return ended(state, message.type, []);
}
function ended(state, code, before) {
  return { state: { ...state, view: failed(code, "none") }, effects: [...before, { type: "unmount_iframe" }] };
}
function stay(state) {
  return { state, effects: [] };
}

// src/conversation.ts
function createConversation2(options) {
  const clock = options.clock ?? defaultClock;
  const readyTimeoutMs = options.readyTimeoutMs ?? 45000;
  let machine = initialState();
  let cancelReadyTimeout = null;
  let released = false;
  const dispatch = serialDispatcher((event) => {
    const step = transition(machine, event, { now: clock.now() });
    machine = step.state;
    step.effects.forEach(run);
    if (machine.view.status === "closed") {
      release();
    }
  });
  const slot = createFrameSlot({
    container: options.container,
    brand: options.brand,
    kind: CONVERSATION_FRAME,
    frame: options.frame,
    onMessage: (message) => dispatch({ type: "iframe", message })
  });
  const unregister = registerEmbed(options.brand, () => dispatch({ type: "logout" }));
  function clearReadyTimeout() {
    cancelReadyTimeout?.();
    cancelReadyTimeout = null;
  }
  function release() {
    if (released) {
      return;
    }
    released = true;
    clearReadyTimeout();
    slot.stop();
    unregister();
  }
  function run(effect) {
    if (effect.type === "open_session") {
      const gen = effect.gen;
      requestSession(options.openSession, (session) => dispatch({ type: "session_opened", gen, session }), (refusal) => dispatch({ type: "session_refused", gen, refusal }));
    } else if (effect.type === "mount_iframe") {
      slot.mount(effect.url, effect.origin);
    } else if (effect.type === "unmount_iframe") {
      slot.unmount();
    } else if (effect.type === "arm_ready_timeout") {
      const gen = effect.gen;
      clearReadyTimeout();
      cancelReadyTimeout = clock.after(readyTimeoutMs, () => {
        cancelReadyTimeout = null;
        dispatch({ type: "ready_timeout", gen });
      });
    } else if (effect.type === "clear_ready_timeout") {
      clearReadyTimeout();
    } else if (effect.type === "emit_resize") {
      const height = effect.height;
      isolated(() => options.onResize?.(height));
    } else if (effect.type === "emit_message_sent") {
      const messageId = effect.message_id;
      isolated(() => options.onMessageSent?.(messageId));
    } else {
      const state = exposed(machine.view);
      isolated(() => options.onState(state));
    }
  }
  dispatch({ type: "start" });
  return {
    get state() {
      return exposed(machine.view);
    },
    retry: () => dispatch({ type: "retry" }),
    reopen: () => dispatch({ type: "reopen" }),
    destroy: () => dispatch({ type: "destroy" })
  };
}

export { createConversation2 };
