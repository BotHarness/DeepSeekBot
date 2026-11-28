package main

import (
	"errors"
	"net"
	"net/netip"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

var (
	sharedConnectHost = regexp.MustCompile(`^h[a-z2-7]{12}\.(botharness\.dev|kite-u\.com|tobs\.app|deepseekbot\.app|botharness\.ai)$`)
	carrierGradeNAT   = netip.MustParsePrefix("100.64.0.0/10")
)

func relayIdentity(value string) (string, error) {
	value = strings.ToLower(strings.TrimSuffix(value, "."))
	if value == "localhost" || strings.HasPrefix(value, "127.") ||
		strings.HasSuffix(value, ".ts.net") ||
		value == "deepseekbot.dev" || strings.HasSuffix(value, ".deepseekbot.dev") ||
		sharedConnectHost.MatchString(value) {
		return "", errors.New("the Host refuses loopback, Tailscale, and built-in Connect addresses; use a public relay DNS name or IP address")
	}
	if ip, err := netip.ParseAddr(value); err == nil {
		ip = ip.Unmap()
		if carrierGradeNAT.Contains(ip) {
			return "", errors.New("the Host refuses carrier-grade NAT addresses (100.64.0.0/10); use a public relay IP address")
		}
		if ip.IsGlobalUnicast() && !ip.IsPrivate() && ip.Zone() == "" {
			return ip.String(), nil
		}
		return "", errors.New("use a public IP address")
	}
	labels := strings.Split(value, ".")
	if len(value) > 253 || len(labels) < 2 {
		return "", errors.New("use a public DNS name or IP address")
	}
	for _, label := range labels {
		if len(label) == 0 || len(label) > 63 || label[0] == '-' || label[len(label)-1] == '-' {
			return "", errors.New("invalid DNS name")
		}
		for _, c := range label {
			if !(c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || c == '-') {
				return "", errors.New("invalid DNS name")
			}
		}
	}
	last := labels[len(labels)-1]
	if last[0] < 'a' || last[0] > 'z' {
		return "", errors.New("invalid DNS name")
	}
	return value, nil
}

func httpsOrigin(identity string) string {
	if strings.Contains(identity, ":") {
		identity = "[" + identity + "]"
	}
	return "https://" + identity
}

func setup(directory, address string, ttl time.Duration) (string, error) {
	identity, err := relayIdentity(address)
	if err != nil {
		return "", err
	}
	envPath := filepath.Join(directory, ".env")
	if _, err := os.Stat(envPath); !errors.Is(err, os.ErrNotExist) {
		return "", errors.New("setup files already exist or are inaccessible")
	}
	if _, err := os.Stat(filepath.Join(directory, "bootstrap.secret")); !errors.Is(err, os.ErrNotExist) {
		return "", errors.New("legacy setup key exists or is inaccessible")
	}
	keysPath := hostKeysPath(directory)
	code, err := mintConnectCode(keysPath, identity, defaultHost, ttl, false)
	if err != nil {
		return "", err
	}
	if err := writeAtomic(envPath, []byte("RELAY_DOMAIN="+identity+"\n"), 0600, true); err != nil {
		if wasPublished(err) {
			return "", err
		}
		return "", errors.Join(err, os.Remove(connectCodePath(filepath.Dir(keysPath), defaultHost)))
	}
	return code, nil
}

func addHost(directory, data, name string, ttl time.Duration, reissue bool) (string, error) {
	if !hostPattern.MatchString(name) || (name == defaultHost && !reissue) {
		return "", errors.New("use a Host name of 1–32 lowercase letters, digits and dashes, beginning with a letter or digit; use default only with --reissue")
	}
	identity, err := readIdentity(directory)
	if err != nil {
		return "", err
	}
	if _, err := os.Stat(slotPath(data, name)); err == nil {
		return "", errors.New("Host has already claimed the relay; use a new Host name")
	} else if !errors.Is(err, os.ErrNotExist) {
		return "", err
	}
	return mintConnectCode(hostKeysPath(directory), identity, name, ttl, reissue)
}

func hostKeysPath(directory string) string {
	return envOr("RELAY_HOST_KEYS_FILE", filepath.Join(directory, "hosts", "keys"))
}

func readIdentity(directory string) (string, error) {
	value := os.Getenv("RELAY_DOMAIN")
	if value == "" {
		data, err := os.ReadFile(filepath.Join(directory, ".env"))
		if err != nil && !errors.Is(err, os.ErrNotExist) {
			return "", err
		}
		for _, line := range strings.Split(string(data), "\n") {
			if address, ok := strings.CutPrefix(strings.TrimSpace(line), "RELAY_DOMAIN="); ok {
				value = address
				break
			}
		}
	}
	return relayIdentity(value)
}

func readBootstrap(directory string) (string, error) {
	if value, exists := os.LookupEnv("RELAY_BOOTSTRAP"); exists {
		os.Unsetenv("RELAY_BOOTSTRAP")
		return value, nil
	}
	file := envOr("RELAY_BOOTSTRAP_FILE", filepath.Join(directory, "bootstrap.secret"))
	content, err := os.ReadFile(file)
	return strings.TrimSpace(string(content)), err
}

func probeAddress(listen string) (string, error) {
	host, port, err := net.SplitHostPort(listen)
	if err != nil {
		return "", err
	}
	switch host {
	case "", "0.0.0.0":
		host = "127.0.0.1"
	case "::":
		host = "::1"
	}
	return net.JoinHostPort(host, port), nil
}
