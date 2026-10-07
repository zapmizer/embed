import {
  actionFor2,
  codeForRefusal2,
  toRefusal2
} from "./conversation-8vvt7dm7.js";
import {
  resumeKey2,
  defaultResumeStorage2,
  readResume2,
  rememberResume2,
  forgetResumeIf2,
  forgetOtherResumes2,
  forgetAllResumes2
} from "./conversation-6md6txsp.js";
import {
  failed,
  exposed,
  canAutoReopen
} from "./conversation-zyx12f77.js";
import {
  INBOX_FRAME,
  defaultClock,
  isolated,
  serialDispatcher,
  requestSession,
  createFrameSlot,
  registerEmbed
} from "./conversation-zmxh8xgq.js";

// src/machine/inbox.ts
var RESUME_EFFECTS = new Set(["read_resume", "remember_resume", "forget_resume_if", "forget_other_resumes", "forget_all_resumes"]);
function initialState(options) {
  return {
    view: { status: "idle", frame: "none" },
    gen: 0,
    resumable: options.resumable,
    via: "fresh",
    ownResumeUrl: null,
    pendingResume: null,
    lastAutoReopenAt: null,
    visible: options.visible,
    reopenOnShow: false,
    retryOnShow: false,
    resumeHopUsed: false,
    reading: null
  };
}
function transition(state, event, ctx) {
  const step = decide(state, event, ctx.now);
  const effects = state.resumable ? step.effects : step.effects.filter((effect) => !RESUME_EFFECTS.has(effect.type));
  return { state: step.state, effects: step.state.view === state.view ? effects : [...effects, { type: "notify" }] };
}
function decide(state, event, now) {
  if (state.view.status === "closed") {
    return stay(state);
  }
  if (event.type === "logout") {
    return close(state, true);
  }
  if (event.type === "destroy") {
    return close(state, false);
  }
  if (event.type === "keepalive_failed") {
    return event.status === 401 || event.status === 419 ? close(state, true) : stay(state);
  }
  if (event.type === "start") {
    return start(state);
  }
  if (event.type === "resume_read") {
    return resumeRead(state, event.entry);
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
  if (event.type === "visible") {
    return visibility(state, event.value, now);
  }
  if (event.type === "keepalive_tick") {
    return state.view.status === "ready" && state.visible ? { state, effects: [{ type: "keep_alive" }] } : stay(state);
  }
  return fromFrame(state, event.message, now);
}
function close(state, forgetAll) {
  const effects = [{ type: "clear_ready_timeout" }, { type: "unmount_iframe" }];
  return {
    state: { ...state, gen: state.gen + 1, view: { status: "closed", frame: "none" }, reading: null },
    effects: forgetAll ? [...effects, { type: "forget_all_resumes" }] : effects
  };
}
function start(state) {
  if (state.view.status !== "idle") {
    return stay(state);
  }
  if (!state.resumable) {
    return openFresh(state, "none", []);
  }
  return { state: { ...state, reading: "start" }, effects: [{ type: "forget_other_resumes" }, { type: "read_resume" }] };
}
function resumeRead(state, entry) {
  if (state.reading === "start") {
    return entry === null ? openFresh(state, "none", []) : loadResume(state, entry, [], false);
  }
  if (state.reading === "replaced") {
    if (entry !== null && entry.url !== state.ownResumeUrl && !state.resumeHopUsed) {
      return loadResume(state, entry, [{ type: "clear_ready_timeout" }, { type: "unmount_iframe" }], true);
    }
    return {
      state: { ...state, view: failed("session_replaced", "none"), pendingResume: null, retryOnShow: false, reading: null },
      effects: [{ type: "clear_ready_timeout" }, ...forgetOwn(state), { type: "unmount_iframe" }]
    };
  }
  if (state.reading === "retry") {
    return entry !== null && entry.url !== state.ownResumeUrl ? loadResume(state, entry, [], state.resumeHopUsed) : openFresh(state, "none", []);
  }
  return stay(state);
}
function openFresh(state, frame, before) {
  return {
    state: {
      ...state,
      view: { status: "opening", frame },
      via: "fresh",
      ownResumeUrl: null,
      pendingResume: null,
      resumeHopUsed: false,
      reopenOnShow: false,
      retryOnShow: false,
      reading: null
    },
    effects: [...before, { type: "open_session", gen: state.gen }]
  };
}
function loadResume(state, entry, before, resumeHopUsed) {
  const gen = state.gen + 1;
  return {
    state: {
      ...state,
      gen,
      view: { status: "loading", frame: "loading" },
      via: "resume",
      ownResumeUrl: entry.url,
      pendingResume: null,
      resumeHopUsed,
      reopenOnShow: false,
      retryOnShow: false,
      reading: null
    },
    effects: [...before, { type: "mount_iframe", url: entry.url, origin: entry.origin }, { type: "arm_ready_timeout", gen }]
  };
}
function sessionOpened(state, gen, session) {
  if (state.view.status !== "opening" || gen !== state.gen) {
    return stay(state);
  }
  const next = state.gen + 1;
  const before = state.view.frame === "stale" ? [{ type: "unmount_iframe" }] : [];
  return {
    state: { ...state, gen: next, view: { status: "loading", frame: "loading" }, via: "fresh", pendingResume: pendingResumeOf(session) },
    effects: [...before, { type: "mount_iframe", url: session.url, origin: session.origin }, { type: "arm_ready_timeout", gen: next }]
  };
}
function pendingResumeOf(session) {
  const url = session.resume_url;
  const until = session.resume_until;
  return typeof url === "string" && url !== "" && typeof until === "string" && until !== "" ? { url, origin: session.origin, until } : null;
}
function sessionRefused(state, gen, refusal) {
  if (state.view.status !== "opening" || gen !== state.gen) {
    return stay(state);
  }
  const code = codeForRefusal2(refusal);
  return {
    state: { ...state, view: failed(code, "none", refusal.retryAfter), retryOnShow: !state.visible && actionFor2(code) === "retry" },
    effects: state.view.frame === "stale" ? [{ type: "unmount_iframe" }] : []
  };
}
function readyTimeout(state, gen) {
  if (state.view.status !== "loading" || gen !== state.gen) {
    return stay(state);
  }
  return {
    state: { ...state, view: failed("ready_timeout", "loading"), pendingResume: null, retryOnShow: !state.visible },
    effects: forgetOwn(state)
  };
}
function retry(state) {
  const view = state.view;
  if (view.status !== "error") {
    return stay(state);
  }
  const next = { ...state, gen: state.gen + 1 };
  if (view.code !== "session_replaced") {
    return openFresh(next, "none", [{ type: "unmount_iframe" }]);
  }
  return next.resumable ? { state: { ...next, reading: "retry" }, effects: [{ type: "read_resume" }] } : openFresh(next, "none", []);
}
function visibility(state, visible, now) {
  const next = { ...state, visible };
  if (visible && state.view.status === "ready" && state.reopenOnShow) {
    return openFresh({ ...next, lastAutoReopenAt: now }, "stale", []);
  }
  if (visible && state.view.status === "error" && state.retryOnShow) {
    return openFresh(next, "none", [{ type: "unmount_iframe" }]);
  }
  return { state: next, effects: [] };
}
function fromFrame(state, message, now) {
  const view = state.view;
  const waiting = view.status === "loading" || view.status === "error" && view.frame === "loading";
  if (message.type === "resize" || message.type === "message_sent") {
    return stay(state);
  }
  if (message.type === "ready") {
    return waiting ? becomeReady(state, view.status === "loading") : stay(state);
  }
  if (waiting) {
    return endBeforeReady(state, message.type);
  }
  return view.status === "ready" ? endAfterReady(state, message.type, now) : stay(state);
}
function becomeReady(state, armed) {
  const pending = state.pendingResume;
  const effects = armed ? [{ type: "clear_ready_timeout" }] : [];
  return {
    state: {
      ...state,
      view: { status: "ready", frame: "live" },
      ownResumeUrl: pending === null ? state.ownResumeUrl : pending.url,
      pendingResume: null,
      retryOnShow: false
    },
    effects: pending === null ? effects : [...effects, { type: "remember_resume", entry: pending }]
  };
}
function endBeforeReady(state, type) {
  if (state.via === "resume" && type === "session_expired") {
    return openFresh(state, "none", [{ type: "clear_ready_timeout" }, ...forgetOwn(state), { type: "unmount_iframe" }]);
  }
  if (state.via === "resume" && type === "session_replaced") {
    return { state: { ...state, reading: "replaced" }, effects: [{ type: "read_resume" }] };
  }
  if (type === "session_expired") {
    return {
      state: { ...state, view: failed("session_expired", "none"), pendingResume: null, retryOnShow: !state.visible },
      effects: [{ type: "clear_ready_timeout" }, { type: "unmount_iframe" }]
    };
  }
  return {
    state: { ...state, view: failed(type, "none"), pendingResume: null, retryOnShow: false },
    effects: [{ type: "clear_ready_timeout" }, ...forgetOwn(state), { type: "unmount_iframe" }]
  };
}
function endAfterReady(state, type, now) {
  if (type === "session_expired" && !state.visible) {
    return { state: { ...state, reopenOnShow: true }, effects: forgetOwn(state) };
  }
  if (type === "session_expired" && canAutoReopen(state.lastAutoReopenAt, now)) {
    return openFresh({ ...state, lastAutoReopenAt: now }, "stale", forgetOwn(state));
  }
  const code = type === "session_expired" ? "inbox_expired" : type;
  return {
    state: { ...state, view: failed(code, "none"), reopenOnShow: false, retryOnShow: false },
    effects: [...forgetOwn(state), { type: "unmount_iframe" }]
  };
}
function forgetOwn(state) {
  return state.ownResumeUrl === null ? [] : [{ type: "forget_resume_if", url: state.ownResumeUrl }];
}
function stay(state) {
  return { state, effects: [] };
}

// src/inbox.ts
function createInbox2(options) {
  const clock = options.clock ?? defaultClock;
  const readyTimeoutMs = options.readyTimeoutMs ?? 45000;
  const keepAliveMs = options.keepAliveMs ?? 15 * 60000;
  const person = options.person === null || options.person === "" ? null : options.person;
  const key = person === null ? null : resumeKey2(options.brand, person);
  const storage = key === null ? null : options.storage === undefined ? defaultResumeStorage2() : options.storage;
  let machine = initialState({ resumable: key !== null, visible: true });
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
    kind: INBOX_FRAME,
    frame: options.frame,
    onMessage: (message) => dispatch({ type: "iframe", message })
  });
  const unregister = registerEmbed(options.brand, () => dispatch({ type: "logout" }));
  const keepAlive = options.keepAlive;
  const stopKeepAlive = keepAlive === undefined ? null : clock.every(keepAliveMs, () => dispatch({ type: "keepalive_tick" }));
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
    stopKeepAlive?.();
    slot.stop();
    unregister();
  }
  function pingAppSession(ping) {
    let pending;
    try {
      pending = Promise.resolve(ping());
    } catch (error) {
      pending = Promise.reject(error);
    }
    pending.catch((error) => {
      const status = toRefusal2(error).status;
      if (status !== null) {
        dispatch({ type: "keepalive_failed", status });
      }
    });
  }
  function run(effect) {
    if (effect.type === "open_session") {
      const gen = effect.gen;
      requestSession(options.openSession, (session) => dispatch({ type: "session_opened", gen, session }), (refusal) => dispatch({ type: "session_refused", gen, refusal }));
    } else if (effect.type === "read_resume") {
      dispatch({ type: "resume_read", entry: key === null ? null : readResume2(storage, key, clock.now()) });
    } else if (effect.type === "remember_resume") {
      if (key !== null) {
        rememberResume2(storage, key, effect.entry);
      }
    } else if (effect.type === "forget_resume_if") {
      if (key !== null) {
        forgetResumeIf2(storage, key, effect.url);
      }
    } else if (effect.type === "forget_other_resumes") {
      forgetOtherResumes2(storage, options.brand, key);
    } else if (effect.type === "forget_all_resumes") {
      forgetAllResumes2(storage, options.brand);
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
    } else if (effect.type === "keep_alive") {
      if (keepAlive !== undefined) {
        pingAppSession(keepAlive);
      }
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
    setVisible: (value) => dispatch({ type: "visible", value }),
    destroy: () => dispatch({ type: "destroy" })
  };
}

export { createInbox2 };
