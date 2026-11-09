import { useRoomDrop } from "@/hooks/use-roomdrop"
import { act, renderHook } from "@testing-library/react"
import { StrictMode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { deferred, file, idle, otherFile, sharing, wifi } from "./fixtures"

const native = vi.hoisted(() => ({
  Networks: vi.fn(),
  DeviceName: vi.fn(),
  Status: vi.fn(),
  Start: vi.fn(),
  Stop: vi.fn(),
  Reset: vi.fn(),
  SelectFiles: vi.fn(),
  RemoveFile: vi.fn(),
  CopyLink: vi.fn(),
}))
const events = vi.hoisted(() => ({ On: vi.fn() }))
vi.mock("@wails/app", () => native)
vi.mock("@wailsio/runtime", () => ({
  Events: events,
  System: { IsDesktop: () => true },
}))

beforeEach(() => {
  vi.useFakeTimers()
  vi.resetAllMocks()
  localStorage.clear()
  native.Networks.mockResolvedValue([wifi])
  native.DeviceName.mockResolvedValue("Test computer")
  native.Status.mockResolvedValue(idle)
  native.Start.mockResolvedValue(sharing)
  native.Stop.mockResolvedValue({ ...sharing, state: "stopped" })
  native.Reset.mockResolvedValue(undefined)
  native.SelectFiles.mockResolvedValue([file, otherFile])
  native.RemoveFile.mockResolvedValue([])
  native.CopyLink.mockResolvedValue(undefined)
  events.On.mockImplementation(() => vi.fn())
})

async function mount() {
  const hook = renderHook(() => useRoomDrop())
  await act(async () => {})
  return hook
}

describe("native action ownership", () => {
  it("uses current sharing options for native drops without reconnecting listeners", async () => {
    const { result } = await mount()
    act(() => {
      result.current.setMinutes(30)
      result.current.setOnce(true)
    })
    expect(events.On).toHaveBeenCalledTimes(2)
    const onFiles = events.On.mock.calls.find(
      ([name]) => name === "roomdrop:files",
    )![1]
    await act(async () => {
      onFiles({ data: [file] })
    })
    expect(native.Start).toHaveBeenCalledWith(30, true, wifi.address)
    expect(result.current.files).toEqual([file])
    expect(result.current.session).toEqual(sharing)
  })
  it("keeps cancellation busy until Stop resolves and ignores the older Start", async () => {
    const start = deferred<typeof sharing>()
    const stop = deferred<typeof idle>()
    native.Start.mockReturnValue(start.promise)
    native.Stop.mockReturnValue(stop.promise)
    const { result } = await mount()
    let selecting!: Promise<void>
    await act(async () => {
      selecting = result.current.selectFiles()
    })
    let stopping!: Promise<void>
    act(() => {
      stopping = result.current.stop()
      void result.current.stop()
    })
    expect(native.Stop).toHaveBeenCalledTimes(1)
    await act(async () => {
      start.resolve(sharing)
      await selecting
    })
    expect(result.current.busy).toBe(true)
    expect(result.current.session).toBeNull()
    await act(async () => {
      stop.resolve(idle)
      await stopping
    })
    expect(result.current.busy).toBe(false)
    expect(result.current.session).toBeNull()
  })

  it("does not let an older Stop overwrite a newer Reset", async () => {
    native.Status.mockResolvedValue(sharing)
    const stop = deferred<typeof sharing>()
    native.Stop.mockReturnValue(stop.promise)
    const { result } = await mount()
    let stopping!: Promise<void>
    act(() => {
      stopping = result.current.stop()
    })
    await act(async () => {
      await result.current.reset()
    })
    await act(async () => {
      stop.resolve({ ...sharing, state: "stopped" })
      await stopping
    })
    expect(result.current.session).toBeNull()
    expect(result.current.files).toEqual([])
    expect(result.current.busy).toBe(false)
  })

  it("prevents overlapping file removals from applying responses out of order", async () => {
    native.Start.mockRejectedValue(new Error("Network unavailable"))
    const { result } = await mount()
    await act(async () => {
      await result.current.selectFiles()
    })
    const removal = deferred<typeof result.current.files>()
    native.RemoveFile.mockReturnValueOnce(removal.promise)
    let removing!: Promise<void>
    act(() => {
      removing = result.current.remove(file.path)
      void result.current.remove(otherFile.path)
    })
    expect(native.RemoveFile).toHaveBeenCalledTimes(1)
    expect(result.current.busy).toBe(true)
    await act(async () => {
      removal.resolve([otherFile])
      await removing
    })
    expect(result.current.files).toEqual([otherFile])
    await act(async () => {
      await result.current.remove(otherFile.path)
    })
    expect(result.current.files).toEqual([])
  })

  it("ignores errors from a poll that predates Reset", async () => {
    const status = deferred<typeof idle>()
    native.Status.mockReturnValueOnce(status.promise)
    const { result } = await mount()
    await act(async () => {
      await result.current.reset()
    })
    await act(async () => {
      status.reject(new Error("Outdated status error"))
    })
    expect(result.current.error).toBe("")
  })

  it("keeps only the newest network refresh response", async () => {
    const { result } = await mount()
    const old = deferred<typeof result.current.networks>()
    native.Networks.mockReturnValueOnce(old.promise).mockResolvedValueOnce([])
    let refreshing!: Promise<void>
    act(() => {
      refreshing = result.current.refreshNetworks()
    })
    await act(async () => {
      await result.current.refreshNetworks()
    })
    await act(async () => {
      old.resolve([wifi])
      await refreshing
    })
    expect(result.current.networks).toEqual([])
    expect(result.current.address).toBe("")
  })
})

describe("copy feedback", () => {
  it("ignores an older failed copy after a newer copy succeeds", async () => {
    native.Status.mockResolvedValue(sharing)
    const copy = deferred<void>()
    native.CopyLink.mockReturnValueOnce(copy.promise)
    const { result } = await mount()
    let copying!: Promise<void>
    act(() => {
      copying = result.current.copy()
    })
    await act(async () => {
      await result.current.copy()
    })
    await act(async () => {
      copy.reject(new Error("Old clipboard error"))
      await copying
    })
    expect(result.current.copied).toBe(true)
    expect(result.current.error).toBe("")
  })
  it("still expires earlier successful feedback if the next copy fails", async () => {
    native.Status.mockResolvedValue(sharing)
    const { result } = await mount()
    await act(async () => {
      await result.current.copy()
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600)
    })
    native.CopyLink.mockRejectedValueOnce(new Error("Clipboard unavailable"))
    await act(async () => {
      await result.current.copy()
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600)
    })
    expect(result.current.copied).toBe(false)
    expect(result.current.error).toBe("Clipboard unavailable")
  })
  it("restarts its full duration after every successful copy", async () => {
    native.Status.mockResolvedValue(sharing)
    const { result } = await mount()
    await act(async () => {
      await result.current.copy()
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600)
    })
    await act(async () => {
      await result.current.copy()
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(result.current.copied).toBe(true)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200)
    })
    expect(result.current.copied).toBe(false)
  })

  it("does not restore copied feedback after Reset invalidates an in-flight copy", async () => {
    native.Status.mockResolvedValue(sharing)
    const copy = deferred<void>()
    native.CopyLink.mockReturnValue(copy.promise)
    const { result } = await mount()
    let copying!: Promise<void>
    act(() => {
      copying = result.current.copy()
    })
    await act(async () => {
      await result.current.reset()
    })
    await act(async () => {
      copy.resolve()
      await copying
    })
    expect(result.current.copied).toBe(false)
  })
})

it("cleans up StrictMode subscriptions, pending responses and polling on unmount", async () => {
  const oldStatus = deferred<typeof sharing>()
  native.Status.mockReturnValueOnce(oldStatus.promise).mockResolvedValue(idle)
  const unsubscribe = vi.fn()
  events.On.mockReturnValue(unsubscribe)
  const { result, unmount } = renderHook(() => useRoomDrop(), {
    wrapper: StrictMode,
  })
  await act(async () => {
    oldStatus.resolve(sharing)
  })
  expect(result.current.session).toBeNull()
  expect(unsubscribe).toHaveBeenCalledTimes(2)
  unmount()
  expect(unsubscribe).toHaveBeenCalledTimes(4)
  expect(vi.getTimerCount()).toBe(0)
})
