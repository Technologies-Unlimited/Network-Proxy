// Package gorm is a minimal stub of gorm.io/gorm for analysistest: just enough
// of the fluent *DB API (chain builders + finishers that return *DB carrying
// .Error) for the analyzer's type check to fire exactly as it does against the
// real dependency.
package gorm

// DB mirrors gorm.io/gorm.DB: its terminal methods return *DB and expose the
// executed statement's error via the Error field.
type DB struct {
	Error error
}

// chain builders (return *DB, never execute)
func (db *DB) Where(query interface{}, args ...interface{}) *DB { return db }
func (db *DB) Model(value interface{}) *DB                      { return db }
func (db *DB) Order(value interface{}) *DB                      { return db }

// finishers (return *DB, execute; .Error is meaningful)
func (db *DB) Create(value interface{}) *DB                    { return db }
func (db *DB) Save(value interface{}) *DB                      { return db }
func (db *DB) Delete(value interface{}, conds ...interface{}) *DB { return db }
func (db *DB) Updates(values interface{}) *DB                  { return db }
func (db *DB) Find(dest interface{}, conds ...interface{}) *DB { return db }
func (db *DB) First(dest interface{}, conds ...interface{}) *DB { return db }
func (db *DB) Count(count *int64) *DB                          { return db }
func (db *DB) Exec(sql string, values ...interface{}) *DB      { return db }
