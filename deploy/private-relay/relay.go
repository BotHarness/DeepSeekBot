package main

import (
	"encoding/json"
	"errors"
	"io"
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
	mu            sync.Mutex
	slots         map[string]ownerState
	live          map[string]*liveHost
	closed        bool
}

type liveHost struct {
	control *relaySocket
	phones  map[string]*relaySocket
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
	connected := host != nil && host.control.open()
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
	r.mu.Lock()
	defer r.mu.Unlock()
	name := r.nameFor(bearer(req), false)
	if name == "" {
		refusal(w, 403, "release-refused")
		return
	}
	if err := saveSlot(slotPath(r.directory, name), ownerState{Released: true}, false); err != nil {
		panic(http.ErrAbortHandler)
	}
	delete(r.slots, name)
	r.dropHost(name)
	writeJSON(w, 200, map[string]bool{"released": true})
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
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, err := os.Stat(path); err == nil {
		refusal(w, 409, "already-claimed")
		return
	}
	if ownerErr != nil || phoneErr != nil ||
		!secretPattern.MatchString(owner) || !secretPattern.MatchString(phone) || owner == phone {
		refusal(w, 400, "claim-invalid")
		return
	}
	next := ownerState{Owner: digest(owner), Phone: digest(phone)}
	if r.find(next.Owner, false) != "" || r.find(next.Owner, true) != "" ||
		r.find(next.Phone, false) != "" || r.find(next.Phone, true) != "" {
		refusal(w, 400, "claim-invalid")
		return
	}
	if len(r.slots) >= maxHosts {
		refusal(w, 409, "host-limit")
		return
	}
	if err := saveSlot(path, next, true); err != nil {
		if errors.Is(err, os.ErrExist) {
			refusal(w, 409, "already-claimed")
		} else {
			refusal(w, 400, "claim-invalid")
		}
		return
	}
	r.slots[name] = next
	writeJSON(w, 200, struct {
		Claimed bool   `json:"claimed"`
		Host    string `json:"host"`
	}{true, name})
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
	h.control.stop()
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
