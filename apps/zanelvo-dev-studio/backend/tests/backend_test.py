"""Emergent Provider integration — backend tests (live).

Covers the review-request surface: auth cookie, model discovery, live provider
generation across three families, error normalization for unknown model,
per-role agent config persistence, and secret non-leakage.
"""
import os
import pytest
import requests

BASE_URL = (os.environ.get("EXTERNAL_BASE_URL")
            or "https://8f7ba8e4-97d6-49e0-b1d3-446f8323597d.preview.emergentagent.com").rstrip("/")
ADMIN_PASSWORD = "devstudio-admin"


@pytest.fixture(scope="session")
def client():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    body = r.json()
    assert body.get("ok") is True, f"login body not ok: {body}"
    # cookie must be set
    assert any(c.name for c in s.cookies), "no auth cookie set"
    return s


# --- Auth ---------------------------------------------------------------------
def test_admin_login_ok_and_cookie(client):
    # authed call succeeds
    r = client.get(f"{BASE_URL}/api/devstudio/settings", timeout=30)
    assert r.status_code == 200, r.text


# --- Model discovery ----------------------------------------------------------
def test_providers_models_lists_emergent_catalog(client):
    r = client.get(f"{BASE_URL}/api/devstudio/providers/models", timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    models_map = body.get("models") or body
    assert "emergent" in models_map, f"emergent group missing; keys={list(models_map.keys())}"
    emergent_models = models_map["emergent"]
    assert isinstance(emergent_models, list)
    assert len(emergent_models) == 12, f"expected 12 emergent models, got {len(emergent_models)}"
    ids = [m["id"] for m in emergent_models]
    assert len(ids) == len(set(ids)), f"duplicate model ids: {ids}"
    # required metadata
    for m in emergent_models:
        assert m["provider"] == "emergent"
        for f in ("id", "label", "supports_tools", "supports_vision",
                  "supports_reasoning_levels", "context_window"):
            assert f in m, f"missing {f} in {m}"
    # spans three families
    has_gpt = any(i.startswith("gpt-") for i in ids)
    has_claude = any(i.startswith("claude-") for i in ids)
    has_gemini = any(i.startswith("gemini-") for i in ids)
    assert has_gpt and has_claude and has_gemini, f"families incomplete: {ids}"


# --- Live provider tests (real network) --------------------------------------
@pytest.mark.parametrize("model", [
    "claude-sonnet-4-6",
    "gpt-5.4",
    "gemini-2.5-flash",
])
def test_providers_test_live_ok(client, model):
    r = client.post(f"{BASE_URL}/api/devstudio/providers/test",
                    json={"provider": "emergent", "model": model}, timeout=120)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("ok") is True, f"live call not ok for {model}: {body}"
    assert body.get("response_text"), f"empty response_text for {model}: {body}"
    usage = body.get("usage") or {}
    assert (usage.get("input_tokens") or 0) > 0, f"no input tokens for {model}: {usage}"
    assert (usage.get("output_tokens") or 0) > 0, f"no output tokens for {model}: {usage}"


def test_providers_test_unknown_model_is_normalized(client):
    r = client.post(f"{BASE_URL}/api/devstudio/providers/test",
                    json={"provider": "emergent", "model": "totally-unknown-model"},
                    timeout=60)
    # Must not be a 500
    assert r.status_code == 200, f"expected 200 with ok=false, got {r.status_code}: {r.text}"
    body = r.json()
    assert body.get("ok") is False, f"expected ok=false: {body}"
    assert body.get("error_type") == "error", f"expected error_type=='error': {body}"
    # never leak the key
    assert "sk-emergent-" not in r.text, "key string leaked in response"


# --- Per-role agent config ----------------------------------------------------
def test_agents_config_lists_roles(client):
    r = client.get(f"{BASE_URL}/api/devstudio/agents/config", timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    # accept either list or dict-of-roles
    roles = body if isinstance(body, list) else (body.get("roles") or body.get("configs") or body)
    text = str(roles).lower()
    assert "planner" in text and "reviewer" in text, f"planner/reviewer missing in: {body}"


def test_planner_and_reviewer_have_independent_emergent_models(client):
    # PUT planner
    planner_payload = {
        "primary_provider": "emergent",
        "primary_model": "gpt-5.4",
        "fallback_provider": "emergent",
        "fallback_model": "claude-sonnet-4-6",
        "automatic_fallback": True,
    }
    r = client.put(f"{BASE_URL}/api/devstudio/agents/config/planner",
                   json=planner_payload, timeout=30)
    assert r.status_code == 200, r.text

    # PUT reviewer with a different model
    reviewer_payload = {
        "primary_provider": "emergent",
        "primary_model": "claude-opus-5",
    }
    r = client.put(f"{BASE_URL}/api/devstudio/agents/config/reviewer",
                   json=reviewer_payload, timeout=30)
    assert r.status_code == 200, r.text

    # GET and confirm
    r = client.get(f"{BASE_URL}/api/devstudio/agents/config", timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()

    def find_role(name):
        if isinstance(body, list):
            for e in body:
                if e.get("role") == name or e.get("name") == name:
                    return e
        elif isinstance(body, dict):
            if name in body:
                return body[name]
            for key in ("roles", "configs", "agents"):
                v = body.get(key)
                if isinstance(v, dict) and name in v:
                    return v[name]
                if isinstance(v, list):
                    for e in v:
                        if e.get("role") == name or e.get("name") == name:
                            return e
        return None

    planner = find_role("planner")
    reviewer = find_role("reviewer")
    assert planner is not None, f"planner not found in {body}"
    assert reviewer is not None, f"reviewer not found in {body}"
    assert planner.get("primary_provider") == "emergent"
    assert planner.get("primary_model") == "gpt-5.4", f"planner={planner}"
    assert reviewer.get("primary_provider") == "emergent"
    assert reviewer.get("primary_model") == "claude-opus-5", f"reviewer={reviewer}"
    assert planner.get("primary_model") != reviewer.get("primary_model")


# --- Settings & secret non-leak ----------------------------------------------
def test_settings_reports_emergent_configured_without_leaking(client):
    r = client.get(f"{BASE_URL}/api/devstudio/settings", timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    sc = body.get("secrets_configured") or {}
    assert sc.get("emergent_universal_key") is True, f"emergent not configured: {sc}"
    text = r.text
    assert "sk-emergent-" not in text, "raw key leaked in settings response"
    # No raw key value under any common field
    for k in ("emergent_universal_key", "EMERGENT_UNIVERSAL_KEY"):
        v = body.get(k)
        assert v in (None, True, False), f"raw key value exposed under {k}: {v!r}"
