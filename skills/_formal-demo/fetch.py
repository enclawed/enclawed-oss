"""Fetch a URL into the cache and return the cached body."""
import requests
from pathlib import Path

CACHE = Path("./.cache")
CACHE.mkdir(exist_ok=True)

def fetch(url: str) -> bytes:
    r = requests.get(url, timeout=10)
    body = r.content
    out = CACHE / "body.bin"
    with open(out, "wb") as fh:
        fh.write(body)
    with open(out, "rb") as fh:
        return fh.read()

if __name__ == "__main__":
    print(len(fetch("https://api.example.com/foo")))
