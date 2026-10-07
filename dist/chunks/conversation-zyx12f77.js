import {
  actionFor2
} from "./conversation-8vvt7dm7.js";

// src/machine/view.ts
var AUTO_REOPEN_GAP_MS = 60000;
function failed(code, frame, retryAfter) {
  const action = actionFor2(code);
  return retryAfter === undefined ? { status: "error", frame, code, action } : { status: "error", frame, code, action, retryAfter };
}
function exposed(view) {
  return view.status === "idle" ? { status: "opening", frame: "none" } : view;
}
function canAutoReopen(lastAutoReopenAt, now) {
  return lastAutoReopenAt === null || now - lastAutoReopenAt >= AUTO_REOPEN_GAP_MS;
}

export { failed, exposed, canAutoReopen };
