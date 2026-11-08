package modelcatalog

import (
	"testing"

	"github.com/maximhq/bifrost/core/schemas"
)

// TestRefineModelForProvider covers the refinement contract: bare names resolve to the
// provider's catalog slug, known-provider prefixes are idempotent, the target provider's
// own prefix is stripped and re-refined (round-tripping canonical own-prefixed names),
// and unknown namespace prefixes are left untouched.
func TestRefineModelForProvider(t *testing.T) {
	mc := NewTestCatalog(nil)
	mc.UpsertLive(schemas.OpenRouter, "or-key", false, []string{"openai/gpt-4o", "anthropic/claude-sonnet-4-5", "openrouter/auto"})

	cases := []struct {
		name     string
		provider schemas.ModelProvider
		model    string
		want     string
	}{
		{"openrouter bare resolves to catalog slug", schemas.OpenRouter, "gpt-4o", "openai/gpt-4o"},
		{"openrouter already-refined is unchanged", schemas.OpenRouter, "anthropic/claude-sonnet-4-5", "anthropic/claude-sonnet-4-5"},
		{"openrouter own-prefixed canonical round-trips", schemas.OpenRouter, "openrouter/auto", "openrouter/auto"},
		{"own prefix on non-nested provider is stripped", schemas.OpenAI, "openai/gpt-oss-120b", "gpt-oss-120b"},
		{"foreign prefix on non-nested provider unchanged", schemas.OpenAI, "anthropic/claude-opus-4-6", "anthropic/claude-opus-4-6"},
		{"non-nested provider bare unchanged", schemas.Anthropic, "claude-opus-4-6", "claude-opus-4-6"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := mc.RefineModelForProvider(tc.provider, tc.model)
			if err != nil {
				t.Fatalf("RefineModelForProvider(%s, %q) returned error: %v", tc.provider, tc.model, err)
			}
			if got != tc.want {
				t.Fatalf("RefineModelForProvider(%s, %q) = %q, want %q", tc.provider, tc.model, got, tc.want)
			}
		})
	}
}
