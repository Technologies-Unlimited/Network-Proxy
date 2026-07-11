package a

import "gorm.io/gorm"

// bad exercises every reported shape. The analyzer MUST fire on each marked
// line; a future edit that weakens the gate fails these expectations (RED).
func bad(db *gorm.DB, x interface{}) {
	db.Create(x)                   // want `result of GORM .+ is discarded`
	db.Save(x)                     // want `result of GORM .+ is discarded`
	db.Where("k = ?", 1).Delete(x) // want `result of GORM .+ is discarded`
	db.Model(x).Updates(x)         // want `result of GORM .+ is discarded`
	var n int64
	db.Model(x).Count(&n)          // want `result of GORM .+ is discarded`
	db.Exec("PRAGMA foreign_keys") // want `result of GORM .+ is discarded`
	_ = db.Save(x)                 // want `\.Error is silenced`
}

// good is the CORRECT pattern. The analyzer MUST stay silent here, or the gate
// is a false-positive machine that developers will route around.
func good(db *gorm.DB, x interface{}) {
	if err := db.Create(x).Error; err != nil {
		_ = err
	}
	result := db.Find(x)
	if result.Error != nil {
		_ = result.Error
	}
	var n int64
	if err := db.Model(x).Count(&n).Error; err != nil {
		_ = err
	}
	// a non-GORM method named like a finisher must be ignored (keyed on type).
	c := cache{}
	c.Delete("key")
	c.Save(x)
}

type cache struct{}

func (cache) Delete(k string)    {}
func (cache) Save(v interface{}) {}
