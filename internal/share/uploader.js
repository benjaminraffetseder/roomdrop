"use strict";

const form = document.getElementById("upload-form");
const input = document.getElementById("files");
const list = document.getElementById("file-list");
const send = document.getElementById("send");
const cancel = document.getElementById("cancel");
const status = document.getElementById("status");
let queue = [];
let active = null;
let running = false;
let cancelled = false;

function showStatus(message, error = false) {
  status.textContent = message;
  status.className = error ? "error" : "success";
}

input.addEventListener("change", () => {
  list.replaceChildren();
  queue = Array.from(input.files, (file) => {
    const row = document.createElement("li");
    const name = document.createElement("span");
    name.className = "file-name";
    name.textContent = file.name;
    const detail = document.createElement("small");
    detail.textContent = "Ready to send";
    const progress = document.createElement("progress");
    progress.max = 100;
    progress.value = 0;
    progress.hidden = true;
    progress.setAttribute("aria-label", `Upload progress for ${file.name}`);
    row.append(name, detail, progress);
    list.append(row);
    return { file, detail, progress, complete: false };
  });
  send.disabled = queue.length === 0;
  showStatus("");
});

function upload(item) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    active = xhr;
    xhr.open("POST", form.dataset.endpoint);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.setRequestHeader("X-RoomDrop-Filename", encodeURIComponent(item.file.name));
    item.progress.hidden = false;
    item.progress.value = 0;
    item.detail.textContent = "Sending…";
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        item.progress.value = Math.min(99, Math.round(event.loaded / event.total * 100));
        item.detail.textContent = event.loaded === event.total
          ? "Saving on the computer…"
          : `${Math.round(event.loaded / event.total * 100)}% sent`;
      }
    };
    xhr.onload = () => {
      if (xhr.status !== 201) {
        reject(new Error(xhr.responseText.trim() || "The upload failed. Try this file again."));
        return;
      }
      try {
        const result = JSON.parse(xhr.responseText);
        item.complete = true;
        item.progress.value = 100;
        item.detail.textContent = result.name === item.file.name
          ? "Received on the computer"
          : `Received as ${result.name}`;
        resolve();
      } catch {
        reject(new Error("Could not confirm receipt. Check the computer before retrying."));
      }
    };
    xhr.onerror = () => reject(new Error("Connection lost. Check that RoomDrop is open, the link is active, and both devices are on the same network."));
    xhr.onabort = () => reject(new Error("Upload cancelled. You can retry unfinished files."));
    xhr.send(item.file);
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (running || !queue.some((item) => !item.complete)) return;
  running = true;
  cancelled = false;
  input.disabled = true;
  send.disabled = true;
  cancel.hidden = false;
  showStatus("Sending files. Keep this page open.");
  try {
    for (const item of queue) {
      if (cancelled) break;
      if (item.complete) continue;
      if (item.file.size > 10 * 1024 * 1024 * 1024) {
        item.detail.textContent = "File exceeds the 10 GiB limit";
        throw new Error("Each file must be 10 GiB or smaller. Choose smaller files to continue.");
      }
      try {
        await upload(item);
      } catch (error) {
        item.detail.textContent = "Not confirmed — retry or check the computer";
        throw error;
      }
    }
    const complete = queue.filter((item) => item.complete).length;
    showStatus(`${complete} ${complete === 1 ? "file received" : "files received"} on the computer. Choose more files to send another batch.`);
  } catch (error) {
    showStatus(error.message, true);
  } finally {
    active = null;
    running = false;
    input.disabled = false;
    send.disabled = !queue.some((item) => !item.complete);
    cancel.hidden = true;
  }
});

cancel.addEventListener("click", () => {
  cancelled = true;
  if (active) active.abort();
});

window.addEventListener("beforeunload", (event) => {
  if (running) {
    event.preventDefault();
    event.returnValue = "";
  }
});
