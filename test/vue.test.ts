import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { Teleport, createApp, defineComponent, h, nextTick, ref } from 'vue'
import type { App } from 'vue'
import type { InboxHost } from '../src/host'
import type { EmbedState } from '../src/state'
import { EmbedConversation, useInboxHost, useInboxSlot } from '../src/vue'
import { BRAND, framesIn, onlyFrame, postFrom } from './support/frames'
import { fakeResizeObserver } from './support/layout'
import type { FakeResizeObservers } from './support/layout'
import { scriptedSessions, session, settle } from './support/sessions'
import type { ScriptedSessions } from './support/sessions'

let root: HTMLDivElement
let app: App | null
let sessions: ScriptedSessions

function mount(component: ReturnType<typeof defineComponent>): void {
  app = createApp(component)
  app.mount(root)
}

describe('EmbedConversation', () => {
  beforeEach(() => {
    root = document.body.appendChild(document.createElement('div'))
    app = null
    sessions = scriptedSessions()
  })

  afterEach(() => {
    app?.unmount()
    document.body.innerHTML = ''
  })

  it('renders a bare div for the iframe and hands state, retry, reopen and height to the slot', async () => {
    const seen: Array<{ state: EmbedState; height: number | null }> = []
    const sent: unknown[] = []

    mount(
      defineComponent({
        setup: () => () =>
          h(
            EmbedConversation,
            { openSession: sessions.openSession, brand: BRAND, onMessageSent: (id: unknown) => sent.push(id) },
            {
              default: (props: { state: EmbedState; height: number | null }) => {
                seen.push(props)

                return h('p', props.state.status)
              },
            },
          ),
      }),
    )
    await nextTick()
    sessions.resolve(0, session('a'))
    await settle()
    const iframe = onlyFrame(root)

    postFrom(iframe, { type: 'ready' })
    postFrom(iframe, { type: 'resize', height: 640 })
    postFrom(iframe, { type: 'message_sent', message_id: 'wamid.9' })
    await nextTick()

    const wrapper = root.querySelector('div')

    expect(wrapper?.getAttribute('class')).toBeNull()
    expect(wrapper?.getAttribute('style')).toBeNull()
    expect(iframe?.parentElement).toBe(wrapper)
    expect(root.querySelector('p')?.textContent).toBe('ready')
    expect(seen.at(-1)?.height).toBe(640)
    expect(sent).toEqual(['wamid.9'])
  })

  it('calls the latest openSession on reopen', async () => {
    const theme = ref('light')
    const asked: string[] = []
    let reopen: () => void = () => {}

    mount(
      defineComponent({
        setup: () => () =>
          h(
            EmbedConversation,
            {
              brand: BRAND,
              openSession: () => {
                asked.push(theme.value)

                return Promise.resolve(session('a'))
              },
            },
            {
              default: (props: { reopen: () => void }) => {
                reopen = props.reopen

                return null
              },
            },
          ),
      }),
    )
    await settle()
    theme.value = 'dark'
    await nextTick()
    reopen()

    expect(asked).toEqual(['light', 'dark'])
  })

  it('destroys the conversation on unmount', async () => {
    mount(defineComponent({ setup: () => () => h(EmbedConversation, { openSession: sessions.openSession, brand: BRAND }) }))
    await nextTick()
    sessions.resolve(0, session('a'))
    await settle()

    app?.unmount()
    app = null

    expect(framesIn(root)).toEqual([])
  })
})

describe('useInboxHost + useInboxSlot', () => {
  let resizeObservers: FakeResizeObservers
  let host: InboxHost | null

  beforeEach(() => {
    window.sessionStorage.clear()
    root = document.body.appendChild(document.createElement('div'))
    app = null
    host = null
    sessions = scriptedSessions()
    resizeObservers = fakeResizeObserver()
  })

  afterEach(() => {
    app?.unmount()
    resizeObservers.restore()
    document.body.innerHTML = ''
  })

  function mountApp(onAtendimento: { value: boolean }, person: { value: string | null }, enabled: { value: boolean }, hostWatches: boolean = false) {
    const Screen = defineComponent({
      props: { inboxHost: { type: Object as () => InboxHost, required: true } },
      setup(props) {
        const slot = useInboxSlot(props.inboxHost, { person: () => person.value, enabled: () => enabled.value })

        return () => h('section', { ref: slot })
      },
    })

    mount(
      defineComponent({
        setup() {
          const inbox = hostWatches
            ? useInboxHost({ brand: BRAND, openSession: sessions.openSession, person: () => person.value, enabled: () => enabled.value })
            : useInboxHost({ brand: BRAND, openSession: sessions.openSession })

          host = inbox.host

          return () => h('main', [onAtendimento.value ? h(Screen, { inboxHost: inbox.host }) : h('p', 'Outra tela'), h('output', inbox.state.value.status)])
        },
      }),
    )
  }

  function mountSwappableSlot(shown: { value: boolean }, slotKey: { value: string }, person: { value: string | null }) {
    const attached: HTMLElement[] = []
    const detached: HTMLElement[] = []
    const slots = new Map<string, HTMLElement>()

    const Screen = defineComponent({
      props: { inboxHost: { type: Object as () => InboxHost, required: true } },
      setup(props) {
        const spied: InboxHost = {
          ...props.inboxHost,
          attach: (element, nextPerson) => {
            attached.push(element)
            props.inboxHost.attach(element, nextPerson)
          },
          detach: (element) => {
            detached.push(element)
            props.inboxHost.detach(element)
          },
        }
        const slot = useInboxSlot(spied, { person: () => person.value })

        return () =>
          shown.value
            ? h('div', {
                key: slotKey.value,
                ref: (element) => {
                  if (element instanceof HTMLElement) {
                    slots.set(slotKey.value, element)
                    slot.value = element
                  } else {
                    slot.value = null
                  }
                },
              })
            : h('p', 'Invite')
      },
    })

    mount(
      defineComponent({
        setup() {
          const inbox = useInboxHost({ brand: BRAND, openSession: sessions.openSession })

          host = inbox.host

          return () => h(Screen, { inboxHost: inbox.host })
        },
      }),
    )

    return { attached, detached, slots }
  }

  it('attaches when the slot element appears after the component mounted', async () => {
    const shown = ref(false)

    mountSwappableSlot(shown, ref('a'), ref('7:3'))
    await nextTick()

    expect(sessions.calls()).toBe(0)

    shown.value = true
    await nextTick()
    sessions.resolve(0, session('a', true))
    await settle()

    expect(sessions.calls()).toBe(1)
    expect(host?.element.style.visibility).toBe('')
    expect(onlyFrame(host?.element ?? root)).toBeDefined()
  })

  it('detaches the previous slot element and attaches the new one without a new session', async () => {
    const slotKey = ref('a')

    const { attached, detached, slots } = mountSwappableSlot(ref(true), slotKey, ref('7:3'))
    await nextTick()
    sessions.resolve(0, session('a', true))
    await settle()
    const first = slots.get('a')

    slotKey.value = 'b'
    await nextTick()

    expect(first).toBeDefined()
    expect(detached).toContain(first as HTMLElement)
    expect(attached.at(-1)).toBe(slots.get('b') as HTMLElement)
    expect(attached.at(-1)).not.toBe(first)
    expect(sessions.calls()).toBe(1)
    expect(host?.element.style.visibility).toBe('')
  })

  it('creates the host once at the root and opens nothing before the visit', async () => {
    mountApp(ref(false), ref('7:3'), ref(true))
    await nextTick()

    expect(host?.element.parentElement).toBe(document.body)
    expect(sessions.calls()).toBe(0)
    expect(root.querySelector('output')?.textContent).toBe('closed')
  })

  it('attaches on mount and detaches on unmount, keeping the iframe', async () => {
    const onAtendimento = ref(true)

    mountApp(onAtendimento, ref('7:3'), ref(true))
    await nextTick()
    sessions.resolve(0, session('a', true))
    await settle()
    const iframe = onlyFrame(host?.element ?? root)

    onAtendimento.value = false
    await nextTick()

    expect(sessions.calls()).toBe(1)
    expect(host?.element.style.visibility).toBe('hidden')
    expect(onlyFrame(host?.element ?? root)).toBe(iframe)
    expect(root.querySelector('output')?.textContent).toBe('loading')
  })

  it('opens the inbox of the new person without leaving the screen (S17)', async () => {
    const person = ref<string | null>('7:3')

    mountApp(ref(true), person, ref(true))
    await nextTick()

    person.value = '7:4'
    await nextTick()

    expect(sessions.calls()).toBe(2)
    expect(host?.element.style.visibility).toBe('')
  })

  it('closes when access is lost and brings the inbox back when it returns (S26)', async () => {
    const enabled = ref(true)

    mountApp(ref(true), ref('7:3'), enabled)
    await nextTick()
    enabled.value = false
    await nextTick()

    expect(host?.element.style.pointerEvents).toBe('none')
    expect(host?.state.status).toBe('closed')

    enabled.value = true
    await nextTick()

    expect(sessions.calls()).toBe(2)
    expect(host?.element.style.visibility).toBe('')
  })

  it.each([
    ['the team changes', (person: { value: string | null }) => (person.value = '4:3'), null],
    ['another user signs in', (person: { value: string | null }) => (person.value = '7:8'), null],
    ['the user signs out', (person: { value: string | null }) => (person.value = null), null],
    ['access stops being available', null, (enabled: { value: boolean }) => (enabled.value = false)],
  ])('closes the hidden host when %s while the user is on another screen', async (_, changePerson, changeEnabled) => {
    const onAtendimento = ref(true)
    const person = ref<string | null>('7:3')
    const enabled = ref(true)

    mountApp(onAtendimento, person, enabled, true)
    await nextTick()
    sessions.resolve(0, session('a', true))
    await settle()
    postFrom(onlyFrame(host?.element ?? root), { type: 'ready' })
    onAtendimento.value = false
    await nextTick()

    changePerson?.(person)
    changeEnabled?.(enabled)
    await nextTick()

    expect(host?.state).toEqual({ status: 'closed', frame: 'none' })
    expect(framesIn(host?.element ?? root)).toEqual([])
    expect(window.sessionStorage.getItem('parli-inbox:7:3')).not.toBeNull()
    expect(sessions.calls()).toBe(1)
  })

  it.each([
    ['the slot alone handles it', false],
    ['the host also watches the person', true],
  ])('closes without opening a second session when the mounted slot person becomes null and %s', async (_, hostWatches) => {
    const person = ref<string | null>('u1')

    mountApp(ref(true), person, ref(true), hostWatches)
    await nextTick()
    sessions.resolve(0, session('a', true))
    await settle()
    postFrom(onlyFrame(host?.element ?? root), { type: 'ready' })

    person.value = null
    await nextTick()
    await settle()

    expect(host?.state).toEqual({ status: 'closed', frame: 'none' })
    expect(sessions.calls()).toBe(1)
    expect(framesIn(host?.element ?? root)).toEqual([])
    expect(window.sessionStorage.getItem('parli-inbox:u1')).not.toBeNull()
  })

  it('keeps the inbox the slot opened for the new person when the host also watches the person', async () => {
    const person = ref<string | null>('7:3')

    mountApp(ref(true), person, ref(true), true)
    await nextTick()

    person.value = '7:4'
    await nextTick()

    expect(sessions.calls()).toBe(2)
    expect(host?.state.status).toBe('opening')
    expect(host?.element.style.visibility).toBe('')
  })

  it('does not attach on mount while disabled', async () => {
    mountApp(ref(true), ref('7:3'), ref(false))
    await nextTick()

    expect(sessions.calls()).toBe(0)
  })

  it('destroys the host with the root app', async () => {
    mountApp(ref(true), ref('7:3'), ref(true))
    await nextTick()

    app?.unmount()
    app = null

    expect(host?.element.isConnected).toBe(false)
  })

  it('lets the app draw loading and errors inside the host overlay with Teleport', async () => {
    mount(
      defineComponent({
        setup() {
          const inbox = useInboxHost({ brand: BRAND, openSession: sessions.openSession })

          host = inbox.host

          return () => h(Teleport, { to: inbox.host.overlay }, h('p', { role: 'status' }, inbox.state.value.status))
        },
      }),
    )
    await nextTick()

    expect(host?.overlay.textContent).toBe('closed')
  })
})
