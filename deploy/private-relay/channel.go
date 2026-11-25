package main

import (
	"encoding/json"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"sync/atomic"
	"time"
	"unicode/utf8"

	"github.com/gorilla/websocket"
)

const (
	pingInterval = 25 * time.Second
	writeTimeout = 10 * time.Second
	maxQueue     = 2 * 1024 * 1024
)

var upgrader = websocket.Upgrader{
	CheckOrigin:      func(*http.Request) bool { return true },
	Subprotocols:     []string{browserProtocol},
	HandshakeTimeout: writeTimeout,
}

var channelID = regexp.MustCompile(`^[a-f0-9]{32}$`)

func phoneAdmission(header http.Header) (string, bool) {
	if len(header.Values("Cookie")) > 0 {
		return "", false
	}
	var tokens []string
	if values := header.Values("Authorization"); len(values) > 0 {
		token, ok := strings.CutPrefix(values[0], "Bearer ")
		if !ok {
			return "", false
		}
		tokens = append(tokens, token)
	}
	if values := header.Values("X-BotHarness-Admission"); len(values) > 0 {
		tokens = append(tokens, strings.Join(values, ", "))
	}
	protocols := header.Values("Sec-WebSocket-Protocol")
	if len(protocols) > 0 {
		public, credential, ok := strings.Cut(strings.Join(protocols, ","), ",")
		token, prefix := strings.CutPrefix(strings.TrimSpace(credential), "botharness-admission.")
		if !ok || !prefix || strings.TrimSpace(public) != browserProtocol {
			return "", false
		}
		tokens = append(tokens, token)
	}
	if len(tokens) == 0 {
		return "", false
	}
	token := tokens[0]
	for _, candidate := range tokens {
		if candidate != token || !secretPattern.MatchString(candidate) {
			return "", false
		}
	}
	return token, len(protocols) > 0
}

func refuseUpgrade(w http.ResponseWriter) {
	w.Header().Set("Connection", "close")
	w.Header().Set("Content-Length", "0")
	w.WriteHeader(http.StatusForbidden)
}

func (r *relay) upgrade(w http.ResponseWriter, req *http.Request) {
	hosting := req.RequestURI == "/host"
	var token string
	browser := false
	switch {
	case hosting && len(req.Header.Values("Sec-WebSocket-Protocol")) == 0:
		token = bearer(req)
	case req.RequestURI == channelPath:
		token, browser = phoneAdmission(req.Header)
	default:
		refuseUpgrade(w)
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	name := r.nameFor(token, !hosting)
	host := r.live[name]
	if r.closed || name == "" ||
		(hosting && host != nil) ||
		(!hosting && (host == nil || !host.control.open() || len(host.phones) >= maxPhones)) {
		refuseUpgrade(w)
		return
	}
	req.Header.Del("Authorization")
	req.Header.Del("X-BotHarness-Admission")
	if browser {
		req.Header.Set("Sec-WebSocket-Protocol", browserProtocol)
	}
	conn, err := upgrader.Upgrade(w, req, nil)
	if err != nil {
		return
	}
	socket := newSocket(conn)
	if hosting {
		host = &liveHost{control: socket, phones: make(map[string]*relaySocket)}
		r.live[name] = host
		go r.readHost(name, host)
		return
	}
	id := randomHex(16)
	host.phones[id] = socket
	host.control.send(message("open", id))
	go r.readPhone(host, id, socket)
}

func message(kind, id string) []byte {
	data, _ := json.Marshal(struct {
		Type string `json:"type"`
		ID   string `json:"id"`
	}{kind, id})
	return data
}

func readText(conn *websocket.Conn, limit int) ([]byte, bool) {
	kind, data, err := conn.ReadMessage()
	return data, err == nil && kind == websocket.TextMessage && len(data) <= limit && utf8.Valid(data)
}

func (r *relay) readHost(name string, host *liveHost) {
	defer func() {
		r.mu.Lock()
		defer r.mu.Unlock()
		if r.live[name] == host {
			r.dropHost(name)
		}
	}()
	for {
		data, ok := readText(host.control.conn, 2*maxFrame)
		if !ok || !r.handleControl(host, data) {
			return
		}
	}
}

func (r *relay) handleControl(host *liveHost, data []byte) bool {
	var input map[string]json.RawMessage
	if json.Unmarshal(data, &input) != nil {
		return false
	}
	var id, kind string
	if json.Unmarshal(input["id"], &id) != nil || !channelID.MatchString(id) ||
		json.Unmarshal(input["type"], &kind) != nil {
		return false
	}
	var text *string
	if kind != "close" &&
		(kind != "data" || json.Unmarshal(input["data"], &text) != nil || text == nil || len(*text) > maxFrame) {
		return false
	}
	r.mu.Lock()
	phone := host.phones[id]
	r.mu.Unlock()
	if phone == nil {
		return true
	}
	if kind == "close" {
		phone.stop()
	} else {
		phone.send([]byte(*text))
	}
	return true
}

func (r *relay) readPhone(host *liveHost, id string, phone *relaySocket) {
	defer func() {
		r.mu.Lock()
		defer r.mu.Unlock()
		phone.stop()
		delete(host.phones, id)
		host.control.send(message("close", id))
	}()
	for {
		data, ok := readText(phone.conn, maxFrame)
		if !ok {
			return
		}
		envelope, _ := json.Marshal(struct {
			Type string `json:"type"`
			ID   string `json:"id"`
			Data string `json:"data"`
		}{"data", id, string(data)})
		if !host.control.send(envelope) {
			return
		}
	}
}

type relaySocket struct {
	conn        *websocket.Conn
	done        chan struct{}
	wake        chan struct{}
	mu          sync.Mutex
	pending     [][]byte
	queuedBytes int
	alive       atomic.Bool
}

func newSocket(conn *websocket.Conn) *relaySocket {
	socket := &relaySocket{conn: conn, done: make(chan struct{}), wake: make(chan struct{}, 1)}
	socket.alive.Store(true)
	conn.SetReadLimit(2 * maxFrame)
	conn.SetPongHandler(func(string) error {
		socket.alive.Store(true)
		return nil
	})
	go socket.write()
	return socket
}

func (s *relaySocket) open() bool {
	select {
	case <-s.done:
		return false
	default:
		return true
	}
}

func (s *relaySocket) stop() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.closeLocked()
}

func (s *relaySocket) closeLocked() {
	if s.open() {
		close(s.done)
		s.pending = nil
		_ = s.conn.Close()
	}
}

func (s *relaySocket) notifyWriter() {
	select {
	case s.wake <- struct{}{}:
	default:
	}
}

// Account for empty messages and keep the in-flight frame in the queue budget.
func frameCost(data []byte) int { return len(data) + 10 }

func (s *relaySocket) send(data []byte) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.open() {
		return false
	}
	if s.queuedBytes+frameCost(data) > maxQueue {
		s.closeLocked()
		return false
	}
	s.queuedBytes += frameCost(data)
	s.pending = append(s.pending, data)
	s.notifyWriter()
	return true
}

func (s *relaySocket) write() {
	defer s.stop()
	ticker := time.NewTicker(pingInterval)
	defer ticker.Stop()
	for {
		select {
		case <-s.done:
			return
		case <-ticker.C:
			if !s.alive.Swap(false) ||
				s.conn.WriteControl(websocket.PingMessage, nil, time.Now().Add(writeTimeout)) != nil {
				return
			}
		case <-s.wake:
			if !s.writeNext() {
				return
			}
		}
	}
}

func (s *relaySocket) writeNext() bool {
	s.mu.Lock()
	if len(s.pending) == 0 {
		s.mu.Unlock()
		return s.open()
	}
	data := s.pending[0]
	s.pending[0] = nil
	s.pending = s.pending[1:]
	if len(s.pending) > 0 {
		s.notifyWriter()
	}
	s.mu.Unlock()
	_ = s.conn.SetWriteDeadline(time.Now().Add(writeTimeout))
	if s.conn.WriteMessage(websocket.TextMessage, data) != nil {
		return false
	}
	s.mu.Lock()
	s.queuedBytes -= frameCost(data)
	s.mu.Unlock()
	return true
}
