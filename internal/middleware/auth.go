package middleware

import (
	"context"
	"net/http"
	"sync"

	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
)

// ContextKey is a type for context keys
type ContextKey string

const (
	// CompanyIDKey is the key for company ID in context
	CompanyIDKey ContextKey = "companyId"
	// APIKeyIDKey is the key for API key ID in context
	APIKeyIDKey ContextKey = "apiKeyId"
	// ProxyIDKey is the key for proxy ID in context
	ProxyIDKey ContextKey = "proxyId"
	// UserIDKey is the key for user ID in context
	UserIDKey ContextKey = "userId"
	// UserTypeKey is the key for user type in context
	UserTypeKey ContextKey = "userType"
	// UserNameKey is the key for user name in context
	UserNameKey ContextKey = "userName"
)

// AuthContext holds the authentication context
type AuthContext struct {
	CompanyID   string
	APIKeyID    string
	ProxyID     string
	Permissions []string
	UserID      string
	UserType    string
	UserName    string
}

var (
	// globalAuthContext is the cached auth context
	globalAuthContext *AuthContext
	authMu            sync.RWMutex
	// standaloneMode indicates if the app is running without ThothOS
	standaloneMode bool
)

// SetStandaloneMode enables standalone mode (no auth required)
func SetStandaloneMode(enabled bool) {
	authMu.Lock()
	defer authMu.Unlock()
	standaloneMode = enabled
	if enabled {
		log.Info().Msg("Standalone mode enabled - authentication bypassed")
	}
}

// IsStandaloneMode returns whether standalone mode is enabled
func IsStandaloneMode() bool {
	authMu.RLock()
	defer authMu.RUnlock()
	return standaloneMode
}

// SetGlobalAuthContext sets the global auth context (called after API key validation)
func SetGlobalAuthContext(ctx *AuthContext) {
	authMu.Lock()
	defer authMu.Unlock()
	globalAuthContext = ctx
	log.Info().
		Str("companyId", ctx.CompanyID).
		Str("apiKeyId", ctx.APIKeyID).
		Str("proxyId", ctx.ProxyID).
		Msg("Global auth context set")
}

// GetGlobalAuthContext returns the global auth context
func GetGlobalAuthContext() *AuthContext {
	authMu.RLock()
	defer authMu.RUnlock()
	return globalAuthContext
}

// UpdateProxyID updates the proxy ID in the global auth context
func UpdateProxyID(proxyID string) {
	authMu.Lock()
	defer authMu.Unlock()
	if globalAuthContext != nil {
		globalAuthContext.ProxyID = proxyID
	}
}

// UpdatePermissions updates the permission scopes in the global auth context.
// Needed after the MFA login flow: handleVerifyMFA sets the context before the
// background registration validates the API key, so the key's scopes arrive
// later than the rest of the identity.
func UpdatePermissions(permissions []string) {
	authMu.Lock()
	defer authMu.Unlock()
	if globalAuthContext != nil {
		globalAuthContext.Permissions = permissions
	}
}

// RequireAuth is middleware that ensures the global auth context is set
// In standalone mode, authentication is bypassed
func RequireAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Allow access in standalone mode
		if IsStandaloneMode() {
			c.Set("standaloneMode", true)
			c.Next()
			return
		}

		authCtx := GetGlobalAuthContext()
		if authCtx == nil {
			log.Error().Msg("No auth context available - API key not validated")
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "Service not authenticated with ThothOS",
			})
			return
		}

		// Add auth context to request context
		ctx := context.WithValue(c.Request.Context(), CompanyIDKey, authCtx.CompanyID)
		ctx = context.WithValue(ctx, APIKeyIDKey, authCtx.APIKeyID)
		ctx = context.WithValue(ctx, ProxyIDKey, authCtx.ProxyID)
		ctx = context.WithValue(ctx, UserIDKey, authCtx.UserID)
		ctx = context.WithValue(ctx, UserTypeKey, authCtx.UserType)
		ctx = context.WithValue(ctx, UserNameKey, authCtx.UserName)
		c.Request = c.Request.WithContext(ctx)

		// Also set in Gin context for convenience
		c.Set("companyId", authCtx.CompanyID)
		c.Set("apiKeyId", authCtx.APIKeyID)
		c.Set("proxyId", authCtx.ProxyID)
		c.Set("userId", authCtx.UserID)
		c.Set("userType", authCtx.UserType)
		c.Set("userName", authCtx.UserName)

		c.Next()
	}
}

// GetCompanyID extracts company ID from Gin context
func GetCompanyID(c *gin.Context) string {
	if companyID, exists := c.Get("companyId"); exists {
		return companyID.(string)
	}
	return ""
}

// GetAPIKeyID extracts API key ID from Gin context
func GetAPIKeyID(c *gin.Context) string {
	if apiKeyID, exists := c.Get("apiKeyId"); exists {
		return apiKeyID.(string)
	}
	return ""
}

// GetProxyID extracts proxy ID from Gin context
func GetProxyID(c *gin.Context) string {
	if proxyID, exists := c.Get("proxyId"); exists {
		return proxyID.(string)
	}
	return ""
}

// GetUserID extracts user ID from Gin context
func GetUserID(c *gin.Context) string {
	if userID, exists := c.Get("userId"); exists {
		return userID.(string)
	}
	return ""
}

// GetUserType extracts user type from Gin context
func GetUserType(c *gin.Context) string {
	if userType, exists := c.Get("userType"); exists {
		return userType.(string)
	}
	return ""
}

// GetUserName extracts user name from Gin context
func GetUserName(c *gin.Context) string {
	if userName, exists := c.Get("userName"); exists {
		return userName.(string)
	}
	return ""
}

// GetCompanyIDFromContext extracts company ID from standard context
func GetCompanyIDFromContext(ctx context.Context) string {
	if companyID, ok := ctx.Value(CompanyIDKey).(string); ok {
		return companyID
	}
	return ""
}

// HasPermission checks if the current auth context has a specific permission
func HasPermission(permission string) bool {
	authCtx := GetGlobalAuthContext()
	if authCtx == nil {
		return false
	}
	for _, p := range authCtx.Permissions {
		if p == permission {
			return true
		}
	}
	return false
}

// RequirePermission is middleware that checks for a specific permission
func RequirePermission(permission string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !HasPermission(permission) {
			log.Warn().
				Str("permission", permission).
				Msg("Permission denied")
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"error": "Permission denied: " + permission,
			})
			return
		}
		c.Next()
	}
}
