package share

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"
)

func passwordRequest(target, password string) *http.Request {
	r := request(http.MethodPost, target)
	r.Body = io.NopCloser(strings.NewReader(url.Values{"password": {password}}.Encode()))
	r.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	return r
}

func TestPasswordProtectedRealDownload(t *testing.T) {
	const password = "Grüße + & <secret> 🔑"
	const content = "private file contents"
	m, snapshot := startTest(t, []string{fixture(t, "file.txt", content)}, true, password)
	if !snapshot.PasswordProtected {
		t.Fatal("session did not report password protection")
	}
	encoded, err := json.Marshal(snapshot)
	if err != nil || bytes.Contains(encoded, []byte(password)) || strings.Contains(snapshot.URL, "password") {
		t.Fatalf("credentials leaked in snapshot: %s, %v", encoded, err)
	}
	client := &http.Client{Timeout: 3 * time.Second}
	response, err := client.Get(snapshot.URL)
	if err != nil {
		t.Fatal(err)
	}
	page, err := io.ReadAll(response.Body)
	response.Body.Close()
	if err != nil || response.StatusCode != http.StatusOK || !bytes.Contains(page, []byte(`name="password"`)) || bytes.Contains(page, []byte(password)) {
		t.Fatalf("password form: status %d, error %v", response.StatusCode, err)
	}
	for _, value := range []string{"", "incorrect"} {
		response, err = client.PostForm(snapshot.URL+"/download", url.Values{"password": {value}})
		if err != nil {
			t.Fatal(err)
		}
		body, err := io.ReadAll(response.Body)
		response.Body.Close()
		if err != nil || response.StatusCode != http.StatusForbidden || !bytes.Contains(body, []byte("Incorrect password")) || bytes.Contains(body, []byte(content)) || response.Header.Get("Content-Disposition") != "" {
			t.Fatalf("invalid password: status %d, body %s, error %v", response.StatusCode, body, err)
		}
		if got := m.Snapshot(); got.State != "sharing" || got.Downloads != 0 || len(got.Transfers) != 0 {
			t.Fatalf("invalid password started a transfer: %+v", got)
		}
	}
	r := passwordRequest(snapshot.URL+"/download", password)
	r.RequestURI = ""
	r.Header.Set("Origin", "http://"+r.Host)
	response, err = client.Do(r)
	if err != nil {
		t.Fatal(err)
	}
	data, err := io.ReadAll(response.Body)
	response.Body.Close()
	if err != nil || response.StatusCode != http.StatusOK || string(data) != content || response.Header.Get("Content-Disposition") == "" {
		t.Fatalf("authorized download: status %d, body %q, error %v", response.StatusCode, data, err)
	}
	eventually(t, func() bool { return m.Snapshot().State == "downloaded" })
	if got := m.Snapshot(); got.Downloads != 1 || len(got.Transfers) != 1 || got.Transfers[0].State != "complete" {
		t.Fatalf("authorized one-time download: %+v", got)
	}
}

func TestPasswordCannotBeBypassedInRequests(t *testing.T) {
	m, snapshot := startTest(t, []string{fixture(t, "file.txt", "protected bytes")}, false, "secret")
	target := snapshot.URL + "/download"
	for _, tc := range []struct {
		name string
		r    *http.Request
		code int
	}{
		{"query password", request(http.MethodPost, target+"?password=secret"), http.StatusForbidden},
		{"GET password", request(http.MethodGet, target+"?password=secret"), http.StatusMethodNotAllowed},
		{"HEAD", request(http.MethodHead, target), http.StatusMethodNotAllowed},
		{"oversized password", passwordRequest(target, strings.Repeat("a", maxPasswordBytes+1)), http.StatusForbidden},
		{"oversized form", passwordRequest(target, strings.Repeat("a", 20*1024)), http.StatusBadRequest},
		{"malformed form", func() *http.Request {
			r := passwordRequest(target, "")
			r.Body = io.NopCloser(strings.NewReader("password=%invalid"))
			return r
		}(), http.StatusBadRequest},
		{"cross-origin", func() *http.Request {
			r := passwordRequest(target, "secret")
			r.Header.Set("Origin", "http://other-device")
			return r
		}(), http.StatusForbidden},
	} {
		t.Run(tc.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			m.current.ServeHTTP(w, tc.r)
			if w.Code != tc.code || strings.Contains(w.Body.String(), "protected bytes") {
				t.Fatalf("status %d, body %s", w.Code, w.Body.String())
			}
		})
	}
	if got := m.Snapshot(); got.Downloads != 0 || len(got.Transfers) != 0 {
		t.Fatalf("unauthorized request started a transfer: %+v", got)
	}
}

func TestPasswordAttemptsAreThrottled(t *testing.T) {
	m, snapshot := startTest(t, []string{fixture(t, "file.txt", "hello")}, false, "secret")
	for range 5 {
		w := httptest.NewRecorder()
		m.current.ServeHTTP(w, passwordRequest(snapshot.URL+"/download", "wrong"))
		if w.Code != http.StatusForbidden {
			t.Fatalf("wrong password: %d", w.Code)
		}
	}
	w := httptest.NewRecorder()
	m.current.ServeHTTP(w, passwordRequest(snapshot.URL+"/download", "secret"))
	if w.Code != http.StatusTooManyRequests || w.Header().Get("Retry-After") == "" {
		t.Fatalf("attempts were not throttled: %d", w.Code)
	}
	if got := m.Snapshot(); got.Downloads != 0 || len(got.Transfers) != 0 {
		t.Fatal("throttled request started a transfer")
	}
	m.current.mu.Lock()
	m.current.passwordRetryAt = time.Now().Add(-time.Second)
	m.current.mu.Unlock()
	w = httptest.NewRecorder()
	m.current.ServeHTTP(w, passwordRequest(snapshot.URL+"/download", "secret"))
	if w.Code != http.StatusOK || w.Body.String() != "hello" {
		t.Fatalf("retry after cooldown: %d, %s", w.Code, w.Body.String())
	}
	// A successful download does not unlock later requests on a reusable link.
	w = httptest.NewRecorder()
	m.current.ServeHTTP(w, passwordRequest(snapshot.URL+"/download", ""))
	if w.Code != http.StatusForbidden || m.Snapshot().Downloads != 1 {
		t.Fatal("reusable session no longer required its password")
	}
}

func TestInvalidPasswordDoesNotPublishSession(t *testing.T) {
	m := NewManager()
	defer m.Stop()
	if _, err := m.Start([]string{fixture(t, "file.txt", "hello")}, 15, false, "127.0.0.1", strings.Repeat("a", maxPasswordBytes+1)); err == nil {
		t.Fatal("oversized password accepted")
	}
	if m.Snapshot().State != "idle" {
		t.Fatal("invalid password published a session")
	}
}
