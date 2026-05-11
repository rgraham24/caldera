/**
 * Tiny decorative sparkline. Renders a polyline + area fill, no axes
 * or labels. Returns null when fewer than 2 data points are available
 * so the consumer can keep its existing layout untouched.
 *
 * Stateless and pure SVG — safe to render server-side. Auto-scales
 * the y-axis to the data's min/max so flat-ish series still show
 * visible movement.
 */

interface Props {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}

export function Sparkline({
  data,
  color = "var(--color-caldera)",
  width = 100,
  height = 32,
}: Props) {
  if (!data || data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1; // avoid div-by-zero on perfectly flat data

  // SVG y is top-down — invert so high values appear at the top
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / span) * height;
    return { x, y };
  });

  const polylinePoints = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaPath =
    `M ${points[0].x.toFixed(1)} ${height} ` +
    points.map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ") +
    ` L ${points[points.length - 1].x.toFixed(1)} ${height} Z`;

  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="overflow-visible"
      aria-hidden="true"
    >
      <path d={areaPath} fill={color} opacity={0.08} />
      <polyline
        points={polylinePoints}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Start + end dots anchor the line visually — even a perfectly
          flat series reads as a real chart instead of looking broken. */}
      <circle cx={firstPoint.x} cy={firstPoint.y} r={1.5} fill={color} />
      <circle cx={lastPoint.x} cy={lastPoint.y} r={1.5} fill={color} />
    </svg>
  );
}
