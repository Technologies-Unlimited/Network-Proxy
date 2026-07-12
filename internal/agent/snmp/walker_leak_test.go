package snmp

import (
	"testing"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/metrics"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/testutil"
)

// snmpLeakReg is the single registry for this file's leak assertions.
// metrics.NewRegistry registers on the global Prometheus registerer, so it can
// be built only once per test binary.
var snmpLeakReg = metrics.NewRegistry()

// TestSNMPRemoveDeviceDrainsMetrics proves the SNMP collector's RemoveDevice
// drains the removed device's Prometheus series (via Registry.ForgetDevice).
// Before the fix, RemoveDevice left every per-device SNMP series behind forever.
func TestSNMPRemoveDeviceDrainsMetrics(t *testing.T) {
	c := NewCollector(snmpLeakReg)
	tmpl := &models.SNMPTemplate{ID: "t1", Version: "v2c", Community: "public"}
	dev := &models.Device{ID: "leak-snmp-1", Hostname: "h", IPAddress: "10.8.8.8"}
	c.AddDevice(dev, tmpl)

	// RecordSNMPValue also bumps SNMPSuccess; record a failure too.
	snmpLeakReg.RecordSNMPValue(dev.ID, dev.IPAddress, "ifInOctets", 100)
	snmpLeakReg.RecordSNMPFailure(dev.ID, dev.IPAddress)

	if got := testutil.CollectAndCount(snmpLeakReg.SNMPValue); got == 0 {
		t.Fatalf("precondition: no SNMPValue child recorded")
	}

	c.RemoveDevice(dev.ID)

	for name, coll := range map[string]prometheus.Collector{
		"SNMPValue":   snmpLeakReg.SNMPValue,
		"SNMPSuccess": snmpLeakReg.SNMPSuccess,
		"SNMPFailure": snmpLeakReg.SNMPFailure,
	} {
		if got := testutil.CollectAndCount(coll); got != 0 {
			t.Errorf("%s: RemoveDevice left %d orphaned series; want 0 (RemoveDevice must drain via ForgetDevice)", name, got)
		}
	}
}
