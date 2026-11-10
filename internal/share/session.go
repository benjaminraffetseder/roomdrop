package share

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"mime"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

type Transfer struct {
	ID      int64  `json:"id"`
	Device  string `json:"device"`
	Address string `json:"address"`
	Bytes   int64  `json:"bytes"`
	Total   int64  `json:"total"`
	State   string `json:"state"`
}

type Snapshot struct {
	State             string     `json:"state"`
	URL               string     `json:"url"`
	ExpiresAt         time.Time  `json:"expiresAt"`
	Once              bool       `json:"once"`
	PasswordProtected bool       `json:"passwordProtected"`
	Name              string     `json:"name"`
	Size              int64      `json:"size"`
	Items             []Item     `json:"items"`
	Visitors          int        `json:"visitors"`
	Downloads         int        `json:"downloads"`
	Transfers         []Transfer `json:"transfers"`
}

type Manager struct {
	mu            sync.Mutex
	current       *session
	preparing     bool
	prepareCancel context.CancelFunc
}

type session struct {
	mu               sync.Mutex
	state            string
	url              string
	token            string
	expiresAt        time.Time
	once             bool
	payload          *payload
	server           *http.Server
	timer            *time.Timer
	cancel           context.CancelFunc
	cleanup          sync.Once
	visitors         map[string]bool
	transfers        []*Transfer
	nextID           int64
	downloads        int
	inFlight         int
	passwordDigest   *[32]byte
	passwordFailures int
	passwordRetryAt  time.Time
}

func NewManager() *Manager { return &Manager{} }

func (m *Manager) Start(paths []string, minutes int, once bool, address, password string) (Snapshot, error) {
	m.mu.Lock()
	if m.preparing || (m.current != nil && m.current.snapshot().State == "sharing") {
		m.mu.Unlock()
		return Snapshot{}, errors.New("A session is already running. Stop sharing before starting another.")
	}
	if minutes < 1 || minutes > 1440 {
		m.mu.Unlock()
		return Snapshot{}, errors.New("Choose an expiration between 1 minute and 24 hours.")
	}
	if len(password) > maxPasswordBytes {
		m.mu.Unlock()
		return Snapshot{}, errors.New("Choose a shorter download password (up to 1024 bytes).")
	}
	ip := net.ParseIP(address)
	if ip == nil || ip.To4() == nil || (!ip.IsPrivate() && !ip.IsLoopback()) {
		m.mu.Unlock()
		return Snapshot{}, errors.New("Choose a local IPv4 network address.")
	}
	prepareCtx, prepareCancel := context.WithCancel(context.Background())
	m.preparing, m.prepareCancel = true, prepareCancel
	m.mu.Unlock()
	defer func() {
		prepareCancel()
		m.mu.Lock()
		m.preparing, m.prepareCancel = false, nil
		m.mu.Unlock()
	}()
	p, err := prepare(prepareCtx, paths)
	if err != nil {
		return Snapshot{}, err
	}
	// Stop and Reset can interrupt ZIP creation. Publish only if preparation
	// still belongs to this live operation.
	m.mu.Lock()
	defer m.mu.Unlock()
	if err := prepareCtx.Err(); err != nil {
		p.close()
		return Snapshot{}, err
	}
	// Publish only on the adapter the sender chose.
	listener, err := net.Listen("tcp4", net.JoinHostPort(address, "0"))
	if err != nil {
		p.close()
		return Snapshot{}, errors.New("Could not start sharing on this network. Reconnect and try again.")
	}
	secret := make([]byte, 32)
	if _, err := rand.Read(secret); err != nil {
		_ = listener.Close()
		p.close()
		return Snapshot{}, errors.New("Could not create a secure sharing link.")
	}
	ctx, cancel := context.WithCancel(context.Background())
	s := &session{
		state: "sharing", token: base64.RawURLEncoding.EncodeToString(secret),
		expiresAt: time.Now().Add(time.Duration(minutes) * time.Minute),
		once:      once, payload: p, cancel: cancel, visitors: make(map[string]bool),
	}
	s.setPassword(password)
	s.url = "http://" + listener.Addr().String() + "/s/" + s.token
	s.server = &http.Server{
		Handler: s, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second,
		IdleTimeout: 30 * time.Second, MaxHeaderBytes: 16 * 1024,
		BaseContext: func(net.Listener) context.Context { return ctx },
	}
	s.timer = time.AfterFunc(time.Until(s.expiresAt), func() { s.stop("expired") })
	m.current = s
	go func() {
		if err := s.server.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
			s.stop("error")
		}
	}()
	return s.snapshot(), nil
}

func (m *Manager) Snapshot() Snapshot {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.current == nil {
		return Snapshot{State: "idle", Items: []Item{}, Transfers: []Transfer{}}
	}
	return m.current.snapshot()
}

func (m *Manager) Stop() {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.prepareCancel != nil {
		m.prepareCancel()
	}
	if m.current != nil {
		m.current.stop("stopped")
	}
}

func (m *Manager) Reset() {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.prepareCancel != nil {
		m.prepareCancel()
	}
	if m.current != nil {
		m.current.stop("stopped")
	}
	m.current = nil
}

func (s *session) snapshot() Snapshot {
	s.mu.Lock()
	defer s.mu.Unlock()
	items := append([]Item{}, s.payload.items...)
	transfers := make([]Transfer, len(s.transfers))
	for i, transfer := range s.transfers {
		transfers[i] = *transfer
	}
	return Snapshot{
		State: s.state, URL: s.url, ExpiresAt: s.expiresAt, Once: s.once,
		PasswordProtected: s.passwordDigest != nil,
		Name:              s.payload.name, Size: s.payload.size, Items: items,
		Visitors: len(s.visitors), Downloads: s.downloads, Transfers: transfers,
	}
}

func (s *session) stop(reason string) {
	s.mu.Lock()
	if s.state == "sharing" {
		s.state = reason
	}
	s.timer.Stop()
	s.cancel()
	s.mu.Unlock()
	// Close cancels open transfers as well as revoking the link.
	_ = s.server.Close()
	s.cleanup.Do(s.payload.close)
}

func (s *session) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	// no-referrer also suppresses Origin on browser form POSTs. Preserve it
	// for local downloads while withholding referrers from other origins.
	w.Header().Set("Referrer-Policy", "same-origin")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("X-Frame-Options", "DENY")
	w.Header().Set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'")
	ip, _, _ := net.SplitHostPort(r.RemoteAddr)
	remote := net.ParseIP(ip)
	if remote == nil || (!remote.IsPrivate() && !remote.IsLoopback() && !remote.IsLinkLocalUnicast()) {
		http.Error(w, "This session is only available on the local network.", http.StatusForbidden)
		return
	}
	path := "/s/" + s.token
	if r.URL.Path != path && r.URL.Path != path+"/download" {
		http.NotFound(w, r)
		return
	}
	s.mu.Lock()
	active := s.state == "sharing" && time.Now().Before(s.expiresAt)
	s.mu.Unlock()
	if !active {
		http.Error(w, "This RoomDrop session has ended. Ask the sender for a new link.", http.StatusGone)
		return
	}
	if r.URL.Path == path {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if r.Method == http.MethodHead {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			return
		}
		s.mu.Lock()
		if len(s.visitors) < 64 {
			s.visitors[ip+"|"+deviceName(r.UserAgent())] = true
		}
		s.mu.Unlock()
		s.render(w, path, http.StatusOK, "")
		return
	}
	// Link preview bots and HEAD requests must not consume a one-time session.
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		http.Error(w, "Open the sharing link and use the download button.", http.StatusMethodNotAllowed)
		return
	}
	if origin := r.Header.Get("Origin"); origin != "" && origin != "http://"+r.Host {
		http.Error(w, "Please download from the original sharing page.", http.StatusForbidden)
		return
	}
	if s.authorizeDownload(w, r, path) {
		s.download(w, r, ip)
	}
}

func (s *session) download(w http.ResponseWriter, r *http.Request, ip string) {
	s.mu.Lock()
	if s.state != "sharing" || !time.Now().Before(s.expiresAt) {
		s.mu.Unlock()
		http.Error(w, "This session has ended.", http.StatusGone)
		return
	}
	if (s.once && s.inFlight > 0) || s.inFlight >= 4 {
		s.mu.Unlock()
		http.Error(w, "A transfer is in progress. Please try again shortly.", http.StatusConflict)
		return
	}
	s.inFlight++
	s.nextID++
	t := &Transfer{ID: s.nextID, Device: deviceName(r.UserAgent()), Address: ip, Total: s.payload.size, State: "sending"}
	if len(s.transfers) >= 50 {
		for i, old := range s.transfers {
			if old.State != "sending" {
				s.transfers = append(s.transfers[:i], s.transfers[i+1:]...)
				break
			}
		}
	}
	s.transfers = append(s.transfers, t)
	s.mu.Unlock()
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": s.payload.name}))
	w.Header().Set("Content-Length", strconv.FormatInt(s.payload.size, 10))
	writer := &progressWriter{writer: w, session: s, transfer: t, request: r}
	n, err := io.CopyBuffer(writer, io.NewSectionReader(s.payload.file, 0, s.payload.size), make([]byte, 64*1024))
	if err == nil && n != s.payload.size {
		err = io.ErrUnexpectedEOF
	}
	if err == nil {
		err = http.NewResponseController(w).Flush()
	}
	s.mu.Lock()
	s.inFlight--
	if err == nil && r.Context().Err() == nil && s.state == "sharing" {
		t.State = "complete"
		s.downloads++
		if s.once {
			s.state = "downloaded"
			s.timer.Stop()
		}
	} else {
		t.State = "interrupted"
	}
	consumed := s.state == "downloaded"
	s.mu.Unlock()
	if consumed {
		// Finish flushing this response before closing its socket and ZIP.
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			_ = s.server.Shutdown(ctx)
			s.stop("downloaded")
		}()
	}
}

type progressWriter struct {
	writer   http.ResponseWriter
	session  *session
	transfer *Transfer
	request  *http.Request
}

func (p *progressWriter) Write(data []byte) (int, error) {
	if err := p.request.Context().Err(); err != nil {
		return 0, err
	}
	_ = http.NewResponseController(p.writer).SetWriteDeadline(time.Now().Add(30 * time.Second))
	n, err := p.writer.Write(data)
	p.session.mu.Lock()
	p.transfer.Bytes += int64(n)
	p.session.mu.Unlock()
	return n, err
}

func deviceName(agent string) string {
	platform := "Device"
	for _, entry := range []struct{ match, name string }{{"iPhone", "iPhone"}, {"iPad", "iPad"}, {"Android", "Android"}, {"Windows", "Windows"}, {"Macintosh", "Mac"}, {"Linux", "Linux"}} {
		if strings.Contains(agent, entry.match) {
			platform = entry.name
			break
		}
	}
	browser := "browser"
	for _, entry := range []struct{ match, name string }{{"Edg/", "Edge"}, {"Firefox/", "Firefox"}, {"Chrome/", "Chrome"}, {"Safari/", "Safari"}} {
		if strings.Contains(agent, entry.match) {
			browser = entry.name
			break
		}
	}
	return fmt.Sprintf("%s · %s", platform, browser)
}
