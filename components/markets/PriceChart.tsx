"use client";

import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";

type PricePoint = {
  yes_price: number;
  no_price: number;
  total_volume: number;
  recorded_at: string;
};

type Props = {
  marketId: string;
  currentYesPrice: number;
  currentNoPrice: number;
};

export function PriceChart({ marketId, currentYesPrice, currentNoPrice }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [data, setData] = useState<PricePoint[]>([]);
  const [range, setRange] = useState("7d");
  const [isSynthetic, setIsSynthetic] = useState(false);

  useEffect(() => {
    fetch(`/api/markets/${marketId}/price-history?range=${range}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d.data ?? []);
        setIsSynthetic(d.synthetic ?? false);
      })
      .catch(() => {});
  }, [marketId, range]);

  useEffect(() => {
    if (!data.length || !svgRef.current) return;

    const el = svgRef.current;
    const width = el.clientWidth || 600;
    const height = el.clientHeight || 200;
    const margin = { top: 10, right: 12, bottom: 24, left: 32 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    d3.select(el).selectAll("*").remove();

    const svg = d3
      .select(el)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const parsed = data.map((d) => ({
      ...d,
      date: new Date(d.recorded_at),
      yes: d.yes_price,
    }));

    const xScale = d3
      .scaleTime()
      .domain(d3.extent(parsed, (d) => d.date) as [Date, Date])
      .range([0, innerW]);

    const yScale = d3.scaleLinear().domain([0, 1]).range([innerH, 0]);

    // Gradients
    const defs = d3.select(el).append("defs");
    const yesGradId = `yes-grad-${marketId.replace(/-/g, "")}`;
    const yesGrad = defs
      .append("linearGradient")
      .attr("id", yesGradId)
      .attr("x1", "0")
      .attr("x2", "0")
      .attr("y1", "0")
      .attr("y2", "1");
    yesGrad
      .append("stop")
      .attr("offset", "0%")
      .attr("stop-color", "#22c55e")
      .attr("stop-opacity", 0.3);
    yesGrad
      .append("stop")
      .attr("offset", "100%")
      .attr("stop-color", "#22c55e")
      .attr("stop-opacity", 0);

    // Grid lines
    svg
      .append("g")
      .attr("class", "grid")
      .call(
        d3.axisLeft(yScale).ticks(4).tickSize(-innerW).tickFormat(() => "")
      )
      .call((g) => g.select(".domain").remove())
      .call((g) => g.selectAll("line").attr("stroke", "#ffffff08"));

    // 50% reference line
    svg
      .append("line")
      .attr("x1", 0)
      .attr("x2", innerW)
      .attr("y1", yScale(0.5))
      .attr("y2", yScale(0.5))
      .attr("stroke", "#ffffff15")
      .attr("stroke-dasharray", "4,4");

    // Area + line generators
    const yesArea = d3
      .area<(typeof parsed)[0]>()
      .x((d) => xScale(d.date))
      .y0(innerH)
      .y1((d) => yScale(d.yes))
      .curve(d3.curveCatmullRom);

    const yesLine = d3
      .line<(typeof parsed)[0]>()
      .x((d) => xScale(d.date))
      .y((d) => yScale(d.yes))
      .curve(d3.curveCatmullRom);

    // Area fill
    svg.append("path").datum(parsed).attr("fill", `url(#${yesGradId})`).attr("d", yesArea);

    // Line with draw animation
    const yesPath = svg
      .append("path")
      .datum(parsed)
      .attr("fill", "none")
      .attr("stroke", "#22c55e")
      .attr("stroke-width", 2)
      .attr("d", yesLine);

    const yesLen = (yesPath.node() as SVGPathElement | null)?.getTotalLength() ?? 0;
    yesPath
      .attr("stroke-dasharray", yesLen)
      .attr("stroke-dashoffset", yesLen)
      .transition()
      .duration(800)
      .ease(d3.easeCubicOut)
      .attr("stroke-dashoffset", 0);

    // End dot
    const last = parsed[parsed.length - 1];
    svg
      .append("circle")
      .attr("cx", xScale(last.date))
      .attr("cy", yScale(last.yes))
      .attr("r", 4)
      .attr("fill", "#22c55e")
      .attr("stroke", "#0e0c18")
      .attr("stroke-width", 2);

    // X axis
    svg
      .append("g")
      .attr("transform", `translate(0,${innerH})`)
      .call(
        d3
          .axisBottom(xScale)
          .ticks(4)
          .tickFormat(d3.timeFormat("%b %d") as (value: Date | d3.NumberValue, i: number) => string)
      )
      .call((g) => g.select(".domain").remove())
      .call((g) => g.selectAll("text").attr("fill", "#55556a").attr("font-size", "10px"))
      .call((g) => g.selectAll("line").remove());

    // Y axis
    svg
      .append("g")
      .call(
        d3
          .axisLeft(yScale)
          .ticks(4)
          .tickFormat((d) => `${Math.round(+d * 100)}¢`)
      )
      .call((g) => g.select(".domain").remove())
      .call((g) => g.selectAll("text").attr("fill", "#55556a").attr("font-size", "10px"))
      .call((g) => g.selectAll("line").remove());

    // Crosshair tooltip
    const tooltip = svg.append("g").attr("opacity", 0);
    const tooltipLine = tooltip
      .append("line")
      .attr("stroke", "#ffffff30")
      .attr("stroke-width", 1)
      .attr("y1", 0)
      .attr("y2", innerH);
    const tooltipCircle = tooltip
      .append("circle")
      .attr("r", 4)
      .attr("fill", "#22c55e")
      .attr("stroke", "#0e0c18")
      .attr("stroke-width", 2);
    const tooltipBg = tooltip
      .append("rect")
      .attr("rx", 4)
      .attr("fill", "#15112a")
      .attr("stroke", "#ffffff1a")
      .attr("stroke-width", 1);
    const tooltipText = tooltip
      .append("text")
      .attr("fill", "#f0f0f5")
      .attr("font-size", "11px")
      .attr("font-weight", "600");
    const tooltipSub = tooltip
      .append("text")
      .attr("fill", "#8888a0")
      .attr("font-size", "9px");

    svg
      .append("rect")
      .attr("width", innerW)
      .attr("height", innerH)
      .attr("fill", "transparent")
      .on("mousemove", function (event) {
        const [mx] = d3.pointer(event);
        const date = xScale.invert(mx);
        const bisect = d3.bisector((d: (typeof parsed)[0]) => d.date).left;
        const idx = Math.min(bisect(parsed, date), parsed.length - 1);
        const d = parsed[idx];
        if (!d) return;

        const cx = xScale(d.date);
        const cy = yScale(d.yes);
        const tw = 80;
        const offset = cx + tw + 16 > innerW ? -tw - 16 : 8;

        tooltipLine.attr("x1", cx).attr("x2", cx);
        tooltipCircle.attr("cx", cx).attr("cy", cy);
        tooltipBg.attr("x", cx + offset - 4).attr("y", cy - 22).attr("width", tw).attr("height", 32);
        tooltipText.attr("x", cx + offset).attr("y", cy - 8).text(`${Math.round(d.yes * 100)}¢ YES`);
        tooltipSub
          .attr("x", cx + offset)
          .attr("y", cy + 4)
          .text(new Date(d.recorded_at).toLocaleDateString());

        tooltip.attr("opacity", 1);
      })
      .on("mouseleave", () => tooltip.attr("opacity", 0));
  }, [data, marketId]);

  return (
    <div className="w-full">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-yes">
            YES {Math.round(currentYesPrice * 100)}¢
          </span>
          <span className="text-xs font-semibold text-no">
            NO {Math.round(currentNoPrice * 100)}¢
          </span>
          {isSynthetic && (
            <span className="text-[9px] text-text-faint">estimated</span>
          )}
        </div>
        <div className="flex gap-1">
          {["1d", "7d", "30d", "all"].map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
                range === r
                  ? "bg-caldera/20 text-caldera"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      <svg ref={svgRef} className="h-[180px] w-full" />
    </div>
  );
}
