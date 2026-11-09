package modelcatalog

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestResolveLazyModelParameters(t *testing.T) {
	t.Run("default off", func(t *testing.T) {
		t.Setenv("BIFROST_LAZY_MODEL_PARAMETERS", "")
		v, err := resolveLazyModelParameters(nil)
		require.NoError(t, err)
		require.False(t, v)
	})

	t.Run("programmatic flag", func(t *testing.T) {
		t.Setenv("BIFROST_LAZY_MODEL_PARAMETERS", "")
		v, err := resolveLazyModelParameters(&Config{LazyModelParameters: true})
		require.NoError(t, err)
		require.True(t, v)
	})

	t.Run("env enables", func(t *testing.T) {
		t.Setenv("BIFROST_LAZY_MODEL_PARAMETERS", "true")
		v, err := resolveLazyModelParameters(nil)
		require.NoError(t, err)
		require.True(t, v)
	})

	t.Run("env wins over flag", func(t *testing.T) {
		t.Setenv("BIFROST_LAZY_MODEL_PARAMETERS", "false")
		v, err := resolveLazyModelParameters(&Config{LazyModelParameters: true})
		require.NoError(t, err)
		require.False(t, v)
	})

	t.Run("whitespace and numeric bools", func(t *testing.T) {
		t.Setenv("BIFROST_LAZY_MODEL_PARAMETERS", " 1 ")
		v, err := resolveLazyModelParameters(nil)
		require.NoError(t, err)
		require.True(t, v)
	})

	t.Run("invalid value keeps configured default", func(t *testing.T) {
		t.Setenv("BIFROST_LAZY_MODEL_PARAMETERS", "sometimes")
		v, err := resolveLazyModelParameters(&Config{LazyModelParameters: true})
		require.Error(t, err)
		require.True(t, v)
	})
}
