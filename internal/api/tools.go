package api

import (
	"net/http"
	"strconv"
	"time"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/server"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/tools"
	"github.com/gin-gonic/gin"
)

// toolsPage renders the network tools page
func toolsPage(c *gin.Context) {
	c.HTML(http.StatusOK, "tools.html", gin.H{
		"title": "Network Tools - Network Monitor",
	})
}

// TracerouteRequest represents a traceroute request
type TracerouteRequest struct {
	Target      string `json:"target" binding:"required"`
	MaxHops     int    `json:"max_hops,omitempty"`
	Timeout     int    `json:"timeout,omitempty"`
	ResolveAddr bool   `json:"resolve_addr,omitempty"`
}

// traceroute handles traceroute requests
func traceroute(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req TracerouteRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Set default options
		opts := tools.DefaultTracerouteOptions()
		if req.MaxHops > 0 {
			opts.MaxHops = req.MaxHops
		}
		if req.Timeout > 0 {
			opts.Timeout = time.Duration(req.Timeout) * time.Second
		}
		opts.ResolveAddr = req.ResolveAddr

		// Perform traceroute
		result, err := tools.Traceroute(c.Request.Context(), req.Target, opts)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, result)
	}
}

// DNSLookupRequest represents a DNS lookup request
type DNSLookupRequest struct {
	Domain     string `json:"domain" binding:"required"`
	Type       string `json:"type" binding:"required"`
	Nameserver string `json:"nameserver,omitempty"`
	Timeout    int    `json:"timeout,omitempty"`
}

// dnsLookup handles DNS lookup requests
func dnsLookup(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req DNSLookupRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Set default options
		opts := tools.DefaultDNSLookupOptions()
		if req.Nameserver != "" {
			opts.Nameserver = req.Nameserver
		}
		if req.Timeout > 0 {
			opts.Timeout = time.Duration(req.Timeout) * time.Second
		}

		// Perform DNS lookup
		result, err := tools.DNSLookup(c.Request.Context(), req.Domain, tools.DNSRecordType(req.Type), opts)
		if err != nil {
			// Return result even with error for partial results
			c.JSON(http.StatusOK, result)
			return
		}

		c.JSON(http.StatusOK, result)
	}
}

// PortScanRequest represents a port scan request
type PortScanRequest struct {
	Target      string `json:"target" binding:"required"`
	Ports       string `json:"ports" binding:"required"`
	Timeout     int    `json:"timeout,omitempty"`
	Concurrency int    `json:"concurrency,omitempty"`
	GrabBanner  bool   `json:"grab_banner,omitempty"`
}

// portScan handles port scan requests
func portScan(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req PortScanRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Parse port range
		ports, err := tools.ParsePortRange(req.Ports)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Set default options
		opts := tools.DefaultPortScanOptions()
		if req.Timeout > 0 {
			opts.Timeout = time.Duration(req.Timeout) * time.Second
		}
		if req.Concurrency > 0 {
			opts.Concurrency = req.Concurrency
		}
		opts.GrabBanner = req.GrabBanner

		// Perform port scan
		result, err := tools.PortScan(c.Request.Context(), req.Target, ports, opts)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, result)
	}
}

// WhoisRequest represents a WHOIS request
type WhoisRequest struct {
	Target  string `json:"target" binding:"required"`
	Server  string `json:"server,omitempty"`
	Timeout int    `json:"timeout,omitempty"`
}

// whoisLookup handles WHOIS lookup requests
func whoisLookup(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req WhoisRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Set default options
		opts := tools.DefaultWhoisOptions()
		if req.Server != "" {
			opts.Server = req.Server
		}
		if req.Timeout > 0 {
			opts.Timeout = time.Duration(req.Timeout) * time.Second
		}

		// Perform WHOIS lookup
		result, err := tools.Whois(c.Request.Context(), req.Target, opts)
		if err != nil {
			// Return result even with error for partial results
			c.JSON(http.StatusOK, result)
			return
		}

		c.JSON(http.StatusOK, result)
	}
}

// BandwidthTestRequest represents a bandwidth test request
type BandwidthTestRequest struct {
	Target   string `json:"target" binding:"required"`
	Duration int    `json:"duration,omitempty"`
	Port     int    `json:"port,omitempty"`
}

// bandwidthTest handles bandwidth test requests
func bandwidthTest(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req BandwidthTestRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Set duration (default 10 seconds)
		duration := 10 * time.Second
		if req.Duration > 0 {
			duration = time.Duration(req.Duration) * time.Second
		}

		// For simple bandwidth test, we'll use the SimpleBandwidthTest function
		result, err := tools.SimpleBandwidthTest(c.Request.Context(), req.Target, duration)
		if err != nil {
			// Return result even with error for partial results
			c.JSON(http.StatusOK, result)
			return
		}

		c.JSON(http.StatusOK, result)
	}
}

// PingRequest represents a ping request
type PingRequest struct {
	Target string `json:"target" binding:"required"`
	Count  int    `json:"count,omitempty"`
}

// ping handles ping requests
func ping(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req PingRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Set count (default 4)
		count := 4
		if req.Count > 0 {
			count = req.Count
		}

		// Perform ping
		result, err := tools.Ping(c.Request.Context(), req.Target, count)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, result)
	}
}

// CommonPortsRequest represents a request for common ports
type CommonPortsRequest struct {
	Count int `form:"count"`
}

// commonPorts returns common ports for scanning
func commonPorts(srv *server.Server) gin.HandlerFunc {
	return func(c *gin.Context) {
		countStr := c.Query("count")

		if countStr != "" {
			count, err := strconv.Atoi(countStr)
			if err == nil && count > 0 {
				ports := tools.TopPorts(count)
				c.JSON(http.StatusOK, gin.H{"ports": ports})
				return
			}
		}

		ports := tools.CommonPorts()
		c.JSON(http.StatusOK, gin.H{"ports": ports})
	}
}
