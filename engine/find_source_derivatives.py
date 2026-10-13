from pathlib import Path

root = Path("knowledge_base/ANAHAT_KnowledgeBase_v3")

targets = {
    "Brain & nervous system  .pdf",
    "Brain Waves.pdf",
    "Functioning of Nervous system.pdf",
    "Music Therapy & Brain signals processing.pdf",
    "Neurological Music Therapy.pdf",
    "Chakras & Singing Style Association.pdf",
    "Introduction of Indian Classical Music.pdf",
    "Aspect of healing - Physical & Emotional Body.pdf",
    "Emotional Issues & co-relation of Raga.pdf",
    "Equivalent Ragas in Hindustani and Carnatic Music.pdf",
    "Nada Yoga, Indian Healing Technique.pdf",
    "Senior Citizen Issues & co-relation of Raga.pdf",
    "The Selection Of Music For Therapeutic Purposes.pdf",
    "Therapeutic Approach Of Indian Classical Music.pdf",
}

print("=== SOURCE → DERIVATIVE INVENTORY ===")

for target in sorted(targets):
    stem = Path(target).stem.lower()

    matches = []

    for f in root.rglob("*"):
        if not f.is_file():
            continue

        name = f.name.lower()

        # Search using meaningful words from the filename.
        words = [
            w for w in stem.replace("-", " ").replace("_", " ").split()
            if len(w) >= 5
        ]

        score = sum(1 for w in words if w in name)

        if score >= 2:
            matches.append((score, str(f.relative_to(root))))

    matches.sort(reverse=True)

    print("\nSOURCE:", target)

    if matches:
        for score, match in matches[:10]:
            print(f"  [{score}] {match}")
    else:
        print("  No likely derivative found")

