import { defineComponent, getCurrentScope, h, onBeforeUnmount, onMounted, onScopeDispose, ref, shallowRef, toValue, watch } from 'vue'
import type { MaybeRefOrGetter, PropType, Ref, ShallowRef } from 'vue'
import { createConversation } from './conversation'
import type { Conversation } from './conversation'
import { createInboxHost } from './host'
import type { InboxHost, InboxHostOptions } from './host'
import type { EmbedState, FrameOptions, OpenSession } from './state'

export const EmbedConversation = defineComponent({
  name: 'EmbedConversation',
  inheritAttrs: false,
  props: {
    openSession: { type: Function as PropType<OpenSession>, required: true },
    brand: { type: String, required: true },
    frame: { type: Object as PropType<FrameOptions>, default: undefined },
    readyTimeoutMs: { type: Number, default: undefined },
  },
  emits: ['message-sent'],
  setup(props, { slots, emit }) {
    const container = ref<HTMLElement | null>(null)
    const state = shallowRef<EmbedState>({ status: 'opening', frame: 'none' })
    const height = ref<number | null>(null)
    let conversation: Conversation | null = null

    onMounted(() => {
      const element = container.value

      if (element === null) {
        return
      }

      conversation = createConversation({
        container: element,
        brand: props.brand,
        frame: props.frame,
        readyTimeoutMs: props.readyTimeoutMs,
        openSession: () => props.openSession(),
        onState: (next) => {
          state.value = next
        },
        onResize: (next) => {
          height.value = next
        },
        onMessageSent: (messageId) => emit('message-sent', messageId),
      })
    })

    onBeforeUnmount(() => {
      conversation?.destroy()
      conversation = null
    })

    const retry = (): void => conversation?.retry()
    const reopen = (): void => conversation?.reopen()

    return () => [h('div', { ref: container }), slots.default?.({ state: state.value, retry, reopen, height: height.value })]
  },
})

export function useInboxHost(options: UseInboxHostOptions): UseInboxHost {
  const { person, enabled, onState, ...hostOptions } = options
  const state = shallowRef<EmbedState>({ status: 'closed', frame: 'none' })
  const host = createInboxHost({
    ...hostOptions,
    onState: (next) => {
      state.value = next
      onState?.(next)
    },
  })

  if (person !== undefined || enabled !== undefined) {
    watch([() => toValue(person), () => toValue(enabled ?? true)], ([nextPerson, isEnabled]) => {
      if (!isEnabled || (person !== undefined && nextPerson !== host.person)) {
        host.close()
      }
    })
  }

  if (getCurrentScope() !== undefined) {
    onScopeDispose(() => host.destroy())
  }

  return { host, state, retry: () => host.retry() }
}

export function useInboxSlot(host: InboxHost, options: UseInboxSlotOptions): Ref<HTMLElement | null> {
  const slot = ref<HTMLElement | null>(null)
  const isEnabled = (): boolean => toValue(options.enabled ?? true)

  function attachIfEnabled(): void {
    const element = slot.value

    if (element !== null && isEnabled()) {
      host.attach(element, toValue(options.person))
    }
  }

  onMounted(attachIfEnabled)

  watch([() => toValue(options.person), isEnabled], ([person, enabled], [previousPerson, wasEnabled]) => {
    if (enabled && person === null && previousPerson !== null) {
      host.close()
    } else if (enabled) {
      attachIfEnabled()
    } else if (wasEnabled) {
      host.close()
    }
  })

  onBeforeUnmount(() => {
    const element = slot.value

    if (element !== null) {
      host.detach(element)
    }
  })

  return slot
}

export type UseInboxHostOptions = Omit<InboxHostOptions, 'onState'> & {
  onState?: (state: EmbedState) => void
  person?: MaybeRefOrGetter<string | null>
  enabled?: MaybeRefOrGetter<boolean>
}

export type UseInboxHost = { host: InboxHost; state: ShallowRef<EmbedState>; retry: () => void }

export type UseInboxSlotOptions = { person: MaybeRefOrGetter<string | null>; enabled?: MaybeRefOrGetter<boolean> }
