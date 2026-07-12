#!/usr/bin/env python3
import re, sys
from pathlib import Path
data = Path(sys.argv[1]).read_bytes()
idx = data.find(b"ProductCode")
if idx < 0:
    raise SystemExit("ProductCode not found")
m = re.search(rb"ProductCode(\{[0-9A-Fa-f-]{36}\})", data[idx:idx+80])
if not m:
    raise SystemExit("ProductCode GUID parse failed")
print(m.group(1).decode())
