import { useDesktop } from "@/hooks/use-desktop"
import { errorMessage } from "@/lib/format"
import {
  readNetworkPreference,
  rememberNetwork,
  resolveNetworkAddress,
} from "@/lib/network-preference"
import * as Native from "@wails/app"
import type { Item, Snapshot } from "@wails/internal/share/models"
import type { Network } from "@wails/models"
import { Events } from "@wailsio/runtime"
import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react"

export type { Item, Snapshot }
type Operation = "select" | "start" | "stop" | "reset" | "remove"

export function useRoomDrop() {
  const desktop = useDesktop()
  const [files, setFiles] = useState<Item[]>([])
  const [session, setSession] = useState<Snapshot | null>(null)
  const [networks, setNetworks] = useState<Network[]>([])
  const [address, setAddress] = useState("")
  const [device, setDevice] = useState("This computer")
  const [minutes, setMinutes] = useState(15)
  const [once, setOnce] = useState(false)
  const [passwordProtected, setPasswordProtected] = useState(false)
  const [password, setPassword] = useState("")
  const [operation, setOperation] = useState<Operation | null>(null)
  const [error, setError] = useState("")
  const [copied, setCopied] = useState(false)
  const mounted = useRef(false)
  const action = useRef<Operation | null>(null)
  const revision = useRef(0)
  const networkRequest = useRef(0)
  const copyRequest = useRef(0)
  const sharingURL = useRef<string | null>(null)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const clearCopyFeedback = useCallback(() => {
    copyRequest.current++
    clearTimeout(copyTimer.current)
    copyTimer.current = undefined
    setCopied(false)
  }, [])
  const isCurrent = useCallback(
    (token: number) => mounted.current && token === revision.current,
    [],
  )
  const acceptSession = useCallback(
    (result: Snapshot) => {
      const nextURL = result.state === "sharing" ? result.url : null
      if (sharingURL.current !== nextURL) clearCopyFeedback()
      sharingURL.current = nextURL
      setSession(result.state === "idle" ? null : result)
    },
    [clearCopyFeedback],
  )

  const beginOperation = useCallback(
    (next: Operation) => {
      if (!desktop || !mounted.current) return null
      const pending = action.current
      if (pending) {
        // Cancellation may supersede preparation; Reset may also supersede Stop.
        // Other mutations remain exclusive, including rapid repeated removals.
        const canInterrupt =
          (next === "stop" && (pending === "select" || pending === "start")) ||
          (next === "reset" && pending !== "remove" && pending !== "reset")
        if (!canInterrupt) return null
      }
      const token = ++revision.current
      action.current = next
      setOperation(next)
      setError("")
      clearCopyFeedback()
      return token
    },
    [desktop, clearCopyFeedback],
  )
  const finishOperation = useCallback(
    (token: number) => {
      if (!isCurrent(token)) return
      action.current = null
      setOperation(null)
    },
    [isCurrent],
  )

  const updateNetworks = useCallback((result: Network[]) => {
    const preference = readNetworkPreference()
    setNetworks(result)
    setAddress((current) => resolveNetworkAddress(result, preference, current))
  }, [])
  const refreshNetworks = useCallback(async () => {
    if (!desktop || !mounted.current) return
    const request = ++networkRequest.current
    try {
      return Native.Networks()
        .then((result) => {
          if (mounted.current && request === networkRequest.current)
            updateNetworks(result)
        })
        .catch((error: unknown) => {
          if (mounted.current && request === networkRequest.current)
            setError(errorMessage(error))
        })
    } catch (error) {
      if (mounted.current && request === networkRequest.current)
        setError(errorMessage(error))
    }
  }, [desktop, updateNetworks])

  function selectNetwork(nextAddress: string) {
    if (action.current) return
    const network = networks.find((item) => item.address === nextAddress)
    if (!network) return
    rememberNetwork(network)
    setAddress(network.address)
  }

  const invalidatePending = useCallback(() => {
    mounted.current = false
    revision.current++
    networkRequest.current++
    copyRequest.current++
    action.current = null
    clearTimeout(copyTimer.current)
  }, [])

  useEffect(() => {
    if (!desktop) return
    mounted.current = true
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    async function poll() {
      const current = revision.current
      try {
        if (!action.current) {
          const result = await Native.Status()
          if (!cancelled && isCurrent(current)) acceptSession(result)
        }
      } catch (error) {
        if (!cancelled && isCurrent(current)) setError(errorMessage(error))
      } finally {
        if (!cancelled) timer = setTimeout(poll, document.hidden ? 2500 : 650)
      }
    }
    void refreshNetworks()
    void Native.DeviceName()
      .then((name) => {
        if (!cancelled) setDevice(name)
      })
      .catch(() => {})
    void poll()
    return () => {
      cancelled = true
      invalidatePending()
      clearTimeout(timer)
    }
  }, [desktop, refreshNetworks, isCurrent, acceptSession, invalidatePending])

  const start = useCallback(async () => {
    if (passwordProtected && !password) {
      setError("Enter a download password or turn off password protection.")
      return
    }
    const token = beginOperation("start")
    if (token === null) return
    try {
      const result = await Native.Start(
        minutes,
        once,
        address,
        passwordProtected ? password : "",
      )
      if (isCurrent(token)) acceptSession(result)
    } catch (error) {
      if (isCurrent(token)) setError(errorMessage(error))
    } finally {
      finishOperation(token)
    }
  }, [
    beginOperation,
    minutes,
    once,
    address,
    passwordProtected,
    password,
    isCurrent,
    acceptSession,
    finishOperation,
  ])

  const onFiles = useEffectEvent((items: Item[]) => {
    if (action.current) return
    setFiles(items)
    void start()
  })
  useEffect(() => {
    if (!desktop) return
    const offFiles = Events.On("roomdrop:files", (event) =>
      onFiles(event.data as Item[]),
    )
    const offError = Events.On("roomdrop:error", (event) => {
      if (mounted.current) setError(String(event.data))
    })
    return () => {
      offFiles()
      offError()
    }
  }, [desktop])

  async function selectFiles(folder = false) {
    if (passwordProtected && !password) {
      setError("Enter a download password or turn off password protection.")
      return
    }
    const token = beginOperation("select")
    if (token === null) return
    try {
      const selected = await Native.SelectFiles(folder)
      if (!isCurrent(token) || !selected.length) return
      setFiles(selected)
      const result = await Native.Start(
        minutes,
        once,
        address,
        passwordProtected ? password : "",
      )
      if (isCurrent(token)) acceptSession(result)
    } catch (error) {
      if (isCurrent(token)) setError(errorMessage(error))
    } finally {
      finishOperation(token)
    }
  }
  async function stop() {
    const token = beginOperation("stop")
    if (token === null) return
    try {
      const result = await Native.Stop()
      if (isCurrent(token)) acceptSession(result)
    } catch (error) {
      if (isCurrent(token)) setError(errorMessage(error))
    } finally {
      finishOperation(token)
    }
  }
  async function reset() {
    const token = beginOperation("reset")
    if (token === null) return
    try {
      await Native.Reset()
      if (isCurrent(token)) {
        sharingURL.current = null
        setSession(null)
        setFiles([])
        setPassword("")
        setPasswordProtected(false)
      }
    } catch (error) {
      if (isCurrent(token)) setError(errorMessage(error))
    } finally {
      finishOperation(token)
    }
  }
  async function remove(path: string) {
    const token = beginOperation("remove")
    if (token === null) return
    try {
      const result = await Native.RemoveFile(path)
      if (isCurrent(token)) setFiles(result)
    } catch (error) {
      if (isCurrent(token)) setError(errorMessage(error))
    } finally {
      finishOperation(token)
    }
  }
  async function copy() {
    const url = sharingURL.current
    if (!desktop || !mounted.current || action.current || !url) return
    const token = revision.current
    const request = ++copyRequest.current
    const valid = () =>
      isCurrent(token) &&
      request === copyRequest.current &&
      sharingURL.current === url
    try {
      await Native.CopyLink()
      if (!valid()) return
      clearTimeout(copyTimer.current)
      setCopied(true)
      copyTimer.current = setTimeout(() => {
        if (isCurrent(token) && sharingURL.current === url) setCopied(false)
      }, 2200)
    } catch (error) {
      if (valid()) setError(errorMessage(error))
    }
  }

  return {
    desktop,
    files,
    session,
    networks,
    address,
    setAddress: selectNetwork,
    device,
    minutes,
    setMinutes,
    once,
    setOnce,
    passwordProtected,
    setPasswordProtected: (enabled: boolean) => {
      setPasswordProtected(enabled)
      if (!enabled) setPassword("")
    },
    password,
    setPassword,
    busy: operation !== null,
    preparing: operation === "select" || operation === "start",
    error,
    setError,
    copied,
    refreshNetworks,
    start,
    selectFiles,
    stop,
    reset,
    remove,
    copy,
  }
}
export type RoomDropController = ReturnType<typeof useRoomDrop>
