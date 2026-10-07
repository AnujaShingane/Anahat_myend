"""Compute SHA-256 hashes for canonical ANAHAT KB JSON/CSV/XLSX files."""
from pathlib import Path
import hashlib
import sys

root=Path(__file__).resolve().parents[1]/'knowledge_base'/'ANAHAT_KnowledgeBase_v3'
paths=sorted(p for p in root.rglob('*') if p.is_file() and p.suffix.lower() in {'.json','.csv','.xlsx','.xls'})
for p in paths:
    h=hashlib.sha256(p.read_bytes()).hexdigest()
    print(f'{h}  {p.relative_to(root.parent.parent)}')
print(f'COUNT={len(paths)}')
