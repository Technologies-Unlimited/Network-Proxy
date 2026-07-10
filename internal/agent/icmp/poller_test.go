package icmp

import (
	"testing"
	"time"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
)

// TestSetIntervalRetunesLiveCollector proves SetInterval actually mutates the
// value the run loop reads each cycle. Before the dynamic-interval refactor the
// ticker was fixed at Start and SetInterval was inert — a ThothOS polling
// template could never retune a running poller.
func TestSetIntervalRetunesLiveCollector(t *testing.T) {
	c := NewCollector(nil, nil)

	if got := c.GetInterval(); got != defaultICMPInterval {
		t.Fatalf("default interval = %s, want %s", got, defaultICMPInterval)
	}

	cases := []time.Duration{10 * time.Second, 90 * time.Second, 250 * time.Millisecond}
	for _, want := range cases {
		c.SetInterval(want)
		if got := c.GetInterval(); got != want {
			t.Errorf("after SetInterval(%s) GetInterval()=%s", want, got)
		}
	}

	// Zero/negative is a no-op guard (never busy-loops the poller).
	c.SetInterval(30 * time.Second)
	c.SetInterval(0)
	c.SetInterval(-5 * time.Second)
	if got := c.GetInterval(); got != 30*time.Second {
		t.Errorf("non-positive SetInterval changed interval to %s", got)
	}
}

func TestSetPingParams(t *testing.T) {
	c := NewCollector(nil, nil)
	gotCount, gotTimeout := c.pingParams()
	if gotCount != defaultPingCount || gotTimeout != defaultPingTimeout {
		t.Fatalf("defaults = (%d,%s), want (%d,%s)", gotCount, gotTimeout, defaultPingCount, defaultPingTimeout)
	}

	c.SetPingParams(2, 3*time.Second)
	if gotCount, gotTimeout = c.pingParams(); gotCount != 2 || gotTimeout != 3*time.Second {
		t.Fatalf("after SetPingParams = (%d,%s), want (2,3s)", gotCount, gotTimeout)
	}

	// Zero args leave each value unchanged.
	c.SetPingParams(0, 0)
	if gotCount, gotTimeout = c.pingParams(); gotCount != 2 || gotTimeout != 3*time.Second {
		t.Fatalf("zero SetPingParams changed values to (%d,%s)", gotCount, gotTimeout)
	}
}

func TestAddRemoveDeviceCount(t *testing.T) {
	c := NewCollector(nil, nil)
	if c.GetDeviceCount() != 0 {
		t.Fatalf("fresh collector has %d devices", c.GetDeviceCount())
	}

	c.AddDevice(&models.Device{ID: "d1", Hostname: "h1", IPAddress: "10.0.0.1"})
	c.AddDevice(&models.Device{ID: "d2", Hostname: "h2", IPAddress: "10.0.0.2"})
	if c.GetDeviceCount() != 2 {
		t.Fatalf("after 2 adds count=%d", c.GetDeviceCount())
	}

	// Re-adding the same ID must not double-count.
	c.AddDevice(&models.Device{ID: "d1", Hostname: "h1b", IPAddress: "10.0.0.9"})
	if c.GetDeviceCount() != 2 {
		t.Fatalf("re-add same id changed count to %d", c.GetDeviceCount())
	}

	c.RemoveDevice("d1")
	if c.GetDeviceCount() != 1 {
		t.Fatalf("after remove count=%d", c.GetDeviceCount())
	}
	c.RemoveDevice("does-not-exist") // no-op, no panic
	if c.GetDeviceCount() != 1 {
		t.Fatalf("remove of missing id changed count to %d", c.GetDeviceCount())
	}
}
