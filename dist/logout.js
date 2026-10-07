import {
  defaultResumeStorage2,
  forgetAllResumes2
} from "./chunks/conversation-6md6txsp.js";
import {
  endRegisteredEmbeds
} from "./chunks/conversation-j87npja7.js";

// src/logout.ts
function endEmbeds(options) {
  endLocally(options.brand, options.storage);
  if (options.broadcast === false) {
    return;
  }
  const channel = openChannel(options.brand);
  try {
    channel?.postMessage("logout");
  } catch {
    return;
  } finally {
    channel?.close();
  }
}
function listenToLogout(options) {
  const channel = openChannel(options.brand);
  if (channel === null) {
    return () => {};
  }
  channel.onmessage = () => endLocally(options.brand, options.storage);
  return () => channel.close();
}
function endLocally(brand, storage) {
  endRegisteredEmbeds(brand);
  forgetAllResumes2(storage === undefined ? defaultResumeStorage2() : storage, brand);
}
function openChannel(brand) {
  try {
    return typeof BroadcastChannel === "function" ? new BroadcastChannel(`${brand}-embed-logout`) : null;
  } catch {
    return null;
  }
}
export {
  endEmbeds,
  listenToLogout
};
