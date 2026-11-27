import {
  actionFor2
} from "./conversation-vfvm9epf.js";

// src/machine/view.ts
var AUTO_REOPEN_GAP_MS = 60000;
var LINK_REOPENS_PER_GAP = 2;
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
function recentReopens(reopenedAt, now) {
  return reopenedAt.filter((at) => now - at < AUTO_REOPEN_GAP_MS);
}

export { LINK_REOPENS_PER_GAP, failed, exposed, canAutoReopen, recentReopens };
