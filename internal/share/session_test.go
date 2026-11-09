package share

import (
	"archive/zip"
	"bytes"
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"testing"
	"time"
)

func fixture(t *testing.T, name, content string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), name)
	if err := os.WriteFile(path, []byte(content), 0600); err != nil {
		t.Fatal(err)
	}
	return path
}

func startTest(t *testing.T, paths []string, once bool) (*Manager, Snapshot) {
	t.Helper()
	m := NewManager()
	snapshot, err := m.Start(paths, 15, once, "127.0.0.1")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(m.Stop)
	return m, snapshot
}

func request(method, target string) *http.Request {
	r := httptest.NewRequest(method, target, nil)
	r.RemoteAddr = "192.168.1.50:1234"
	r.Header.Set("User-Agent", "Mozilla/5.0 (iPhone) AppleWebKit Safari/604.1")
	return r
}

func eventually(t *testing.T, condition func() bool) {
	t.Helper()
	deadline := time.NewTimer(3 * time.Second)
	defer deadline.Stop()
	ticker := time.NewTicker(5 * time.Millisecond)
	defer ticker.Stop()
	for !condition() {
		select {
		case <-deadline.C:
			t.Fatal("condition did not become true")
		case <-ticker.C:
		}
	}
}

func TestRealDownloadAndActivity(t *testing.T) {
	content := "Hello from across the room. Grüße!"
	m, snapshot := startTest(t, []string{fixture(t, "hello.txt", content)}, false)
	client := &http.Client{Timeout: 3 * time.Second}
	response, err := client.Get(snapshot.URL)
	if err != nil {
		t.Fatal(err)
	}
	page, err := io.ReadAll(response.Body)
	response.Body.Close()
	if err != nil || response.StatusCode != 200 || !bytes.Contains(page, []byte("hello.txt")) {
		t.Fatalf("receiver: %d %v", response.StatusCode, err)
	}
	response, err = client.Post(snapshot.URL+"/download", "application/x-www-form-urlencoded", nil)
	if err != nil {
		t.Fatal(err)
	}
	data, err := io.ReadAll(response.Body)
	response.Body.Close()
	if err != nil || string(data) != content {
		t.Fatalf("download: %q %v", data, err)
	}
	if !strings.Contains(response.Header.Get("Content-Disposition"), "attachment") {
		t.Fatal("file was not served as a download")
	}
	eventually(t, func() bool { return m.Snapshot().Downloads == 1 })
	got := m.Snapshot()
	if got.State != "sharing" || got.Visitors != 1 || len(got.Transfers) != 1 || got.Transfers[0].Bytes != int64(len(content)) || got.Transfers[0].State != "complete" {
		t.Fatalf("activity: %+v", got)
	}
}

func TestReceiverAllowsSameOriginFormDownload(t *testing.T) {
	content := "downloaded through the sharing page"
	m, snapshot := startTest(t, []string{fixture(t, "file.txt", content)}, true)
	client := &http.Client{Timeout: 3 * time.Second}
	response, err := client.Get(snapshot.URL)
	if err != nil {
		t.Fatal(err)
	}
	page, err := io.ReadAll(response.Body)
	response.Body.Close()
	if err != nil {
		t.Fatal(err)
	}
	// no-referrer turns the Origin of a browser form POST into "null".
	// The page must preserve same-origin requests without exposing the link
	// as a referrer to other origins.
	if policy := response.Header.Get("Referrer-Policy"); policy != "same-origin" {
		t.Fatalf("form downloads need same-origin referrer policy, got %q", policy)
	}
	if bytes.Contains(page, []byte(`name="referrer"`)) {
		t.Fatal("receiver must not override the server's referrer policy")
	}
	form := regexp.MustCompile(`<form action="([^"]+)" method="post">`).FindSubmatch(page)
	if len(form) != 2 {
		t.Fatal("receiver download form missing")
	}
	pageURL, err := url.Parse(snapshot.URL)
	if err != nil {
		t.Fatal(err)
	}
	action, err := pageURL.Parse(string(form[1]))
	if err != nil {
		t.Fatal(err)
	}
	r, err := http.NewRequest(http.MethodPost, action.String(), nil)
	if err != nil {
		t.Fatal(err)
	}
	r.Header.Set("Origin", pageURL.Scheme+"://"+pageURL.Host)
	r.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	response, err = client.Do(r)
	if err != nil {
		t.Fatal(err)
	}
	data, err := io.ReadAll(response.Body)
	response.Body.Close()
	if err != nil || response.StatusCode != http.StatusOK || string(data) != content {
		t.Fatalf("form download: status %d, body %q, error %v", response.StatusCode, data, err)
	}
	eventually(t, func() bool { return m.Snapshot().State == "downloaded" })
	if m.Snapshot().Downloads != 1 {
		t.Fatal("successful form download did not consume one-time link")
	}
}

func TestOneTimeLinkSurvivesPreviewsAndFailedDownload(t *testing.T) {
	m, snapshot := startTest(t, []string{fixture(t, "example.txt", "some file content")}, true)
	s := m.current
	for _, entry := range []struct {
		method, suffix string
		status         int
	}{
		{"GET", "", 200}, {"HEAD", "", 200}, {"GET", "/download", 405}, {"HEAD", "/download", 405},
	} {
		w := httptest.NewRecorder()
		s.ServeHTTP(w, request(entry.method, snapshot.URL+entry.suffix))
		if w.Code != entry.status {
			t.Fatalf("%s %s: %d", entry.method, entry.suffix, w.Code)
		}
	}
	fail := &failingWriter{header: make(http.Header)}
	s.ServeHTTP(fail, request("POST", snapshot.URL+"/download"))
	if got := m.Snapshot(); got.State != "sharing" || got.Downloads != 0 || got.Transfers[0].State != "interrupted" {
		t.Fatalf("failed transfer consumed link: %+v", got)
	}
	w := httptest.NewRecorder()
	s.ServeHTTP(w, request("POST", snapshot.URL+"/download"))
	if w.Code != 200 || w.Body.String() != "some file content" {
		t.Fatal("retry did not download the file")
	}
	if got := m.Snapshot(); got.State != "downloaded" || got.Downloads != 1 {
		t.Fatalf("one-time link not consumed: %+v", got)
	}
	w = httptest.NewRecorder()
	s.ServeHTTP(w, request("POST", snapshot.URL+"/download"))
	if w.Code != 410 {
		t.Fatalf("consumed link remained available: %d", w.Code)
	}
}

type failingWriter struct{ header http.Header }

func (w *failingWriter) Header() http.Header       { return w.header }
func (w *failingWriter) WriteHeader(int)           {}
func (w *failingWriter) Write([]byte) (int, error) { return 0, io.ErrClosedPipe }

type blockedWriter struct {
	*httptest.ResponseRecorder
	entered chan struct{}
	release chan struct{}
	once    sync.Once
}

func (w *blockedWriter) Write(data []byte) (int, error) {
	w.once.Do(func() { close(w.entered) })
	<-w.release
	return w.ResponseRecorder.Write(data)
}

func TestOneTimeSessionAllowsOnlyOneConcurrentDownload(t *testing.T) {
	m, snapshot := startTest(t, []string{fixture(t, "file.txt", "one recipient")}, true)
	blocked := &blockedWriter{ResponseRecorder: httptest.NewRecorder(), entered: make(chan struct{}), release: make(chan struct{})}
	done := make(chan struct{})
	go func() { defer close(done); m.current.ServeHTTP(blocked, request("POST", snapshot.URL+"/download")) }()
	select {
	case <-blocked.entered:
	case <-time.After(3 * time.Second):
		t.Fatal("first transfer did not start")
	}
	w := httptest.NewRecorder()
	m.current.ServeHTTP(w, request("POST", snapshot.URL+"/download"))
	close(blocked.release)
	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("first transfer did not complete")
	}
	if w.Code != 409 || m.Snapshot().Downloads != 1 {
		t.Fatalf("concurrent download: %d %+v", w.Code, m.Snapshot())
	}
}

func TestStopInterruptsRealTransfer(t *testing.T) {
	path := fixture(t, "large.bin", "")
	file, err := os.OpenFile(path, os.O_WRONLY, 0600)
	if err != nil {
		t.Fatal(err)
	}
	if err := file.Truncate(64 << 20); err != nil {
		file.Close()
		t.Fatal(err)
	}
	file.Close()
	m, snapshot := startTest(t, []string{path}, true)
	client := &http.Client{Timeout: 5 * time.Second}
	response, err := client.Post(snapshot.URL+"/download", "application/x-www-form-urlencoded", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	first := make([]byte, 1024)
	if _, err := io.ReadFull(response.Body, first); err != nil {
		t.Fatal(err)
	}
	m.Stop()
	n, err := io.Copy(io.Discard, response.Body)
	if err == nil || n+int64(len(first)) >= snapshot.Size {
		t.Fatalf("transfer was not interrupted: %d %v", n, err)
	}
	eventually(t, func() bool { return m.Snapshot().Transfers[0].State == "interrupted" })
	if got := m.Snapshot(); got.State != "stopped" || got.Downloads != 0 {
		t.Fatalf("cancelled transfer: %+v", got)
	}
}

func TestExpirationRevocationAndFreshTokens(t *testing.T) {
	m, first := startTest(t, []string{fixture(t, "first.txt", "hello")}, false)
	u, _ := url.Parse(first.URL)
	if len(strings.TrimPrefix(u.Path, "/s/")) != 43 {
		t.Fatal("expected 256-bit URL token")
	}
	s := m.current
	s.mu.Lock()
	s.expiresAt = time.Now().Add(20 * time.Millisecond)
	s.timer.Reset(20 * time.Millisecond)
	s.mu.Unlock()
	eventually(t, func() bool { return m.Snapshot().State == "expired" })
	w := httptest.NewRecorder()
	s.ServeHTTP(w, request("GET", first.URL))
	if w.Code != 410 {
		t.Fatal("expired payload still available")
	}
	client := &http.Client{Timeout: time.Second}
	if response, err := client.Get(first.URL); err == nil {
		response.Body.Close()
		t.Fatal("expired listener stayed open")
	}
	second, err := m.Start([]string{fixture(t, "second.txt", "world")}, 5, false, "127.0.0.1")
	if err != nil {
		t.Fatal(err)
	}
	if first.URL == second.URL || strings.HasSuffix(second.URL, u.Path) {
		t.Fatal("token was reused")
	}
	m.Reset()
	if m.Snapshot().State != "idle" {
		t.Fatal("reset did not clear session")
	}
}

func TestInvalidRequestsCannotReadFilesOrConsumeLink(t *testing.T) {
	m, snapshot := startTest(t, []string{fixture(t, "file.txt", "secret")}, true)
	for _, entry := range []struct {
		method, path, origin, remote string
		status                       int
	}{
		{"GET", "/", "", "192.168.1.2:90", 404},
		{"GET", "/s/wrong", "", "192.168.1.2:90", 404},
		{"GET", "/s/../../README.md", "", "192.168.1.2:90", 404},
		{"GET", snapshot.URL + "/file.txt", "", "192.168.1.2:90", 404},
		{"DELETE", snapshot.URL, "", "192.168.1.2:90", 405},
		{"POST", snapshot.URL + "/download", "https://unrelated.example", "192.168.1.2:90", 403},
		{"POST", snapshot.URL + "/download", "null", "192.168.1.2:90", 403},
		{"GET", snapshot.URL, "", "8.8.8.8:90", 403},
	} {
		w := httptest.NewRecorder()
		r := request(entry.method, entry.path)
		r.RemoteAddr = entry.remote
		r.Header.Set("Origin", entry.origin)
		m.current.ServeHTTP(w, r)
		if w.Code != entry.status {
			t.Errorf("%s %s: %d want %d", entry.method, entry.path, w.Code, entry.status)
		}
	}
	if m.Snapshot().Downloads != 0 || m.Snapshot().State != "sharing" {
		t.Fatal("invalid request consumed session")
	}
}

func TestShortenedFileDoesNotConsumeOneTimeLink(t *testing.T) {
	path := fixture(t, "changing.txt", "long original content")
	m, snapshot := startTest(t, []string{path}, true)
	if err := os.Truncate(path, 3); err != nil {
		t.Fatal(err)
	}
	w := httptest.NewRecorder()
	m.current.ServeHTTP(w, request("POST", snapshot.URL+"/download"))
	if got := m.Snapshot(); got.Downloads != 0 || got.State != "sharing" || got.Transfers[0].State != "interrupted" {
		t.Fatalf("truncated payload counted as success: %+v", got)
	}
}

func TestFolderZIPPreservesEmptyDirectoriesAndDuplicateNames(t *testing.T) {
	root := t.TempDir()
	folder := filepath.Join(root, "Photos")
	if err := os.MkdirAll(filepath.Join(folder, "empty"), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(folder, "notes.txt"), []byte("in the folder"), 0600); err != nil {
		t.Fatal(err)
	}
	a := fixture(t, "same.txt", "first")
	b := fixture(t, "same.txt", "second")
	m, snapshot := startTest(t, []string{folder, a, b}, false)
	temporary := m.current.payload.temporary
	w := httptest.NewRecorder()
	m.current.ServeHTTP(w, request("POST", snapshot.URL+"/download"))
	reader, err := zip.NewReader(bytes.NewReader(w.Body.Bytes()), int64(w.Body.Len()))
	if err != nil {
		t.Fatal(err)
	}
	entries := map[string]string{}
	for _, entry := range reader.File {
		file, err := entry.Open()
		if err != nil {
			t.Fatal(err)
		}
		content, err := io.ReadAll(file)
		file.Close()
		if err != nil {
			t.Fatal(err)
		}
		entries[entry.Name] = string(content)
		if strings.Contains(entry.Name, "..") || filepath.IsAbs(entry.Name) {
			t.Fatalf("unsafe ZIP entry %q", entry.Name)
		}
	}
	if entries["Photos/notes.txt"] != "in the folder" || entries["same.txt"] != "first" || entries["same (2).txt"] != "second" {
		t.Fatalf("archive entries: %+v", entries)
	}
	if _, ok := entries["Photos/empty/"]; !ok {
		t.Fatal("empty directory was lost")
	}
	m.Stop()
	if _, err := os.Stat(temporary); !os.IsNotExist(err) {
		t.Fatalf("temporary ZIP was not removed: %v", err)
	}
	if _, err := os.Stat(folder); err != nil {
		t.Fatal("original folder was affected")
	}
}

func TestReceiverEscapesFilenames(t *testing.T) {
	m, snapshot := startTest(t, []string{fixture(t, "file.txt", "data")}, false)
	m.current.payload.items[0].Name = `<script>alert("hello")</script>`
	w := httptest.NewRecorder()
	m.current.ServeHTTP(w, request("GET", snapshot.URL))
	if strings.Contains(w.Body.String(), "<script>") || !strings.Contains(w.Body.String(), "&lt;script&gt;") {
		t.Fatal("filename was not escaped")
	}
	if !strings.Contains(w.Header().Get("Content-Security-Policy"), "default-src 'none'") || w.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("receiver privacy headers missing")
	}
	if strings.Contains(w.Body.String(), m.current.payload.items[0].Path) {
		t.Fatal("receiver exposed sender path")
	}
}

func TestSymlinksAreNotIncluded(t *testing.T) {
	folder := t.TempDir()
	secret := fixture(t, "private.txt", "outside selected folder")
	if err := os.Symlink(secret, filepath.Join(folder, "link.txt")); err != nil {
		t.Skipf("symlinks unavailable: %v", err)
	}
	if p, err := prepare(context.Background(), []string{folder}); err == nil {
		p.close()
		t.Fatal("symlink was archived")
	}
}

func TestPreparationCanBeCancelled(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := prepare(ctx, []string{fixture(t, "file.txt", "data")}); !errors.Is(err, context.Canceled) {
		t.Fatalf("cancelled preparation: %v", err)
	}
	reader := &contextReader{ctx: ctx, reader: strings.NewReader("data")}
	if _, err := reader.Read(make([]byte, 4)); !errors.Is(err, context.Canceled) {
		t.Fatal("bundling ignored cancellation")
	}
}

func TestStopCancelsZIPPreparationWithoutPublishing(t *testing.T) {
	folder := t.TempDir()
	file, err := os.Create(filepath.Join(folder, "large.bin"))
	if err != nil {
		t.Fatal(err)
	}
	if err := file.Truncate(128 << 20); err != nil {
		file.Close()
		t.Fatal(err)
	}
	file.Close()
	m := NewManager()
	t.Cleanup(m.Stop)
	done := make(chan error, 1)
	go func() { _, err := m.Start([]string{folder}, 15, false, "127.0.0.1"); done <- err }()
	eventually(t, func() bool { m.mu.Lock(); defer m.mu.Unlock(); return m.preparing })
	m.Stop()
	select {
	case err := <-done:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("expected cancelled preparation: %v", err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("ZIP preparation did not stop")
	}
	if m.Snapshot().State != "idle" {
		t.Fatal("cancelled preparation published a session")
	}
}

func TestInvalidSessionOptions(t *testing.T) {
	file := fixture(t, "file.txt", "data")
	for _, entry := range []struct {
		paths   []string
		minutes int
		address string
	}{
		{nil, 15, "127.0.0.1"}, {[]string{file}, 0, "127.0.0.1"}, {[]string{file}, 1441, "127.0.0.1"},
		{[]string{file}, 15, "8.8.8.8"}, {[]string{file}, 15, "invalid"},
	} {
		m := NewManager()
		if _, err := m.Start(entry.paths, entry.minutes, false, entry.address); err == nil {
			m.Stop()
			t.Fatalf("accepted invalid options: %+v", entry)
		}
	}
}
