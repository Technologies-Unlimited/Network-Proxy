package collector

import (
	"context"
	"sync"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/agent/icmp"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/agent/snmp"
	"github.com/rs/zerolog/log"
)

// Collector orchestrates all monitoring collectors
type Collector struct {
	icmp *icmp.Collector
	snmp *snmp.Collector
}

// New creates a new main collector
func New(icmpCollector *icmp.Collector, snmpCollector *snmp.Collector) *Collector {
	return &Collector{
		icmp: icmpCollector,
		snmp: snmpCollector,
	}
}

// Start begins all collectors
func (c *Collector) Start(ctx context.Context) {
	log.Info().Msg("Starting all collectors")

	var wg sync.WaitGroup

	// Start ICMP collector
	wg.Add(1)
	go func() {
		defer wg.Done()
		c.icmp.Start(ctx)
	}()

	// Start SNMP collector
	wg.Add(1)
	go func() {
		defer wg.Done()
		c.snmp.Start(ctx)
	}()

	// Wait for all collectors to finish
	wg.Wait()

	log.Info().Msg("All collectors stopped")
}

// GetICMPCollector returns the ICMP collector
func (c *Collector) GetICMPCollector() *icmp.Collector {
	return c.icmp
}

// GetSNMPCollector returns the SNMP collector
func (c *Collector) GetSNMPCollector() *snmp.Collector {
	return c.snmp
}
