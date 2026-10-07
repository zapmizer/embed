import {
  createInbox2
} from "./conversation-fwv8fg91.js";
import {
  defaultClock,
  isolated
} from "./conversation-zmxh8xgq.js";

// src/host.ts
function createInboxHost2(options) {
  const clock = options.clock ?? defaultClock;
  const idleMs = options.idleMs ?? 30 * 60000;
  const element = document.createElement("div");
  const frameContainer = document.createElement("div");
  const overlay = document.createElement("div");
  let inbox = null;
  let person = null;
  let slot = null;
  let observer = null;
  let cancelIdle = null;
  let generation = 0;
  let destroyed = false;
  let state = { status: "closed", frame: "none" };
  element.append(frameContainer, overlay);
  element.style.position = "fixed";
  hide();
  document.body.appendChild(element);
  window.addEventListener("resize", measure);
  window.addEventListener("scroll", measure, true);
  function publish(next) {
    state = next;
    isolated(() => options.onState(next));
  }
  function hide() {
    element.style.visibility = "hidden";
    element.style.pointerEvents = "none";
    element.inert = true;
    element.setAttribute("aria-hidden", "true");
  }
  function show() {
    element.style.visibility = "";
    element.style.pointerEvents = "";
    element.inert = false;
    element.removeAttribute("aria-hidden");
  }
  function measure() {
    if (slot === null) {
      return;
    }
    const rect = slot.getBoundingClientRect();
    element.style.top = `${rect.top}px`;
    element.style.left = `${rect.left}px`;
    element.style.width = `${rect.width}px`;
    element.style.height = `${rect.height}px`;
  }
  function follow(nextSlot) {
    if (slot !== nextSlot) {
      releaseSlot();
      slot = nextSlot;
      if (typeof ResizeObserver === "function") {
        observer = new ResizeObserver(measure);
        observer.observe(nextSlot);
      }
    }
    measure();
  }
  function releaseSlot() {
    observer?.disconnect();
    observer = null;
    slot = null;
  }
  function cancelIdleTimer() {
    cancelIdle?.();
    cancelIdle = null;
  }
  function teardown() {
    generation += 1;
    inbox = null;
    person = null;
    cancelIdleTimer();
    releaseSlot();
    hide();
  }
  function open(nextPerson) {
    generation += 1;
    const mine = generation;
    person = nextPerson;
    const created = createInbox2({
      container: frameContainer,
      brand: options.brand,
      openSession: options.openSession,
      person: nextPerson,
      keepAlive: options.keepAlive,
      storage: options.storage,
      frame: options.frame,
      readyTimeoutMs: options.readyTimeoutMs,
      keepAliveMs: options.keepAliveMs,
      clock,
      onState: (next) => {
        if (mine !== generation) {
          return;
        }
        publish(next);
        if (next.status === "closed") {
          teardown();
        }
      }
    });
    if (mine !== generation) {
      created.destroy();
      return null;
    }
    inbox = created;
    return created;
  }
  function attach(nextSlot, nextPerson) {
    if (destroyed) {
      return;
    }
    cancelIdleTimer();
    if (inbox !== null && inbox.state.status === "closed") {
      generation += 1;
      inbox = null;
    }
    if (inbox !== null && nextPerson !== person) {
      const previous = inbox;
      generation += 1;
      inbox = null;
      previous.destroy();
    }
    const current = inbox ?? open(nextPerson);
    if (current === null) {
      return;
    }
    follow(nextSlot);
    show();
    current.setVisible(true);
  }
  function detach(oldSlot) {
    if (destroyed || oldSlot !== slot) {
      return;
    }
    releaseSlot();
    hide();
    inbox?.setVisible(false);
    cancelIdleTimer();
    cancelIdle = clock.after(idleMs, close);
  }
  function close() {
    if (destroyed) {
      return;
    }
    const current = inbox;
    teardown();
    current?.destroy();
    if (state.status !== "closed") {
      publish({ status: "closed", frame: "none" });
    }
  }
  function destroy() {
    close();
    destroyed = true;
    window.removeEventListener("resize", measure);
    window.removeEventListener("scroll", measure, true);
    element.remove();
  }
  return {
    element,
    overlay,
    get state() {
      return state;
    },
    get person() {
      return person;
    },
    attach,
    detach,
    retry: () => {
      if (!destroyed) {
        inbox?.retry();
      }
    },
    close,
    destroy
  };
}

export { createInboxHost2 };
