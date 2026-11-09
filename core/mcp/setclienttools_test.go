package mcp

import (
	"testing"

	"github.com/maximhq/bifrost/core/schemas"
	"github.com/stretchr/testify/require"
)

// TestSetClientToolsReplacesToolMap verifies that a tool removed upstream is
// evicted from the in-memory map instead of lingering forever.
func TestSetClientToolsReplacesToolMap(t *testing.T) {
	manager := &MCPManager{
		logger: testNoopLogger{},
		clientMap: map[string]*schemas.MCPClientState{
			"client-1": {
				Name: "client-1",
				ToolMap: map[string]schemas.ChatTool{
					"keep":    {Type: "function"},
					"removed": {Type: "function"},
				},
			},
		},
	}

	manager.SetClientTools("client-1", map[string]schemas.ChatTool{
		"keep":  {Type: "function"},
		"added": {Type: "function"},
	}, map[string]string{"keep": "keep"})

	state := manager.clientMap["client-1"]
	require.Len(t, state.ToolMap, 2)
	require.Contains(t, state.ToolMap, "keep")
	require.Contains(t, state.ToolMap, "added")
	require.NotContains(t, state.ToolMap, "removed")
	require.Equal(t, schemas.MCPConnectionStateConnected, state.State)
}

type testNoopLogger struct{}

func (testNoopLogger) Debug(string, ...any)                   {}
func (testNoopLogger) Info(string, ...any)                    {}
func (testNoopLogger) Warn(string, ...any)                    {}
func (testNoopLogger) Error(string, ...any)                   {}
func (testNoopLogger) Fatal(string, ...any)                   {}
func (testNoopLogger) SetLevel(schemas.LogLevel)              {}
func (testNoopLogger) SetOutputType(schemas.LoggerOutputType) {}
func (testNoopLogger) LogHTTPRequest(schemas.LogLevel, string) schemas.LogEventBuilder {
	return schemas.NoopLogEvent
}
