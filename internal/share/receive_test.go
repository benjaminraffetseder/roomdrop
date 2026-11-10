package share

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

func startReceiveTest(t *testing.T) (*Manager, Snapshot, string) {
	t.Helper()
	destination := t.TempDir()
	m := NewManager()
	snapshot, err := m.StartReceive(destination, 15, "127.0.0.1")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(m.Stop)
	return m, snapshot, destination
}

func uploadRequest(target, name, content string) *http.Request {
	r := request(http.MethodPost, target+"/upload")
	r.Body = io.NopCloser(strings.NewReader(content))
	if content == "" {
		r.Body = http.NoBody
	}
	r.ContentLength = int64(len(content))
	r.Header.Set("Content-Type", "application/octet-stream")
	r.Header.Set("X-RoomDrop-Filename", url.PathEscape(name))
	return r
}

func TestRealReceiveAndDuplicateNames(t *testing.T) {
	m, snapshot, destination := startReceiveTest(t)
	if snapshot.Mode != "receive" || snapshot.Destination != destination || snapshot.Once || snapshot.PasswordProtected {
		t.Fatalf("receive snapshot: %+v", snapshot)
	}
	client := &http.Client{Timeout: 3 * time.Second}
	for _, name := range []string{"photo.jpg", "photo.jpg", "Grüße 🌿.txt", "empty.txt"} {
		content := "hello from the phone: " + name
		if name == "empty.txt" {
			content = ""
		}
		r := uploadRequest(snapshot.URL, name, content)
		r.RequestURI, r.RemoteAddr = "", ""
		r.Header.Set("Origin", strings.TrimSuffix(snapshot.URL, "/s/"+m.current.token))
		response, err := client.Do(r)
		if err != nil {
			t.Fatal(err)
		}
		body, _ := io.ReadAll(response.Body)
		response.Body.Close()
		if response.StatusCode != http.StatusCreated || !bytes.Contains(body, []byte(`"name"`)) {
			t.Fatalf("upload %q: %d %s", name, response.StatusCode, body)
		}
	}
	for _, name := range []string{"photo.jpg", "photo (2).jpg", "Grüße 🌿.txt", "empty.txt"} {
		data, err := os.ReadFile(filepath.Join(destination, name))
		original := name
		if name == "photo (2).jpg" {
			original = "photo.jpg"
		}
		want := "hello from the phone: " + original
		if name == "empty.txt" {
			want = ""
		}
		if err != nil || string(data) != want {
			t.Fatalf("saved %q: %q %v", name, data, err)
		}
	}
	got := m.Snapshot()
	if got.Uploads != 4 || got.Downloads != 0 || len(got.Items) != 4 || len(got.Transfers) != 4 {
		t.Fatalf("activity: %+v", got)
	}
	for _, transfer := range got.Transfers {
		if transfer.State != "complete" || transfer.Bytes != transfer.Total || transfer.Name == "" {
			t.Fatalf("transfer: %+v", transfer)
		}
	}
	m.Stop()
	if _, err := os.Stat(filepath.Join(destination, "photo.jpg")); err != nil {
		t.Fatal("stopping removed a completed file:", err)
	}
}

func TestReceivePageAndEndpointIsolation(t *testing.T) {
	m, snapshot, destination := startReceiveTest(t)
	for _, suffix := range []string{"", "/uploader.js"} {
		w := httptest.NewRecorder()
		m.current.ServeHTTP(w, request("GET", snapshot.URL+suffix))
		if w.Code != http.StatusOK || strings.Contains(w.Body.String(), destination) {
			t.Fatalf("receive page exposed destination or failed: %d", w.Code)
		}
		if !strings.Contains(w.Header().Get("Content-Security-Policy"), "script-src 'self'") || w.Header().Get("Cache-Control") != "no-store" {
			t.Fatal("missing receive page protections")
		}
		if suffix == "" && (!strings.Contains(w.Body.String(), "Send files to the computer") || !strings.Contains(w.Body.String(), "/uploader.js")) {
			t.Fatal("missing upload page")
		}
	}
	for _, target := range []string{snapshot.URL + "/download", snapshot.URL + "/photo.jpg", snapshot.URL + "bad/upload"} {
		w := httptest.NewRecorder()
		m.current.ServeHTTP(w, request("GET", target))
		if w.Code != http.StatusNotFound {
			t.Fatalf("unexpected endpoint: %s: %d", target, w.Code)
		}
	}
	sender, send := startTest(t, []string{fixture(t, "secret.txt", "secret")}, false)
	w := httptest.NewRecorder()
	sender.current.ServeHTTP(w, uploadRequest(send.URL, "new.txt", "data"))
	if w.Code != http.StatusNotFound {
		t.Fatal("send sessions accept uploads")
	}
}

func TestReceiveRejectsUnsafeRequests(t *testing.T) {
	m, snapshot, destination := startReceiveTest(t)
	for _, name := range []string{"", ".", "..", "../outside", `..\outside`, "/absolute", `C:\absolute`, "file:stream", "nul.txt", "CON", "COM1.txt", "LPT9", "CONIN$", "name.", " name", "a\x00b", "a\nb", strings.Repeat("a", 181)} {
		t.Run(fmt.Sprintf("name_%q", name), func(t *testing.T) {
			w := httptest.NewRecorder()
			m.current.ServeHTTP(w, uploadRequest(snapshot.URL, name, "data"))
			if w.Code != http.StatusBadRequest {
				t.Fatalf("accepted filename %q: %d", name, w.Code)
			}
		})
	}
	for _, tc := range []struct {
		name string
		edit func(*http.Request)
		code int
	}{
		{"cross_origin", func(r *http.Request) { r.Header.Set("Origin", "http://evil.example") }, 403},
		{"null_origin", func(r *http.Request) { r.Header.Set("Origin", "null") }, 403},
		{"public_address", func(r *http.Request) { r.RemoteAddr = "8.8.8.8:1234" }, 403},
		{"bad_encoding", func(r *http.Request) { r.Header.Set("X-RoomDrop-Filename", "%zz") }, 400},
		{"wrong_type", func(r *http.Request) { r.Header.Set("Content-Type", "text/plain") }, 415},
		{"unknown_size", func(r *http.Request) { r.ContentLength = -1 }, 411},
		{"oversize", func(r *http.Request) { r.ContentLength = maxUploadBytes + 1 }, 413},
		{"get", func(r *http.Request) { r.Method = http.MethodGet }, 405},
		{"head", func(r *http.Request) { r.Method = http.MethodHead }, 405},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := uploadRequest(snapshot.URL, "file.txt", "data")
			tc.edit(r)
			w := httptest.NewRecorder()
			m.current.ServeHTTP(w, r)
			if w.Code != tc.code {
				t.Fatalf("%d, want %d: %s", w.Code, tc.code, w.Body.String())
			}
		})
	}
	entries, _ := os.ReadDir(destination)
	if len(entries) != 0 || m.Snapshot().Uploads != 0 || len(m.Snapshot().Transfers) != 0 {
		t.Fatal("rejected uploads wrote files or created activity")
	}
}

type brokenUpload struct{}

func (brokenUpload) Read([]byte) (int, error) { return 0, errors.New("connection lost") }

func TestReceiveRemovesIncompleteFilesAndAllowsRetry(t *testing.T) {
	m, snapshot, destination := startReceiveTest(t)
	for _, broken := range []bool{false, true} {
		r := uploadRequest(snapshot.URL, "partial.txt", "partial")
		r.ContentLength = 100
		if broken {
			r.Body = io.NopCloser(io.MultiReader(strings.NewReader("partial"), brokenUpload{}))
		}
		w := httptest.NewRecorder()
		m.current.ServeHTTP(w, r)
		if w.Code != http.StatusInternalServerError {
			t.Fatalf("incomplete upload: %d", w.Code)
		}
		if _, err := os.Stat(filepath.Join(destination, "partial.txt")); !errors.Is(err, os.ErrNotExist) {
			t.Fatal("partial file remains:", err)
		}
	}
	w := httptest.NewRecorder()
	m.current.ServeHTTP(w, uploadRequest(snapshot.URL, "partial.txt", "complete"))
	if w.Code != http.StatusCreated || m.Snapshot().Uploads != 1 || m.Snapshot().Transfers[0].State != "interrupted" {
		t.Fatalf("retry failed: %d %+v", w.Code, m.Snapshot())
	}
}

func TestReceiveConcurrentNamesPreserveExistingFiles(t *testing.T) {
	m, snapshot, destination := startReceiveTest(t)
	if err := os.WriteFile(filepath.Join(destination, "same.txt"), []byte("original"), 0600); err != nil {
		t.Fatal(err)
	}
	var group sync.WaitGroup
	for i := range 4 {
		group.Go(func() {
			w := httptest.NewRecorder()
			m.current.ServeHTTP(w, uploadRequest(snapshot.URL, "same.txt", fmt.Sprintf("file %d", i)))
			if w.Code != http.StatusCreated {
				t.Errorf("concurrent upload: %d", w.Code)
			}
		})
	}
	group.Wait()
	original, err := os.ReadFile(filepath.Join(destination, "same.txt"))
	if err != nil || string(original) != "original" {
		t.Fatal("overwrote original")
	}
	seen := map[string]bool{}
	for n := 2; n <= 5; n++ {
		data, err := os.ReadFile(filepath.Join(destination, fmt.Sprintf("same (%d).txt", n)))
		if err != nil || seen[string(data)] {
			t.Fatalf("missing or duplicate upload: %q %v", data, err)
		}
		seen[string(data)] = true
	}
}

func TestReceiveStopExpiryAndResetCancelUploads(t *testing.T) {
	for _, ending := range []string{"stop", "expiry", "reset", "disconnect"} {
		t.Run(ending, func(t *testing.T) {
			m, snapshot, destination := startReceiveTest(t)
			s := m.current
			reader, writer := io.Pipe()
			defer reader.Close()
			defer writer.Close()
			r, _ := http.NewRequest(http.MethodPost, snapshot.URL+"/upload", reader)
			r.ContentLength = 1000
			r.Header.Set("Content-Type", "application/octet-stream")
			r.Header.Set("X-RoomDrop-Filename", "partial.txt")
			client := &http.Client{Timeout: 3 * time.Second}
			defer client.CloseIdleConnections()
			done := make(chan struct{})
			go func() {
				defer close(done)
				response, _ := client.Do(r)
				if response != nil {
					response.Body.Close()
				}
			}()
			if _, err := writer.Write([]byte("partial")); err != nil {
				t.Fatal(err)
			}
			eventually(t, func() bool { got := s.snapshot(); return len(got.Transfers) == 1 && got.Transfers[0].Bytes > 0 })
			switch ending {
			case "stop":
				m.Stop()
			case "expiry":
				s.stop("expired")
			case "reset":
				m.Reset()
			case "disconnect":
				_ = writer.CloseWithError(errors.New("phone disconnected"))
			}
			_ = writer.Close()
			eventually(t, func() bool { got := s.snapshot(); return got.Transfers[0].State == "interrupted" })
			entries, _ := os.ReadDir(destination)
			if len(entries) != 0 || s.snapshot().Uploads != 0 {
				t.Fatal("cancelled upload left a file or receipt")
			}
			select {
			case <-done:
			case <-time.After(4 * time.Second):
				t.Fatal("upload did not exit")
			}
		})
	}
}

func TestReceiveValidatesDestinationAndSessionOwnership(t *testing.T) {
	m := NewManager()
	for _, path := range []string{"", filepath.Join(t.TempDir(), "missing"), fixture(t, "file", "data")} {
		if _, err := m.StartReceive(path, 15, "127.0.0.1"); err == nil {
			t.Fatalf("accepted destination %q", path)
		}
	}
	m, _, _ = startReceiveTest(t)
	if _, err := m.Start([]string{fixture(t, "file", "data")}, 15, false, "127.0.0.1", ""); err == nil {
		t.Fatal("send replaced receive")
	}
	if _, err := m.StartReceive(t.TempDir(), 15, "127.0.0.1"); err == nil {
		t.Fatal("receive replaced receive")
	}
	m.Stop()
	if _, err := m.Start([]string{fixture(t, "file", "data")}, 15, false, "127.0.0.1", ""); err != nil {
		t.Fatal("could not send after receiving:", err)
	}
}

func TestReceiveLimitsConcurrentUploads(t *testing.T) {
	m, snapshot, destination := startReceiveTest(t)
	var uploads sync.WaitGroup
	writers := make([]*io.PipeWriter, 4)
	for i := range 4 {
		reader, writer := io.Pipe()
		writers[i] = writer
		defer writer.CloseWithError(errors.New("test finished"))
		r := uploadRequest(snapshot.URL, fmt.Sprintf("pending-%d.txt", i), "")
		r.Body, r.ContentLength = reader, 100
		uploads.Go(func() {
			defer reader.Close()
			m.current.ServeHTTP(httptest.NewRecorder(), r)
		})
		if _, err := writer.Write([]byte("partial")); err != nil {
			t.Fatal(err)
		}
	}
	w := httptest.NewRecorder()
	m.current.ServeHTTP(w, uploadRequest(snapshot.URL, "fifth.txt", "data"))
	if w.Code != http.StatusConflict {
		t.Fatalf("fifth concurrent upload: %d", w.Code)
	}
	for _, writer := range writers {
		_ = writer.CloseWithError(errors.New("cancelled"))
	}
	uploads.Wait()
	entries, _ := os.ReadDir(destination)
	if len(entries) != 0 || m.Snapshot().Uploads != 0 {
		t.Fatal("cancelled concurrent uploads left files")
	}
}

func TestReceiveDoesNotFollowExistingSymlink(t *testing.T) {
	m, snapshot, destination := startReceiveTest(t)
	outside := fixture(t, "original.txt", "keep this")
	if err := os.Symlink(outside, filepath.Join(destination, "linked.txt")); err != nil {
		t.Skip("symlinks unavailable:", err)
	}
	w := httptest.NewRecorder()
	m.current.ServeHTTP(w, uploadRequest(snapshot.URL, "linked.txt", "incoming"))
	data, err := os.ReadFile(outside)
	if err != nil || string(data) != "keep this" {
		t.Fatal("upload modified a symlink target")
	}
	if w.Code == http.StatusCreated {
		data, err = os.ReadFile(filepath.Join(destination, "linked (2).txt"))
		if err != nil || string(data) != "incoming" {
			t.Fatal("upload was not saved separately")
		}
	} else if w.Code != http.StatusInternalServerError {
		t.Fatalf("unexpected symlink rejection: %d", w.Code)
	}
}
