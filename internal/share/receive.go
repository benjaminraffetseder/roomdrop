package share

import (
	"crypto/rand"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"html/template"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

const maxUploadBytes int64 = 10 * 1024 * 1024 * 1024

//go:embed uploader.html
var uploaderHTML string

//go:embed uploader.js
var uploaderScript string

var uploader = template.Must(template.New("uploader").Parse(uploaderHTML))

// inbox is only reachable through a receive session. The root restricts all
// writes to the explicitly chosen folder, including when links are present.
type inbox struct {
	root        *os.Root
	destination string
	items       []Item
	size        int64
	uploads     int
}

func openInbox(destination string) (*inbox, error) {
	absolute, err := filepath.Abs(destination)
	if err != nil {
		return nil, errors.New("Could not read the destination folder.")
	}
	root, err := os.OpenRoot(absolute)
	if err != nil {
		return nil, errors.New("Could not open the destination folder. Choose an existing folder you can write to.")
	}
	probeName := ".roomdrop-write-test-" + rand.Text()
	probe, err := root.OpenFile(probeName, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		_ = root.Close()
		return nil, errors.New("Cannot write to this folder. Choose a writable destination.")
	}
	closeErr := probe.Close()
	removeErr := root.Remove(probeName)
	if closeErr != nil || removeErr != nil {
		_ = root.Close()
		return nil, errors.New("Could not prepare the destination folder. Choose another folder.")
	}
	return &inbox{root: root, destination: absolute, items: []Item{}}, nil
}

func validUploadName(name string) bool {
	if !utf8.ValidString(name) || len(name) == 0 || len(name) > 180 || name == "." || name == ".." ||
		strings.TrimSpace(name) != name || strings.HasSuffix(name, ".") || strings.ContainsAny(name, `/\:<>"|?*`) ||
		strings.ContainsFunc(name, unicode.IsControl) {
		return false
	}
	// Apply Windows filename rules on every platform so a transfer cannot
	// create a device, alternate stream, or a non-portable path.
	base := strings.ToUpper(strings.TrimRight(strings.SplitN(name, ".", 2)[0], " "))
	if base == "CON" || base == "PRN" || base == "AUX" || base == "NUL" || base == "CONIN$" || base == "CONOUT$" {
		return false
	}
	if len(base) == 4 && (strings.HasPrefix(base, "COM") || strings.HasPrefix(base, "LPT")) && base[3] >= '0' && base[3] <= '9' {
		return false
	}
	return true
}

func (in *inbox) create(name string) (*os.File, string, error) {
	ext := filepath.Ext(name)
	stem := strings.TrimSuffix(name, ext)
	for n := 1; n <= 10000; n++ {
		candidate := name
		if n > 1 {
			candidate = fmt.Sprintf("%s (%d)%s", stem, n, ext)
		}
		// Exclusive creation preserves existing files and symlinks, including
		// when concurrent uploads have the same name. Failed files are removed.
		file, err := in.root.OpenFile(candidate, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
		if errors.Is(err, os.ErrExist) {
			continue
		}
		return file, candidate, err
	}
	return nil, "", errors.New("too many files with this name")
}

func (s *session) renderUploader(w http.ResponseWriter, path string) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_ = uploader.Execute(w, struct{ Path, Expires string }{path, s.expiresAt.Format("15:04 MST")})
}

func (s *session) upload(w http.ResponseWriter, r *http.Request, ip string) {
	name, err := url.PathUnescape(r.Header.Get("X-RoomDrop-Filename"))
	if err != nil || !validUploadName(name) {
		http.Error(w, "This filename is not supported. Rename the file and try again.", http.StatusBadRequest)
		return
	}
	if r.Header.Get("Content-Type") != "application/octet-stream" {
		http.Error(w, "Choose files from the RoomDrop page to upload.", http.StatusUnsupportedMediaType)
		return
	}
	if r.ContentLength < 0 {
		http.Error(w, "The file size is required. Choose the file again.", http.StatusLengthRequired)
		return
	}
	if r.ContentLength > maxUploadBytes {
		http.Error(w, "Each file must be 10 GiB or smaller.", http.StatusRequestEntityTooLarge)
		return
	}
	s.mu.Lock()
	if s.state != "sharing" || !time.Now().Before(s.expiresAt) {
		s.mu.Unlock()
		http.Error(w, "This session has ended. Ask for a new link.", http.StatusGone)
		return
	}
	if s.inFlight >= 4 {
		s.mu.Unlock()
		http.Error(w, "Other transfers are in progress. Try again shortly.", http.StatusConflict)
		return
	}
	file, savedName, err := s.inbox.create(name)
	if err != nil {
		s.mu.Unlock()
		http.Error(w, "Could not save the file. Check the destination folder and available disk space on the computer.", http.StatusInternalServerError)
		return
	}
	s.inFlight++
	s.nextID++
	t := &Transfer{ID: s.nextID, Name: savedName, Device: deviceName(r.UserAgent()), Address: ip, Total: r.ContentLength, State: "receiving"}
	if len(s.transfers) >= 50 {
		for i, old := range s.transfers {
			if old.State != "receiving" {
				s.transfers = append(s.transfers[:i], s.transfers[i+1:]...)
				break
			}
		}
	}
	s.transfers = append(s.transfers, t)
	s.mu.Unlock()
	defer s.closeResources()
	committed := false
	defer func() {
		_ = file.Close()
		if !committed {
			_ = s.inbox.root.Remove(savedName)
		}
		s.mu.Lock()
		s.inFlight--
		if !committed {
			t.State = "interrupted"
		}
		s.mu.Unlock()
	}()
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadBytes)
	reader := &uploadReader{request: r, response: w, session: s, transfer: t}
	n, err := io.CopyBuffer(file, reader, make([]byte, 64*1024))
	if err == nil && n != r.ContentLength {
		err = io.ErrUnexpectedEOF
	}
	if err == nil {
		err = file.Sync()
	}
	closeErr := file.Close()
	if err == nil {
		err = closeErr
	}
	s.mu.Lock()
	active := s.state == "sharing" && time.Now().Before(s.expiresAt) && r.Context().Err() == nil
	if err == nil && active {
		committed = true
		t.State = "complete"
		s.inbox.uploads++
		s.inbox.size += n
		if len(s.inbox.items) >= 50 {
			s.inbox.items = s.inbox.items[1:]
		}
		s.inbox.items = append(s.inbox.items, Item{Path: filepath.Join(s.inbox.destination, savedName), Name: savedName, Size: n})
	}
	s.mu.Unlock()
	if !committed {
		if !active {
			http.Error(w, "The session ended before this file was saved. Ask for a new link and retry this file.", http.StatusGone)
		} else {
			http.Error(w, "The file could not be saved completely. Check disk space on the computer and retry this file.", http.StatusInternalServerError)
		}
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(struct {
		Name string `json:"name"`
		Size int64  `json:"size"`
	}{savedName, n})
}

type uploadReader struct {
	request  *http.Request
	response http.ResponseWriter
	session  *session
	transfer *Transfer
}

func (r *uploadReader) Read(data []byte) (int, error) {
	if err := r.request.Context().Err(); err != nil {
		return 0, err
	}
	_ = http.NewResponseController(r.response).SetReadDeadline(time.Now().Add(30 * time.Second))
	n, err := r.request.Body.Read(data)
	r.session.mu.Lock()
	r.transfer.Bytes += int64(n)
	r.session.mu.Unlock()
	return n, err
}
