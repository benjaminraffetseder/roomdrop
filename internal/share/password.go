package share

import (
	"crypto/sha256"
	"crypto/subtle"
	"net/http"
	"strconv"
	"time"
)

const maxPasswordBytes = 1024

func (s *session) setPassword(password string) {
	if password != "" {
		digest := sha256.Sum256([]byte(password))
		s.passwordDigest = &digest
	}
}

func (s *session) authorizeDownload(w http.ResponseWriter, r *http.Request, path string) bool {
	if s.passwordDigest == nil {
		return true
	}
	// Only accept credentials in a bounded POST body, never in the sharing URL.
	r.Body = http.MaxBytesReader(w, r.Body, 16*1024)
	if err := r.ParseForm(); err != nil {
		s.render(w, path, http.StatusBadRequest, "Could not read the password. Please try again.")
		return false
	}
	password := r.PostForm.Get("password")
	digest := sha256.Sum256([]byte(password))
	s.mu.Lock()
	if remaining := time.Until(s.passwordRetryAt); remaining > 0 {
		s.mu.Unlock()
		w.Header().Set("Retry-After", strconv.Itoa(int(remaining.Seconds())+1))
		s.render(w, path, http.StatusTooManyRequests, "Too many incorrect attempts. Wait 30 seconds and try again.")
		return false
	}
	valid := len(password) <= maxPasswordBytes && subtle.ConstantTimeCompare(digest[:], s.passwordDigest[:]) == 1
	if valid {
		s.passwordFailures = 0
	} else {
		s.passwordFailures++
		if s.passwordFailures >= 5 {
			s.passwordFailures = 0
			s.passwordRetryAt = time.Now().Add(30 * time.Second)
		}
	}
	s.mu.Unlock()
	if !valid {
		s.render(w, path, http.StatusForbidden, "Incorrect password. Ask the sender for the password and try again.")
	}
	return valid
}
