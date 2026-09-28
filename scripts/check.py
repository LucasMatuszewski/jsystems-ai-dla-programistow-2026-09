"""Dependency-free setup check; expected to pass before exercises are solved."""

from pathlib import Path
import shutil
import subprocess
import sys


root = Path(__file__).resolve().parents[1]
assert (root / "practice/python/tickets.py").is_file()
assert (root / "practice/javascript/tickets.mjs").is_file()
print(f"Python {sys.version.split()[0]}: OK")
node = shutil.which("node")
if node:
    version = subprocess.check_output([node, "--version"], text=True).strip()
    print(f"Node {version}: OK")
else:
    print("Node: unavailable; use the Python track or install Node before the JavaScript track")
print("Workshop files: OK")
