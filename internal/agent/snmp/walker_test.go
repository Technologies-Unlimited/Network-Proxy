package snmp

import (
	"testing"
	"time"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
)

func TestSNMPSetIntervalRetunesLiveCollector(t *testing.T) {
	c := NewCollector(nil, nil)

	if got := c.GetInterval(); got != 60*time.Second {
		t.Fatalf("default interval = %s, want 60s", got)
	}

	for _, want := range []time.Duration{15 * time.Second, 120 * time.Second} {
		c.SetInterval(want)
		if got := c.GetInterval(); got != want {
			t.Errorf("after SetInterval(%s) GetInterval()=%s", want, got)
		}
	}

	c.SetInterval(45 * time.Second)
	c.SetInterval(0) // no-op guard
	if got := c.GetInterval(); got != 45*time.Second {
		t.Errorf("non-positive SetInterval changed interval to %s", got)
	}
}

func TestSNMPAddRemoveDeviceCount(t *testing.T) {
	c := NewCollector(nil, nil)
	tmpl := &models.SNMPTemplate{ID: "t1", Version: "v2c", Community: "public"}

	c.AddDevice(&models.Device{ID: "d1", Hostname: "h1", IPAddress: "10.0.0.1"}, tmpl)
	c.AddDevice(&models.Device{ID: "d2", Hostname: "h2", IPAddress: "10.0.0.2"}, tmpl)
	if c.GetDeviceCount() != 2 {
		t.Fatalf("after 2 adds count=%d", c.GetDeviceCount())
	}

	c.RemoveDevice("d1")
	if c.GetDeviceCount() != 1 {
		t.Fatalf("after remove count=%d", c.GetDeviceCount())
	}
}
