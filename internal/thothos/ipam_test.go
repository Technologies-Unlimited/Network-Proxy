package thothos

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// pageRequest decodes the paging variables (limit/skip) a getAll walker sends.
type pageRequest struct {
	Variables struct {
		Limit int `json:"limit"`
		Skip  int `json:"skip"`
	} `json:"variables"`
}

// TestGetIPAddresses_PagingLoop proves the IPAM getAll walker pages through the
// offset-paginated op — sending {limit, skip} and advancing skip by the page
// size — until a SHORT page (fewer rows than the page size) signals end-of-data.
// The scenario is 3 full pages then a short page (the audit's silent-1000-row
// truncation is exactly this loop being absent).
func TestGetIPAddresses_PagingLoop(t *testing.T) {
	// Shrink the page size so the multi-page walk is exercised without seeding
	// 1000+ rows. Restore after the test (package-var convention).
	orig := ipamPageSize
	ipamPageSize = 2
	defer func() { ipamPageSize = orig }()

	const total = 7 // 2 + 2 + 2 + 1 -> 3 full pages then a short page
	var seen []pageRequest

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		var req pageRequest
		if err := json.Unmarshal(body, &req); err != nil {
			t.Errorf("decode request: %v", err)
		}
		seen = append(seen, req)

		skip := req.Variables.Skip
		limit := req.Variables.Limit
		rows := make([]string, 0, limit)
		for i := skip; i < skip+limit && i < total; i++ {
			rows = append(rows, fmt.Sprintf(`{"_id":"ip-%d","address":"10.0.0.%d","isUsed":true}`, i, i))
		}
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"data":{"getIPAddressesForCompany":[%s]}}`, strings.Join(rows, ","))
	}))
	defer server.Close()

	client := NewClient(server.URL, "tk_testkey")
	addrs, err := client.GetIPAddresses()
	if err != nil {
		t.Fatalf("GetIPAddresses error: %v", err)
	}

	// All rows collected across pages (not truncated to one page).
	if len(addrs) != total {
		t.Fatalf("collected %d addresses, want %d", len(addrs), total)
	}

	// Exactly 4 requests: 3 full pages + 1 short page (the short page stops it).
	if len(seen) != 4 {
		t.Fatalf("made %d requests, want 4 (3 full + 1 short)", len(seen))
	}

	// skip advanced by the page size each request; limit was the page size.
	wantSkips := []int{0, 2, 4, 6}
	for i, req := range seen {
		if req.Variables.Limit != 2 {
			t.Errorf("request %d limit = %d, want 2", i, req.Variables.Limit)
		}
		if req.Variables.Skip != wantSkips[i] {
			t.Errorf("request %d skip = %d, want %d", i, req.Variables.Skip, wantSkips[i])
		}
	}

	// Spot-check the walk stitched pages in order.
	if addrs[0].Address != "10.0.0.0" || addrs[total-1].Address != "10.0.0.6" {
		t.Errorf("stitched order wrong: first=%q last=%q", addrs[0].Address, addrs[total-1].Address)
	}
}

// TestGetIPAddresses_ExactMultipleStops covers the boundary where the row count
// is an exact multiple of the page size: the walk must make ONE extra request
// that returns an empty page and stop (never loop forever on a full final page).
func TestGetIPAddresses_ExactMultipleStops(t *testing.T) {
	orig := ipamPageSize
	ipamPageSize = 2
	defer func() { ipamPageSize = orig }()

	const total = 4 // exact multiple of 2 -> pages 2,2 then an empty page
	var requests int

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		body, _ := io.ReadAll(r.Body)
		var req pageRequest
		_ = json.Unmarshal(body, &req)
		skip, limit := req.Variables.Skip, req.Variables.Limit
		rows := make([]string, 0, limit)
		for i := skip; i < skip+limit && i < total; i++ {
			rows = append(rows, fmt.Sprintf(`{"_id":"ip-%d","address":"10.0.0.%d"}`, i, i))
		}
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"data":{"getIPAddressesForCompany":[%s]}}`, strings.Join(rows, ","))
	}))
	defer server.Close()

	client := NewClient(server.URL, "tk_testkey")
	addrs, err := client.GetIPAddresses()
	if err != nil {
		t.Fatalf("error: %v", err)
	}
	if len(addrs) != total {
		t.Fatalf("collected %d, want %d", len(addrs), total)
	}
	// 2 full pages + 1 empty page = 3 requests, then stop.
	if requests != 3 {
		t.Fatalf("made %d requests, want 3", requests)
	}
}

// TestGetIPAMConfig_PartialFailureSurfaces proves GetIPAMConfig no longer masks a
// failed collection query as success: when the ip-address query fails while the
// other collections succeed, it returns a NON-NIL error that NAMES the failed
// collection, while still returning the partial config it did fetch. Previously
// it swallowed every failure and returned (config, nil), so a torn snapshot with
// zero IP addresses looked identical to "no addresses exist".
func TestGetIPAMConfig_PartialFailureSurfaces(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		path := r.URL.Path
		switch {
		case strings.HasSuffix(path, "/ipam/ip-address"):
			// The one failing collection (GraphQL error, no retry delay).
			_, _ = w.Write([]byte(`{"errors":[{"message":"ip-address query exploded"}]}`))
		case strings.HasSuffix(path, "/ipam/supernet"):
			_, _ = w.Write([]byte(`{"data":{"getSupernetsForCompany":[{"_id":"s1","name":"core"}]}}`))
		case strings.HasSuffix(path, "/ipam/subnet"):
			_, _ = w.Write([]byte(`{"data":{"getSubnetsForCompany":[]}}`))
		case strings.HasSuffix(path, "/ipam/pool"):
			_, _ = w.Write([]byte(`{"data":{"getPoolsForCompany":[]}}`))
		case strings.HasSuffix(path, "/ipam/vlan"):
			_, _ = w.Write([]byte(`{"data":{"getVLANsForCompany":[]}}`))
		default:
			t.Errorf("unexpected path %q", path)
			http.Error(w, "unexpected", http.StatusInternalServerError)
		}
	}))
	defer server.Close()

	client := NewClient(server.URL, "tk_testkey")
	config, err := client.GetIPAMConfig()

	// The failure is SURFACED (not nil) and NAMES the collection.
	if err == nil {
		t.Fatalf("GetIPAMConfig returned nil error despite a failed ip-address query (partial failure masked)")
	}
	if !strings.Contains(err.Error(), "ipAddresses") {
		t.Errorf("error should name the failed collection 'ipAddresses': %v", err)
	}

	// Partial data still returned: the collections that succeeded are populated.
	if config == nil {
		t.Fatalf("expected partial config alongside the error, got nil")
	}
	if len(config.Supernets) != 1 {
		t.Errorf("supernets = %d, want 1 (the successful collection should be present)", len(config.Supernets))
	}
	if len(config.IPAddresses) != 0 {
		t.Errorf("ipAddresses = %d, want 0 (the failed collection is empty, and surfaced via error)", len(config.IPAddresses))
	}
}
