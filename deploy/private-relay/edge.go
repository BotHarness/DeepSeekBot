package main

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httputil"
	"net/netip"
	"net/url"
	"os"
	"regexp"
	"strings"
	"syscall"
	"time"
)

var edgeProbePath = regexp.MustCompile(`^/\.well-known/botharness-tunnel/[0-9a-f]{32}$`)

type edgeEvent struct {
	Phase  string `json:"phase"`
	Origin string `json:"origin,omitempty"`
	Issue  string `json:"issue,omitempty"`
}

func runEdge(ctx context.Context, flags *flag.FlagSet, args []string) error {
	port := flags.Int("upstream-port", 0, "Host's dedicated loopback ingress port")
	host := flags.String("hostname", "", "optional public DNS name or IP")
	data := flags.String("data", "", "private certificate state directory")
	if err := flags.Parse(args); err != nil {
		return err
	}
	if *port < 1 || *port > 65535 || *data == "" || flags.NArg() != 0 {
		return errors.New("usage: tobs-relay edge --upstream-port PORT --data DIR [--hostname NAME]")
	}
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	// The Host owns the write end throughout the child's lifetime.
	go func() {
		_, _ = io.Copy(io.Discard, os.Stdin)
		cancel()
	}()
	output := json.NewEncoder(os.Stdout)
	emit := func(event edgeEvent) { _ = output.Encode(event) }
	listener, err := net.Listen("tcp", ":443")
	if err != nil {
		emit(edgeEvent{Phase: "failed", Issue: edgeBindIssue(err)})
		return err
	}
	defer listener.Close()
	identity, err := edgeIdentity(ctx, *host)
	if err != nil {
		emit(edgeEvent{Phase: "failed", Issue: "direct-public-address-missing"})
		return err
	}
	manager, err := newCertificateManager(*data, identity, "tls-alpn-01", "")
	if err != nil {
		emit(edgeEvent{Phase: "failed", Issue: "direct-acme-failed"})
		return err
	}
	origin := httpsOrigin(identity)
	emit(edgeEvent{Phase: "bound", Origin: origin})

	server := httpServer(edgeHandler(*port))
	defer server.Close()
	failures := make(chan error, 1)
	go func() {
		failures <- server.Serve(tls.NewListener(newPendingListener(listener), manager.tlsConfig()))
	}()
	// Keep event writes on one goroutine, and use the same ACME state and renewal window as the relay.
	go maintainEdgeCertificate(ctx, manager, emit)
	select {
	case <-ctx.Done():
		return nil
	case err := <-failures:
		return err
	}
}

func edgeBindIssue(err error) string {
	switch {
	case errors.Is(err, syscall.EADDRINUSE):
		return "direct-port-busy"
	case errors.Is(err, syscall.EACCES), errors.Is(err, syscall.EPERM):
		return "direct-port-permission"
	default:
		return "direct-bind-failed"
	}
}

func publicEdgeIP(ip netip.Addr) bool {
	_, err := relayIdentity(ip.String())
	return ip.IsValid() && err == nil
}

func edgeIdentity(ctx context.Context, explicit string) (string, error) {
	if explicit != "" {
		return relayIdentity(explicit)
	}
	addresses, _ := net.InterfaceAddrs()
	var ipv6 string
	for _, address := range addresses {
		prefix, err := netip.ParsePrefix(address.String())
		if err != nil {
			continue
		}
		ip := prefix.Addr().Unmap()
		if publicEdgeIP(ip) {
			if ip.Is4() {
				return ip.String(), nil
			}
			ipv6 = ip.String()
		}
	}
	if ipv6 != "" {
		return ipv6, nil
	}
	// NAT-backed VPSs and bridge containers cannot see the public IP on an interface.
	// Accept only a literal IP and require ACME to validate it on this listener.
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://checkip.amazonaws.com/", nil)
	if err != nil {
		return "", err
	}
	client := &http.Client{Timeout: 5 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error {
		return http.ErrUseLastResponse
	}}
	resp, err := client.Do(req)
	if err == nil {
		defer resp.Body.Close()
		body, readErr := io.ReadAll(io.LimitReader(resp.Body, 64))
		ip, parseErr := netip.ParseAddr(strings.TrimSpace(string(body)))
		if resp.StatusCode == http.StatusOK && readErr == nil && parseErr == nil && publicEdgeIP(ip) {
			return ip.Unmap().String(), nil
		}
	}
	return "", errors.New("no public address found")
}

func edgeHandler(port int) http.Handler {
	upstream := &url.URL{Scheme: "http", Host: fmt.Sprintf("127.0.0.1:%d", port)}
	proxy := &httputil.ReverseProxy{
		Transport: &http.Transport{
			DialContext:           (&net.Dialer{Timeout: requestTimeout}).DialContext,
			ResponseHeaderTimeout: requestTimeout,
			DisableKeepAlives:     true,
		},
		Rewrite: func(req *httputil.ProxyRequest) {
			req.SetURL(upstream)
			req.Out.Header.Del("Cookie")
		},
	}
	return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		channel := req.RequestURI == channelPath && strings.EqualFold(req.Header.Get("Upgrade"), "websocket")
		probe := edgeProbePath.MatchString(req.RequestURI) && req.Header.Get("Upgrade") == ""
		if req.Method != http.MethodGet || req.ContentLength != 0 || (!channel && !probe) {
			http.NotFound(w, req)
			return
		}
		proxy.ServeHTTP(w, req)
	})
}

func maintainEdgeCertificate(ctx context.Context, manager *certificateManager, emit func(edgeEvent)) {
	retry := time.Minute
	ready := false
	for ctx.Err() == nil {
		cert := manager.current.Load()
		now := time.Now()
		usable := cert != nil && !now.Before(cert.Leaf.NotBefore) && now.Before(cert.Leaf.NotAfter)
		if usable && !ready {
			emit(edgeEvent{Phase: "certificate-ready"})
			ready = true
		}
		wait := time.Hour
		if needsRenewal(cert, now) {
			if err := manager.obtain(); err != nil {
				issue := "direct-acme-failed"
				if strings.Contains(err.Error(), "urn:ietf:params:acme:error:connection") {
					issue = "direct-inbound-closed"
				}
				phase := "certificate-failed"
				if usable && time.Now().Before(cert.Leaf.NotAfter) {
					phase = "certificate-renewal-failed"
				} else {
					ready = false
				}
				emit(edgeEvent{Phase: phase, Issue: issue})
				wait = retry
				retry = min(2*retry, time.Hour)
			} else {
				emit(edgeEvent{Phase: "certificate-ready"})
				ready = true
				retry = time.Minute
			}
		}
		timer := time.NewTimer(wait)
		select {
		case <-ctx.Done():
			timer.Stop()
		case <-timer.C:
		}
	}
}
