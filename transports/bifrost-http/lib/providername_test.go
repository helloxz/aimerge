package lib

import (
	"strings"
	"testing"

	"github.com/maximhq/bifrost/core/schemas"
	"github.com/maximhq/bifrost/framework/configstore"
)

// TestValidateProviderName pins the identifier rules enforced on provider
// create/update. The traversal-shaped name below is the one that appeared as a
// rogue provider in production; it must never be accepted again.
func TestValidateProviderName(t *testing.T) {
	valid := []schemas.ModelProvider{
		schemas.OpenAI,
		schemas.Anthropic,
		"custom-openai",
		"my_custom.provider",
		"B.AI",
		"baishan",
		"GmiCloud",
		"a",
		"a1",
	}
	for _, provider := range valid {
		if err := ValidateProviderName(provider); err != nil {
			t.Errorf("ValidateProviderName(%q) = %v, want nil", provider, err)
		}
	}

	invalid := []schemas.ModelProvider{
		"",
		".",
		"..",
		"../skills/serve/ex6495",
		"../../etc/passwd",
		"foo/bar",
		`foo\bar`,
		"foo bar",
		"foo%2Fbar",
		"foo\nbar",
		"foo\x00bar",
		"-foo",
		".foo",
		"foo@bar",
		"_foo",
		schemas.ModelProvider(strings.Repeat("a", maxProviderNameLength+1)),
	}
	for _, provider := range invalid {
		if err := ValidateProviderName(provider); err == nil {
			t.Errorf("ValidateProviderName(%q) = nil, want error", provider)
		}
	}
}

// TestProviderValidatorsRejectTraversalNameEvenWithoutCustomConfig guards the
// early-return paths: an update/upsert that carries no CustomProviderConfig on
// either side must still reject a traversal-shaped name, otherwise
// PUT /api/providers/{provider} can persist it.
func TestProviderValidatorsRejectTraversalNameEvenWithoutCustomConfig(t *testing.T) {
	traversal := schemas.ModelProvider("../skills/serve/ex6495")
	empty := configstore.ProviderConfig{}

	if err := ValidateCustomProvider(empty, traversal); err == nil {
		t.Error("ValidateCustomProvider accepted a traversal-shaped provider name")
	}
	if err := ValidateCustomProviderUpdate(empty, empty, traversal); err == nil {
		t.Error("ValidateCustomProviderUpdate accepted a traversal-shaped provider name")
	}
}
