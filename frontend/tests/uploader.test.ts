import { fireEvent, screen, waitFor } from "@testing-library/dom"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import html from "../../internal/share/uploader.html?raw"
import script from "../../internal/share/uploader.js?raw"

class UploadRequest {
  static requests: UploadRequest[] = []
  upload: {
    onprogress?: (event: {
      lengthComputable: boolean
      loaded: number
      total: number
    }) => void
  } = {}
  status = 0
  responseText = ""
  onload?: () => void
  onerror?: () => void
  onabort?: () => void
  open = vi.fn()
  setRequestHeader = vi.fn()
  send = vi.fn(() => UploadRequest.requests.push(this))
  abort() {
    this.onabort?.()
  }
  respond(status: number, body: string) {
    this.status = status
    this.responseText = body
    this.onload?.()
  }
}

beforeEach(() => {
  UploadRequest.requests = []
  document.body.innerHTML = html.replaceAll("{{.Path}}", "/s/receive-session")
  // Run the exact embedded browser script, using controllable network responses.
  new Function("XMLHttpRequest", "window", script)(UploadRequest, {
    addEventListener: vi.fn(),
  })
})

afterEach(() => document.body.replaceChildren())

it("waits for a saved-file receipt, displays collision names safely, and retries only unfinished files", async () => {
  const user = userEvent.setup()
  const files = [
    new File(["one"], "Grüße 🌿.txt"),
    new File(["two"], "second.txt"),
  ]
  await user.upload(screen.getByLabelText("Photos and files"), files)
  await user.click(screen.getByRole("button", { name: "Send files" }))
  const first = UploadRequest.requests[0]
  expect(first.open).toHaveBeenCalledWith("POST", "/s/receive-session/upload")
  expect(first.setRequestHeader).toHaveBeenCalledWith(
    "X-RoomDrop-Filename",
    encodeURIComponent(files[0].name),
  )
  expect(first.setRequestHeader).toHaveBeenCalledWith(
    "Content-Type",
    "application/octet-stream",
  )
  first.upload.onprogress?.({ lengthComputable: true, loaded: 3, total: 3 })
  expect(screen.getByText("Saving on the computer…")).toBeTruthy()
  expect(screen.queryByText("Received on the computer")).toBeNull()
  const renamed = "Grüße 🌿 (2).txt"
  first.respond(201, JSON.stringify({ name: renamed, size: 3 }))
  await waitFor(() => expect(UploadRequest.requests).toHaveLength(2))
  expect(screen.getByText(`Received as ${renamed}`)).toBeTruthy()
  UploadRequest.requests[1].onerror?.()
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toContain("Connection lost"),
  )
  await user.click(screen.getByRole("button", { name: "Send files" }))
  expect(UploadRequest.requests).toHaveLength(3)
  expect(UploadRequest.requests[2].send).toHaveBeenCalledWith(files[1])
  UploadRequest.requests[2].respond(
    201,
    JSON.stringify({ name: "second.txt", size: 3 }),
  )
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toContain(
      "2 files received",
    ),
  )
  expect(
    (screen.getByRole("button", { name: "Send files" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true)
})

it("cancels the batch and lets the sender retry the current file", async () => {
  const user = userEvent.setup()
  const files = [new File(["one"], "one.txt"), new File(["two"], "two.txt")]
  await user.upload(screen.getByLabelText("Photos and files"), files)
  await user.click(screen.getByRole("button", { name: "Send files" }))
  expect(
    (screen.getByLabelText("Photos and files") as HTMLInputElement).disabled,
  ).toBe(true)
  fireEvent.submit(document.getElementById("upload-form")!)
  expect(UploadRequest.requests).toHaveLength(1)
  await user.click(screen.getByRole("button", { name: "Cancel upload" }))
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toContain(
      "Upload cancelled",
    ),
  )
  expect(UploadRequest.requests).toHaveLength(1)
  await user.click(screen.getByRole("button", { name: "Send files" }))
  expect(UploadRequest.requests[1].send).toHaveBeenCalledWith(files[0])
})

it("shows server errors as text and keeps an empty file eligible for upload", async () => {
  const user = userEvent.setup()
  await user.upload(
    screen.getByLabelText("Photos and files"),
    new File([], "empty.txt"),
  )
  await user.click(screen.getByRole("button", { name: "Send files" }))
  expect(UploadRequest.requests[0].send.mock.calls[0]).toHaveLength(1)
  UploadRequest.requests[0].respond(
    410,
    "Session ended <script>danger()</script>",
  )
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toBe(
      "Session ended <script>danger()</script>",
    ),
  )
  expect(document.getElementById("status")!.children).toHaveLength(0)
  expect(
    (screen.getByRole("button", { name: "Send files" }) as HTMLButtonElement)
      .disabled,
  ).toBe(false)
})
