import { App } from "@/app"
import type { RoomDropController } from "@/hooks/use-roomdrop"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, expect, it, vi } from "vitest"
import { version } from "../package.json"
import { deferred, file, receiving, sharing, wifi } from "./fixtures"

const native = vi.hoisted(() => ({ CheckForUpdates: vi.fn() }))
vi.mock("@wails/app", () => native)

const mock = vi.hoisted(() => ({
  controller: null as RoomDropController | null,
}))
vi.mock("@/hooks/use-roomdrop", () => ({ useRoomDrop: () => mock.controller }))

beforeEach(() => {
  native.CheckForUpdates.mockReset().mockResolvedValue(undefined)
  mock.controller = {
    desktop: true,
    mode: "send",
    setMode: vi.fn(),
    destination: "",
    chooseReceiveFolder: vi.fn(),
    startReceive: vi.fn(),
    files: [],
    session: null,
    networks: [wifi],
    address: wifi.address,
    setAddress: vi.fn(),
    device: "Test computer",
    minutes: 15,
    setMinutes: vi.fn(),
    once: false,
    setOnce: vi.fn(),
    passwordProtected: false,
    setPasswordProtected: vi.fn(),
    password: "",
    setPassword: vi.fn(),
    busy: false,
    preparing: false,
    error: "",
    setError: vi.fn(),
    copied: false,
    refreshNetworks: vi.fn(),
    start: vi.fn(),
    selectFiles: vi.fn(),
    stop: vi.fn(),
    reset: vi.fn(),
    remove: vi.fn(),
    copy: vi.fn(),
  }
})

it("switches modes with the keyboard and requires a destination before receiving", async () => {
  const user = userEvent.setup()
  const view = render(<App />)
  screen.getByRole("tab", { name: "Send" }).focus()
  await user.keyboard("{ArrowRight}")
  expect(document.activeElement).toBe(
    screen.getByRole("tab", { name: "Receive" }),
  )
  await user.keyboard("{Enter}")
  expect(mock.controller!.setMode).toHaveBeenCalledWith("receive")
  mock.controller!.mode = "receive"
  view.rerender(<App />)
  const start = screen.getByRole("button", { name: "Start receiving" })
  expect((start as HTMLButtonElement).disabled).toBe(true)
  await user.click(screen.getByRole("button", { name: "Choose folder" }))
  expect(mock.controller!.chooseReceiveFolder).toHaveBeenCalledTimes(1)
  mock.controller!.destination = receiving.destination
  view.rerender(<App />)
  expect(
    (screen.getByLabelText("Save received files to") as HTMLInputElement).value,
  ).toBe(receiving.destination)
  await user.click(start)
  expect(mock.controller!.startReceive).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole("switch", { name: "One-time download" })).toBeNull()
})

it("shows the receive link, destination, progress, and saved-file confirmation", async () => {
  const user = userEvent.setup()
  mock.controller!.mode = "receive"
  mock.controller!.session = {
    ...receiving,
    uploads: 1,
    items: [file],
    size: file.size,
    transfers: [
      {
        id: 1,
        name: file.name,
        device: "iPhone",
        address: "192.168.1.50",
        bytes: file.size,
        total: file.size,
        state: "complete",
      },
    ],
  }
  const view = render(<App />)
  expect(screen.getByText("Upload link")).toBeTruthy()
  expect(screen.getByText(receiving.destination)).toBeTruthy()
  expect(screen.getByText("Received")).toBeTruthy()
  expect(screen.getByText("128 B saved from iPhone")).toBeTruthy()
  expect(screen.queryByText(/ZIP/)).toBeNull()
  const navigation = screen.getByRole("navigation", { name: "Transfer modes" })
  expect(
    within(navigation)
      .getByRole("tab", { name: "Receive" })
      .getAttribute("aria-selected"),
  ).toBe("true")
  const send = within(navigation).getByRole("tab", { name: "Send" })
  expect(send.getAttribute("aria-disabled")).toBe("true")
  await user.click(send)
  expect(mock.controller!.setMode).not.toHaveBeenCalled()
  await user.click(screen.getByRole("button", { name: "Stop receiving" }))
  expect(mock.controller!.stop).toHaveBeenCalledTimes(1)
  mock.controller!.session = { ...mock.controller!.session, state: "stopped" }
  view.rerender(<App />)
  expect(screen.getByText("Receiving stopped")).toBeTruthy()
  expect(send.getAttribute("aria-disabled")).not.toBe("true")
  await user.click(send)
  expect(mock.controller!.setMode).toHaveBeenCalledWith("send")
  await user.click(screen.getByRole("button", { name: "Receive more files" }))
  expect(mock.controller!.reset).toHaveBeenCalledTimes(1)
})

it("opens the native updater, prevents repeated checks and allows retry after failure", async () => {
  const user = userEvent.setup()
  const pending = deferred<void>()
  native.CheckForUpdates.mockReturnValueOnce(pending.promise)
  render(<App />)
  await user.click(screen.getByRole("button", { name: "Settings" }))
  await user.click(screen.getByRole("button", { name: "Check for updates" }))
  const checking = screen.getByRole("button", { name: "Checking for updates…" })
  expect(checking.hasAttribute("disabled")).toBe(true)
  await user.click(checking)
  expect(native.CheckForUpdates).toHaveBeenCalledTimes(1)
  pending.reject(new Error("Could not reach GitHub. Try again."))
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "Could not reach GitHub. Try again.",
  )
  await user.click(screen.getByRole("button", { name: "Check for updates" }))
  await waitFor(() => expect(native.CheckForUpdates).toHaveBeenCalledTimes(2))
  expect(screen.queryByRole("alert")).toBeNull()
})

it("disables update checks in the browser preview", async () => {
  const user = userEvent.setup()
  mock.controller!.desktop = false
  render(<App />)
  await user.click(screen.getByRole("button", { name: "Settings" }))
  const button = screen.getByRole("button", { name: "Check for updates" })
  expect(button.hasAttribute("disabled")).toBe(true)
  await user.click(button)
  expect(native.CheckForUpdates).not.toHaveBeenCalled()
})

it("opens Settings with the keyboard, traps focus, expands licenses and restores focus on Escape", async () => {
  const user = userEvent.setup()
  render(<App />)
  const trigger = screen.getByRole("button", { name: "Settings" })
  trigger.focus()
  await user.keyboard("{Enter}")
  const dialog = await screen.findByRole("dialog", { name: "Settings" })
  expect(within(dialog).getByText(`RoomDrop ${version}`)).toBeTruthy()
  await waitFor(() =>
    expect(dialog.contains(document.activeElement)).toBe(true),
  )
  await user.click(within(dialog).getByText("Open-source licenses"))
  expect(
    within(dialog).getByText("Open-source licenses").closest("details")?.open,
  ).toBe(true)
  expect(
    within(dialog).getByLabelText("Third-party license notices").textContent,
  ).toContain("MIT License")
  for (let i = 0; i < 9; i++) {
    await user.tab()
    await waitFor(() =>
      expect(
        dialog.contains(document.activeElement),
        `Tab ${i}: ${document.activeElement?.outerHTML.slice(0, 180)}`,
      ).toBe(true),
    )
  }
  await user.keyboard("{Escape}")
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  await waitFor(() => expect(document.activeElement).toBe(trigger))
})

it("uses the shadcn switch with keyboard and label interaction", async () => {
  const user = userEvent.setup()
  render(<App />)
  const toggle = screen.getByRole("switch", {
    name: "Expire after one completed download",
  })
  toggle.focus()
  await user.keyboard(" ")
  expect(mock.controller!.setOnce).toHaveBeenCalledWith(true)
  vi.mocked(mock.controller!.setOnce).mockClear()
  await user.click(screen.getByText("One-time download"))
  expect(mock.controller!.setOnce).toHaveBeenCalled()
})

it("disables draft mutations while an operation is in flight", async () => {
  const user = userEvent.setup()
  mock.controller!.files = [file]
  mock.controller!.busy = true
  render(<App />)
  await user.click(screen.getByRole("button", { name: `Remove ${file.name}` }))
  await user.click(screen.getByRole("button", { name: "Create sharing link" }))
  expect(mock.controller!.remove).not.toHaveBeenCalled()
  expect(mock.controller!.start).not.toHaveBeenCalled()
  expect(
    screen.queryByRole("button", { name: "Cancel preparation" }),
  ).toBeNull()
})

it("provides an accessible password setting and masks the download password", async () => {
  const user = userEvent.setup()
  const view = render(<App />)
  const toggle = screen.getByRole("switch", { name: "Password protection" })
  expect(screen.queryByLabelText("Download password")).toBeNull()
  toggle.focus()
  await user.keyboard(" ")
  expect(mock.controller!.setPasswordProtected).toHaveBeenCalledWith(true)
  mock.controller!.passwordProtected = true
  view.rerender(<App />)
  const input = screen.getByLabelText("Download password")
  expect(input.getAttribute("type")).toBe("password")
  await user.type(input, "s")
  expect(mock.controller!.setPassword).toHaveBeenCalledWith("s")
  mock.controller!.busy = true
  view.rerender(<App />)
  expect((input as HTMLInputElement).disabled).toBe(true)
  mock.controller!.session = { ...sharing, passwordProtected: true }
  view.rerender(<App />)
  expect(
    screen.getByText("Password protected. Share the password separately."),
  ).toBeTruthy()
})

it("connects setup, active sharing, and completion controls to their actions", async () => {
  const user = userEvent.setup()
  const view = render(<App />)
  await user.click(screen.getByRole("button", { name: "Choose files" }))
  expect(mock.controller!.selectFiles).toHaveBeenCalledWith()
  mock.controller!.session = sharing
  view.rerender(<App />)
  expect(
    screen
      .getByRole("textbox", { name: "Your local sharing URL" })
      .getAttribute("value"),
  ).toBe(sharing.url)
  await user.click(screen.getByRole("button", { name: "Copy sharing link" }))
  await user.click(screen.getByRole("button", { name: "Stop sharing" }))
  expect(mock.controller!.copy).toHaveBeenCalledOnce()
  expect(mock.controller!.stop).toHaveBeenCalledOnce()
  mock.controller!.session = { ...sharing, state: "downloaded", downloads: 1 }
  view.rerender(<App />)
  expect(
    screen.getByRole("heading", { name: "Transfer complete" }),
  ).toBeTruthy()
  await user.click(screen.getByRole("button", { name: "Share more files" }))
  expect(mock.controller!.reset).toHaveBeenCalledOnce()
})
