import { App } from "@/app"
import type { RoomDropController } from "@/hooks/use-roomdrop"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, expect, it, vi } from "vitest"
import { file, sharing, wifi } from "./fixtures"

const mock = vi.hoisted(() => ({
  controller: null as RoomDropController | null,
}))
vi.mock("@/hooks/use-roomdrop", () => ({ useRoomDrop: () => mock.controller }))

beforeEach(() => {
  mock.controller = {
    desktop: true,
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

it("opens Settings with the keyboard, traps focus, expands licenses and restores focus on Escape", async () => {
  const user = userEvent.setup()
  render(<App />)
  const trigger = screen.getByRole("button", { name: "Settings" })
  trigger.focus()
  await user.keyboard("{Enter}")
  const dialog = await screen.findByRole("dialog", { name: "Settings" })
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
