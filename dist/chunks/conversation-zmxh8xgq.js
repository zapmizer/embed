import {
  toRefusal2
} from "./conversation-8vvt7dm7.js";
import {
  webOriginOf2
} from "./conversation-6md6txsp.js";

// src/messages.ts
function parseEmbedMessage(event, expected) {
  if (expected.frame === null || event.source !== expected.frame) {
    return null;
  }
  if (event.origin !== expected.origin) {
    return null;
  }
  const data = event.data;
  if (!isRecord(data) || data.source !== `${expected.brand}-embed`) {
    return null;
  }
  return toMessage(data);
}
function toMessage(data) {
  const type = data.type;
  if (type === "ready") {
    return { type: "ready" };
  }
  if (type === "resize") {
    return typeof data.height === "number" && Number.isFinite(data.height) ? { type: "resize", height: data.height } : null;
  }
  if (type === "message_sent") {
    const id = data.message_id;
    return typeof id === "string" || typeof id === "number" && Number.isFinite(id) ? { type: "message_sent", message_id: id } : null;
  }
  if (type === "session_expired" || type === "session_revoked" || type === "subscription_required" || type === "session_replaced") {
    return { type };
  }
  return null;
}
function isRecord(value) {
  return typeof value === "object" && value !== null;
}

// src/driver.ts
var CONVERSATION_SANDBOX = "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-storage-access-by-user-activation";
var CONVERSATION_FRAME = { allow: "clipboard-write", sandbox: CONVERSATION_SANDBOX, title: "Conversa no WhatsApp" };
var INBOX_FRAME = { allow: "clipboard-write; microphone; fullscreen; autoplay", sandbox: `${CONVERSATION_SANDBOX} allow-modals`, title: "Caixa de entrada do WhatsApp" };
var defaultClock = {
  now: () => Date.now(),
  after: (ms, callback) => {
    const handle = setTimeout(callback, ms);
    return () => clearTimeout(handle);
  },
  every: (ms, callback) => {
    const handle = setInterval(callback, ms);
    return () => clearInterval(handle);
  }
};
function isolated(callback) {
  try {
    callback();
  } catch (error) {
    queueMicrotask(() => {
      throw error;
    });
  }
}
function serialDispatcher(handle) {
  const queue = [];
  let running = false;
  return (event) => {
    queue.push(event);
    if (running) {
      return;
    }
    running = true;
    try {
      for (let next = queue.shift();next !== undefined; next = queue.shift()) {
        handle(next);
      }
    } finally {
      running = false;
      queue.length = 0;
    }
  };
}
function isUsableSession(session) {
  if (typeof session !== "object" || session === null || !("url" in session) || !("origin" in session)) {
    return false;
  }
  return typeof session.url === "string" && typeof session.origin === "string" && webOriginOf2(session.url) === session.origin;
}
function requestSession(openSession, onOpened, onRefused) {
  let pending;
  try {
    pending = Promise.resolve(openSession());
  } catch (error) {
    pending = Promise.reject(error);
  }
  pending.then((session) => isUsableSession(session) ? onOpened(session) : onRefused({ status: null, code: null }), (error) => onRefused(toRefusal2(error)));
}
function createFrameSlot(options) {
  let iframe = null;
  let origin = null;
  function listener(event) {
    if (iframe === null || origin === null) {
      return;
    }
    const message = parseEmbedMessage(event, { brand: options.brand, origin, frame: iframe.contentWindow });
    if (message !== null) {
      options.onMessage(message);
    }
  }
  function unmount() {
    iframe?.remove();
    iframe = null;
    origin = null;
  }
  function mount(url, nextOrigin) {
    unmount();
    const element = document.createElement("iframe");
    element.setAttribute("src", url);
    element.setAttribute("allow", options.kind.allow);
    element.setAttribute("sandbox", options.kind.sandbox);
    element.setAttribute("title", options.frame?.title ?? options.kind.title);
    options.frame?.configure?.(element);
    options.container.appendChild(element);
    iframe = element;
    origin = nextOrigin;
  }
  function stop() {
    window.removeEventListener("message", listener);
    unmount();
  }
  window.addEventListener("message", listener);
  return { mount, unmount, stop };
}

// src/registry.ts
var live = new Map;
function registerEmbed(brand, end) {
  const ends = live.get(brand) ?? new Set;
  ends.add(end);
  live.set(brand, ends);
  return () => {
    ends.delete(end);
  };
}
function endRegisteredEmbeds(brand) {
  const ends = live.get(brand);
  if (ends === undefined) {
    return;
  }
  for (const end of [...ends]) {
    isolated(end);
  }
}

export { CONVERSATION_FRAME, INBOX_FRAME, defaultClock, isolated, serialDispatcher, requestSession, createFrameSlot, registerEmbed, endRegisteredEmbeds };
