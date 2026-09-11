"""Manual live verification for EmergentUniversalKeyProvider (needs a real Universal Key + network).
Run: EMERGENT_UNIVERSAL_KEY=... python tests/manual_emergent_live.py
Not part of the deterministic suite (that one is network-free)."""
import asyncio
import base64
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.devstudio.providers.emergent_provider import EmergentUniversalKeyProvider  # noqa: E402

import struct
import zlib


def _make_png(width=48, height=48, rgb=(220, 40, 40)) -> str:
    """Build a valid solid-color PNG (no external deps) so vision models accept it."""
    def chunk(tag, data):
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)
    row = b"\x00" + bytes(rgb) * width
    raw = row * height
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    png = (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr)
           + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))
    return base64.b64encode(png).decode()


_PNG = _make_png()


async def main():
    key = os.environ.get("EMERGENT_UNIVERSAL_KEY")
    p = EmergentUniversalKeyProvider(universal_key=key)

    print("== Test 1: model discovery ==")
    models = p.list_models()
    print(f"models: {len(models)} | families:",
          sorted({m.notes.split()[0] for m in models}))
    assert models, "no models"
    print("sample:", models[0].id, models[0].provider, models[0].supports_vision)

    for fam_model in ["gpt-5.4", "claude-sonnet-4-6", "gemini-2.5-flash"]:
        print(f"\n== generate [{fam_model}] ==")
        r = await p.generate(system="You are terse.", prompt="Reply with exactly: OK",
                             model=fam_model, max_tokens=50)
        print("text:", repr(r.text[:80]), "| provider:", r.provider, "| model:", r.model)
        print("usage:", r.usage.input_tokens, r.usage.output_tokens, "dur_ms:", r.usage.duration_ms,
              "cost:", r.usage.cost_usd)
        assert r.text and r.provider == "emergent" and r.model == fam_model

    print("\n== generate_structured [gpt-5.4] ==")
    r = await p.generate_structured(
        system="Return JSON.",
        prompt='Return a JSON object: {"ok": true, "n": 3}', model="gpt-5.4", max_tokens=100)
    print("text:", repr(r.text[:120]))
    import json
    from app.devstudio.agents.runner import extract_json
    parsed = extract_json(r.text)
    print("parsed:", parsed)
    assert isinstance(parsed, (dict, list))

    print("\n== generate_with_vision [gemini-2.5-flash] ==")
    r = await p.generate_with_vision(
        system="You describe images briefly.",
        prompt="What color is this 1x1 image? One word.", model="gemini-2.5-flash",
        images_b64=[_PNG], max_tokens=50)
    print("vision text:", repr(r.text[:120]), "| usage:", r.usage.input_tokens, r.usage.output_tokens)
    assert r.text

    print("\n== stream [claude-sonnet-4-6] ==")
    chunks = []
    async for tok in p.stream(system="terse", prompt="Count 1 to 3.", model="claude-sonnet-4-6",
                              max_tokens=50):
        chunks.append(tok)
    print("streamed chars:", len("".join(chunks)), "| preview:", repr("".join(chunks)[:60]))
    assert chunks

    print("\nALL LIVE CHECKS PASSED")


if __name__ == "__main__":
    asyncio.run(main())
