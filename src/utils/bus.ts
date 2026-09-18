// 内容脚本内部的小型事件总线：注入的图标按钮与 React 悬浮窗之间通信
type Handler = (payload?: unknown) => void

const listeners = new Map<string, Set<Handler>>()

export const bus = {
  on(event: string, handler: Handler) {
    if (!listeners.has(event)) {
      listeners.set(event, new Set())
    }
    listeners.get(event)!.add(handler)
    return () => {
      listeners.get(event)?.delete(handler)
    }
  },
  emit(event: string, payload?: unknown) {
    listeners.get(event)?.forEach((handler) => handler(payload))
  }
}
