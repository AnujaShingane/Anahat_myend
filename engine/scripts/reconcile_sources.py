from pathlib import Path
import csv, json, re
from difflib import SequenceMatcher

ROOT = Path(__file__).resolve().parents[1]
KB = ROOT / "knowledge_base" / "ANAHAT_KnowledgeBase_v3"
SOURCES = KB / "sources"
MATRIX = KB / "knowledge_base_ingestion_matrix.csv"
REPORT = KB / "source_reconciliation_report.json"

def norm(s):
    s = str(s or "").strip().lower()
    s = re.sub(r"\\.(pdf|docx|xlsx|txt|md)$", "", s)
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return " ".join(s.split())

def sim(a,b):
    return SequenceMatcher(None, norm(a), norm(b)).ratio()

def policy(r):
    status = r["ingestion_status"].strip()
    q = r["ingest_to_qdrant"].strip()
    ref = r["reference_only"].strip()
    review = r["requires_review"].strip()
    lic = r["license_status"].strip().lower()
    ver = r["source_verification_status"].strip().lower()

    if status == "duplicate": return "DO_NOT_INDEX", "duplicate"
    if q == "n/a_structured": return "STRUCTURED_ONLY", "structured data"
    if q == "image_not_text": return "HOLD", "transcription required"
    if q == "no": return "DO_NOT_INDEX", "matrix says qdrant=no"
    if status == "do_not_ingest_full_text": return "DO_NOT_INDEX", "full-text ingestion prohibited"
    if q == "review_pending": return "HOLD", "review pending"
    if q == "yes":
        if ("unconfirmed" in lic or "unknown" in lic or
            "source_verification_required" in ver):
            return "HOLD", "IP/source verification unresolved"
        if review == "yes": return "HOLD", "review required"
        return "INDEX", "matrix-approved candidate"
    if ref == "yes": return "DO_NOT_INDEX", "reference only"
    return "HOLD", "unclassified matrix state"

def main():
    if not MATRIX.exists():
        raise SystemExit(f"Matrix not found: {MATRIX}")
    rows = list(csv.DictReader(MATRIX.open(encoding="utf-8-sig", newline="")))
    sources = [p for p in SOURCES.rglob("*") if p.is_file()] if SOURCES.exists() else []

    records=[]; exact=0
    matrix_norm={norm(r["file_name"]) for r in rows}

    for r in rows:
        name=r["file_name"].strip()
        matches=[p for p in sources if norm(p.name)==norm(name)]
        p, reason = policy(r)
        if matches:
            exact += 1
        best=sorted(
            [{"path":str(x.relative_to(KB)).replace("\\","/"),"similarity":round(sim(name,x.name),3)}
             for x in sources],
            key=lambda x:x["similarity"], reverse=True
        )[:3]
        records.append({
            "matrix_file":name,
            "source_present":bool(matches),
            "source_path":str(matches[0].relative_to(KB)).replace("\\","/") if matches else "",
            "policy":p,
            "policy_reason":reason,
            "qdrant_flag":r["ingest_to_qdrant"],
            "reference_only":r["reference_only"],
            "requires_review":r["requires_review"],
            "ingestion_status":r["ingestion_status"],
            "license_status":r["license_status"],
            "source_verification_status":r["source_verification_status"],
            "best_matches":[] if matches else best
        })

    extra=[str(p.relative_to(KB)).replace("\\","/") for p in sources if norm(p.name) not in matrix_norm]
    counts={x:sum(r["policy"]==x for r in records) for x in ["INDEX","STRUCTURED_ONLY","HOLD","DO_NOT_INDEX"]}
    report={"matrix_rows":len(rows),"source_files_found":len(sources),
            "exact_source_matches":exact,
            "missing_matrix_sources":len(rows)-exact,
            "extra_source_files":extra,"policy_counts":counts,"records":records}
    REPORT.write_text(json.dumps(report,indent=2,ensure_ascii=False),encoding="utf-8")

    print("="*72)
    print("ANAHAT SOURCE RECONCILIATION")
    print("="*72)
    print("Matrix rows                 :",len(rows))
    print("Source files found         :",len(sources))
    print("Exact filename matches    :",exact)
    print("Missing from sources/     :",len(rows)-exact)
    for k,v in counts.items(): print(f"{k:<28}: {v}")
    print("\nReport:",REPORT)
    print("\nMissing sources:")
    for r in records:
        if not r["source_present"]:
            print("-",r["matrix_file"])
            for m in r["best_matches"]:
                print("   candidate:",m["path"],"(",m["similarity"],")")
    print("\nNo files were copied, deleted, renamed, or indexed.")

if __name__=="__main__":
    main()
