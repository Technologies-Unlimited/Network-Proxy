package templates

import "testing"

func TestDeduplicateOIDs(t *testing.T) {
	in := []ParsedOID{
		{OID: "1.3.6.1.2.1.1.1.0", Name: "sysDescr"},
		{OID: "1.3.6.1.2.1.1.3.0", Name: "sysUpTime"},
		{OID: "1.3.6.1.2.1.1.1.0", Name: "sysDescr-dup"},
	}
	out := DeduplicateOIDs(in)
	if len(out) != 2 {
		t.Fatalf("expected 2 unique OIDs, got %d", len(out))
	}
	if out[0].OID != "1.3.6.1.2.1.1.1.0" || out[1].OID != "1.3.6.1.2.1.1.3.0" {
		t.Errorf("unexpected dedup order/content: %+v", out)
	}
}

func TestGetVendorTemplates(t *testing.T) {
	tmpls := []TemplateInfo{
		{Name: "cat3750", Manufacturer: "Cisco"},
		{Name: "nexus", Manufacturer: "Cisco"},
		{Name: "fgt", Manufacturer: "Fortinet"},
		{Name: "mystery", Manufacturer: ""},
	}
	byVendor := GetVendorTemplates(tmpls)
	if len(byVendor["Cisco"]) != 2 {
		t.Errorf("Cisco templates=%d want 2", len(byVendor["Cisco"]))
	}
	if len(byVendor["Fortinet"]) != 1 {
		t.Errorf("Fortinet templates=%d want 1", len(byVendor["Fortinet"]))
	}
	if len(byVendor["Unknown"]) != 1 {
		t.Errorf("Unknown templates=%d want 1 (empty manufacturer)", len(byVendor["Unknown"]))
	}
}
