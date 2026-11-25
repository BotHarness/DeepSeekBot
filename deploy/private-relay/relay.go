package main

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
)

const (
	protocolV1      = "botharness-private-v1"
	protocolV2      = "botharness-private-v2"
	browserProtocol = "botharness-private-channel-v1"
	channelPath     = "/botharness-device/channel"
	maxHosts        = 16
	maxPhones       = 32
	maxFrame        = 70_000
)

type relay struct {
	directory     string
	bootstrapHash string
	keysPath      string
	claimMu       sync.Mutex
	mu            sync.Mutex
	slots         map[string]ownerState
	live          map[string]*liveHost
	closed        bool
}

type liveHost struct {
	ready         chan struct{}
	control       *relaySocket
	phones        map[string]*relaySocket
	pendingPhones int
}

func (h *liveHost) connected() bool {
	return h != nil && h.control != nil && h.control.open()
}

func newRelay(directory, bootstrap, keysPath string) (*relay, error) {
	if !secretPattern.MatchString(bootstrap) {
		return nil, errors.New("bootstrap-secret-invalid")
	}
	slots, err := loadSlots(directory)
	if err != nil {
		return nil, err
	}
	return &relay{
		directory: directory, bootstrapHash: digest(bootstrap), keysPath: keysPath,
		slots: slots, live: make(map[string]*liveHost),
	}, nil
}

func (r *relay) find(hash string, phone bool) string {
	for name, slot := range r.slots {
		candidate := slot.Owner
		if phone {
			candidate = slot.Phone
		}
		if sameHash(hash, candidate) {
			return name
		}
	}
	return ""
}

func (r *relay) nameFor(token string, phone bool) string {
	if !secretPattern.MatchString(token) {
		return ""
	}
	return r.find(digest(token), phone)
}

func bearer(req *http.Request) string {
	return strings.TrimPrefix(req.Header.Get("Authorization"), "Bearer ")
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	data, err := json.Marshal(value)
	if err != nil {
		panic(http.ErrAbortHandler)
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(status)
	_, _ = w.Write(data)
}

func refusal(w http.ResponseWriter, status int, code string) {
	writeJSON(w, status, struct {
		Code string `json:"code"`
	}{code})
}

func (r *relay) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	if strings.EqualFold(req.Header.Get("Upgrade"), "websocket") {
		r.upgrade(w, req)
		return
	}
	switch {
	case req.Method == http.MethodGet && req.RequestURI == "/health":
		writeJSON(w, 200, struct {
			Protocol  string   `json:"protocol"`
			Protocols []string `json:"protocols"`
		}{protocolV1, []string{protocolV1, protocolV2}})
	case req.Method == http.MethodGet && req.RequestURI == "/status":
		r.status(w, req)
	case req.Method == http.MethodDelete && req.RequestURI == "/claim":
		r.release(w, req)
	case req.Method == http.MethodPost && req.RequestURI == "/claim":
		r.claim(w, req)
	case req.Method == http.MethodGet && req.RequestURI == channelPath:
		w.Header().Set("Access-Control-Allow-Origin", "*")
		refusal(w, 404, "private-route")
	default:
		refusal(w, 404, "not-found")
	}
}

func (r *relay) status(w http.ResponseWriter, req *http.Request) {
	r.mu.Lock()
	name := r.nameFor(bearer(req), false)
	host := r.live[name]
	connected := host.connected()
	r.mu.Unlock()
	if name == "" {
		refusal(w, 404, "not-found")
		return
	}
	writeJSON(w, 200, struct {
		Connected bool   `json:"connected"`
		Host      string `json:"host"`
	}{connected, name})
}

func (r *relay) release(w http.ResponseWriter, req *http.Request) {
	status, code := r.releaseSlot(bearer(req))
	if status != http.StatusOK {
		refusal(w, status, code)
		return
	}
	writeJSON(w, 200, map[string]bool{"released": true})
}

func (r *relay) releaseSlot(token string) (int, string) {
	r.claimMu.Lock()
	defer r.claimMu.Unlock()
	r.mu.Lock()
	name := r.nameFor(token, false)
	r.mu.Unlock()
	if name == "" {
		return 403, "release-refused"
	}
	err := saveSlot(slotPath(r.directory, name), ownerState{Released: true}, false)
	if err == nil || wasPublished(err) {
		r.mu.Lock()
		delete(r.slots, name)
		r.dropHost(name)
		r.mu.Unlock()
	}
	if err != nil {
		log.Printf("persist relay release: %v", err)
		return 500, "release-storage-failed"
	}
	return 200, ""
}

func (r *relay) claim(w http.ResponseWriter, req *http.Request) {
	keyHash := digest(bearer(req))
	name := ""
	if sameHash(keyHash, r.bootstrapHash) {
		name = defaultHost
	} else {
		keys, err := readHostKeys(r.keysPath)
		if err != nil {
			refusal(w, 503, "host-keys-invalid")
			return
		}
		for candidate, hash := range keys {
			if sameHash(keyHash, hash) {
				name = candidate
			}
		}
	}
	if name == "" {
		refusal(w, 403, "claim-refused")
		return
	}
	path := slotPath(r.directory, name)
	if _, err := os.Stat(path); err == nil {
		refusal(w, 409, "already-claimed")
		return
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, req.Body, 1024))
	if err != nil {
		if limit := new(http.MaxBytesError); errors.As(err, &limit) {
			refusal(w, 413, "body-too-large")
		} else {
			refusal(w, 400, "claim-invalid")
		}
		return
	}
	var input map[string]json.RawMessage
	if !json.Valid(body) || strings.TrimSpace(string(body)) == "null" {
		refusal(w, 400, "claim-invalid")
		return
	}
	_ = json.Unmarshal(body, &input)
	var owner, phone string
	ownerErr := json.Unmarshal(input["ownerToken"], &owner)
	phoneErr := json.Unmarshal(input["phoneToken"], &phone)
	if ownerErr != nil || phoneErr != nil ||
		!secretPattern.MatchString(owner) || !secretPattern.MatchString(phone) || owner == phone {
		refusal(w, 400, "claim-invalid")
		return
	}
	next := ownerState{Owner: digest(owner), Phone: digest(phone)}
	status, code := r.claimSlot(name, next)
	if status != http.StatusOK {
		refusal(w, status, code)
		return
	}
	writeJSON(w, 200, struct {
		Claimed bool   `json:"claimed"`
		Host    string `json:"host"`
	}{true, name})
}

func (r *relay) claimSlot(name string, next ownerState) (int, string) {
	r.claimMu.Lock()
	defer r.claimMu.Unlock()
	path := slotPath(r.directory, name)
	if _, err := os.Stat(path); err == nil {
		return 409, "already-claimed"
	}
	r.mu.Lock()
	duplicate := r.find(next.Owner, false) != "" || r.find(next.Owner, true) != "" ||
		r.find(next.Phone, false) != "" || r.find(next.Phone, true) != ""
	full := len(r.slots) >= maxHosts
	r.mu.Unlock()
	if duplicate {
		return 400, "claim-invalid"
	}
	if full {
		return 409, "host-limit"
	}
	err := saveSlot(path, next, true)
	if err == nil || wasPublished(err) {
		r.mu.Lock()
		r.slots[name] = next
		r.mu.Unlock()
	}
	if errors.Is(err, os.ErrExist) {
		return 409, "already-claimed"
	}
	if err != nil {
		log.Printf("persist relay claim: %v", err)
		return 500, "claim-storage-failed"
	}
	return 200, ""
}

func (r *relay) dropHost(name string) {
	host := r.live[name]
	if host == nil {
		return
	}
	delete(r.live, name)
	host.stop()
}

func (h *liveHost) stop() {
	if h.control != nil {
		h.control.stop()
	}
	for _, phone := range h.phones {
		phone.stop()
	}
	clear(h.phones)
}

func (r *relay) close() {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.closed = true
	for name := range r.live {
		r.dropHost(name)
	}
}
