package icmp

import (
	"testing"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/metrics"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/testutil"
)

// icmpLeakReg is the single registry for this file's leak assertions.
// metrics.NewRegistry registers on the global Prometheus registerer, so it can
// be built only once per test binary.
var icmpLeakReg = metrics.NewRegistry()

// TestRemoveDeviceDrainsMetrics proves the ICMP collector's RemoveDevice drains
// the removed device's Prometheus series (via Registry.ForgetDevice). Before the
// fix, RemoveDevice dropped the in-memory device map entry but left every
// per-device series behind forever, so a churned device leaked orphaned children
// on /metrics.
func TestRemoveDeviceDrainsMetrics(t *testing.T) {
	c := NewCollector(icmpLeakReg, nil)
	dev := &models.Device{ID: "leak-icmp-1", Hostname: "h", IPAddress: "10.9.9.9"}
	c.AddDevice(dev)

	// Simulate a poll cycle recording each per-device ICMP series.
	icmpLeakReg.RecordPingSuccess(dev.ID, dev.IPAddress, 12)
	icmpLeakReg.RecordPingFailure(dev.ID, dev.IPAddress)
	icmpLeakReg.RecordPacketLoss(dev.ID, dev.IPAddress, 5)
	icmpLeakReg.RecordDeviceStatus(dev.ID, dev.IPAddress, 1)

	if got := testutil.CollectAndCount(icmpLeakReg.PingLatency); got == 0 {
		t.Fatalf("precondition: no PingLatency child recorded")
	}

	c.RemoveDevice(dev.ID)

	for name, coll := range map[string]prometheus.Collector{
		"PingLatency":  icmpLeakReg.PingLatency,
		"PingSuccess":  icmpLeakReg.PingSuccess,
		"PingFailure":  icmpLeakReg.PingFailure,
		"PacketLoss":   icmpLeakReg.PacketLoss,
		"DeviceStatus": icmpLeakReg.DeviceStatus,
	} {
		if got := testutil.CollectAndCount(coll); got != 0 {
			t.Errorf("%s: RemoveDevice left %d orphaned series; want 0 (RemoveDevice must drain via ForgetDevice)", name, got)
		}
	}
	if icmpLeakReg.HasStatusSample(dev.ID) {
		t.Errorf("RemoveDevice left the sampledStatus entry for the removed device")
	}
}
