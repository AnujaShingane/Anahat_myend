const CHAKRA_PALETTE = ['#f59e0b', '#a855f7', '#22d3ee', '#f472b6', '#34d399', '#fb923c', '#818cf8'];

export function colorForChakra(name, knownNames) {
    const idx = knownNames.indexOf(name);
    return CHAKRA_PALETTE[idx % CHAKRA_PALETTE.length];
}

export function severityBadgeClass(severity) {
    if (severity === 'Severe') return 'bg-red-500/20 text-red-300 border-red-500/30';
    if (severity === 'Moderate') return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
    if (severity === 'Mild') return 'bg-[#0F8594]/20 text-[#0F8594]/45 border-[#0F8594]/30';
    return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
}

// Hand-rolled SVG line chart - no external chart library dependency, and
// full control over matching the app's premium dark/amber visual identity.
export default function ChakraTrendChart({ trends }) {
    if (!trends || trends.length === 0) return null;

    const width = 720;
    const height = 280;
    const padding = { top: 20, right: 20, bottom: 36, left: 36 };
    const innerW = width - padding.left - padding.right;
    const innerH = height - padding.top - padding.bottom;

    const knownNames = Array.from(new Set(trends.flatMap(t => t.chakras.map(c => c.name))));
    const allScores = trends.flatMap(t => t.chakras.map(c => c.total_score ?? 0));
    const minScore = Math.min(0, ...allScores);
    const maxScore = Math.max(1, ...allScores);
    const scoreRange = maxScore - minScore || 1;

    const xFor = (i) => padding.left + (trends.length === 1 ? innerW / 2 : (i / (trends.length - 1)) * innerW);
    const yFor = (score) => padding.top + innerH - ((score - minScore) / scoreRange) * innerH;

    const linesByChakra = knownNames.map(name => {
        const points = trends.map((t, i) => {
            const entry = t.chakras.find(c => c.name === name);
            return entry ? { x: xFor(i), y: yFor(entry.total_score ?? 0) } : null;
        }).filter(Boolean);
        return { name, points, color: colorForChakra(name, knownNames) };
    });

    return (
        <div className="overflow-x-auto">
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[560px]" style={{ maxHeight: 320 }}>
                {[0, 0.25, 0.5, 0.75, 1].map((f, i) => (
                    <line
                        key={i}
                        x1={padding.left} x2={width - padding.right}
                        y1={padding.top + innerH * f} y2={padding.top + innerH * f}
                        stroke="rgba(15,23,42,0.08)" strokeWidth="1"
                    />
                ))}

                {linesByChakra.map(line => (
                    <polyline
                        key={line.name}
                        points={line.points.map(p => `${p.x},${p.y}`).join(' ')}
                        fill="none"
                        stroke={line.color}
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        opacity="0.9"
                    />
                ))}

                {linesByChakra.map(line => line.points.map((p, i) => (
                    <circle key={`${line.name}-${i}`} cx={p.x} cy={p.y} r="3.5" fill={line.color} />
                )))}

                {trends.map((t, i) => (
                    <text
                        key={t.sessionId}
                        x={xFor(i)}
                        y={height - 10}
                        textAnchor="middle"
                        fontSize="10"
                        fill="rgba(71,85,105,0.8)"
                    >
                        {new Date(t.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </text>
                ))}
            </svg>

            <div className="flex flex-wrap gap-x-5 gap-y-2 mt-2 px-2">
                {knownNames.map(name => (
                    <div key={name} className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colorForChakra(name, knownNames) }}></span>
                        <span className="text-xs text-slate-600">{name}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}