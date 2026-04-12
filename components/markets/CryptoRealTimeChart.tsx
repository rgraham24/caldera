'use client';
import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

type DataPoint = { time: Date; price: number };

const SUPPORTED_TICKERS = new Set(['BTC', 'ETH', 'SOL', 'LINK', 'DOGE']);

type Props = {
  ticker: string;
  targetPrice: number;
  onPriceUpdate?: (price: number, change: 'up' | 'down' | null) => void;
};

const M = { top: 16, right: 84, bottom: 28, left: 8 };

export function CryptoRealTimeChart({ ticker, targetPrice, onPriceUpdate }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<DataPoint[]>([]);
  const [crossFlash, setCrossFlash] = useState<'above' | 'below' | null>(null);

  // D3 element refs — persistent across renders
  const pathRef      = useRef<SVGPathElement | null>(null);
  const areaRef      = useRef<SVGPathElement | null>(null);
  const dotRef       = useRef<SVGCircleElement | null>(null);
  const pulseRef     = useRef<SVGCircleElement | null>(null);
  const badgeGroupRef = useRef<SVGGElement | null>(null);
  const targetLineRef = useRef<SVGLineElement | null>(null);
  const targetLabelRef = useRef<SVGTextElement | null>(null);
  const xAxisRef     = useRef<SVGGElement | null>(null);
  const gridRef      = useRef<SVGGElement | null>(null);
  const initialized  = useRef(false);

  // Upstream callbacks via ref (stable across renders)
  const prevPriceRef = useRef<number | null>(null);
  const prevAboveRef = useRef<boolean | null>(null);
  const onPriceUpdateRef = useRef(onPriceUpdate);
  onPriceUpdateRef.current = onPriceUpdate;

  // ── SSE subscription ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!SUPPORTED_TICKERS.has(ticker)) return;
    const es = new EventSource(`/api/crypto/stream?ticker=${ticker}`);

    es.onmessage = (e) => {
      console.log('[SSE] raw message:', e.data.slice(0, 100));
      try {
        const { price } = JSON.parse(e.data) as { ticker: string; price: number; t: number };
        if (!price) return;

        const change: 'up' | 'down' | null =
          prevPriceRef.current !== null
            ? price > prevPriceRef.current ? 'up' : price < prevPriceRef.current ? 'down' : null
            : null;
        prevPriceRef.current = price;

        const isAboveNow = price > targetPrice;
        if (prevAboveRef.current !== null && prevAboveRef.current !== isAboveNow) {
          setCrossFlash(isAboveNow ? 'above' : 'below');
          setTimeout(() => setCrossFlash(null), 700);
        }
        prevAboveRef.current = isAboveNow;

        onPriceUpdateRef.current?.(price, change);
        setData(prev => {
          const next = [...prev, { time: new Date(), price }];
          const trimmed = next.length > 300 ? next.slice(-300) : next;
          console.log('[chart] received price:', price, 'data points:', trimmed.length);
          return trimmed;
        });
      } catch { /* ignore */ }
    };

    es.onerror = () => { /* auto-reconnects */ };
    return () => es.close();
  }, [ticker, targetPrice]);

  // ── SETUP EFFECT — runs once per ticker (creates persistent SVG structure) ──
  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;
    // Reset when ticker changes
    initialized.current = false;
    setData([]);
    prevPriceRef.current = null;
    prevAboveRef.current = null;

    const el = svgRef.current;
    const totalWidth = containerRef.current.clientWidth || 600;
    const totalHeight = containerRef.current.clientHeight || 280;
    const W = totalWidth - M.left - M.right;
    const H = totalHeight - M.top - M.bottom;

    d3.select(el).selectAll('*').remove();
    d3.select(el).attr('width', totalWidth).attr('height', totalHeight);

    // Defs: gradient + glow filter + pulse keyframe
    const defs = d3.select(el).append('defs');
    defs.append('style').text(`
      @keyframes pulse-ring {
        0%   { r: 6px;  opacity: 0.7; }
        100% { r: 14px; opacity: 0; }
      }
      .pulse-ring { animation: pulse-ring 1.5s ease-out infinite; }
    `);
    const gradId = `cg-${ticker}`;
    const grad = defs.append('linearGradient')
      .attr('id', gradId).attr('gradientUnits', 'userSpaceOnUse')
      .attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', H);
    grad.append('stop').attr('offset', '0%').attr('stop-color', '#f59e0b').attr('stop-opacity', 0.22);
    grad.append('stop').attr('offset', '100%').attr('stop-color', '#f59e0b').attr('stop-opacity', 0);
    const filter = defs.append('filter').attr('id', `glow-${ticker}`)
      .attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%');
    filter.append('feGaussianBlur').attr('stdDeviation', 3.5).attr('result', 'coloredBlur');
    const merge = filter.append('feMerge');
    merge.append('feMergeNode').attr('in', 'coloredBlur');
    merge.append('feMergeNode').attr('in', 'SourceGraphic');

    // Background tint rect (updated by data effect)
    d3.select(el).append('rect').attr('class', 'bg-tint')
      .attr('width', totalWidth).attr('height', totalHeight).attr('rx', 12)
      .attr('fill', 'rgba(239,68,68,0.04)');

    const g = d3.select(el).append('g').attr('transform', `translate(${M.left},${M.top})`);

    // Grid
    gridRef.current = g.append('g').attr('class', 'grid').node();

    // ±0.1% target band
    g.append('rect').attr('class', 'target-band')
      .attr('x', 0).attr('width', W)
      .attr('fill', 'rgba(255,255,255,0.04)').attr('stroke', 'none');

    // Target dashed line
    targetLineRef.current = g.append('line').attr('class', 'target-line')
      .attr('x1', 0).attr('x2', W)
      .attr('stroke', 'rgba(255,255,255,0.4)').attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '6,4').node();

    // Target label
    targetLabelRef.current = g.append('text').attr('class', 'target-label')
      .attr('x', W + 8).attr('fill', 'rgba(255,255,255,0.4)')
      .attr('font-size', 10).attr('font-family', 'monospace').node();

    // Area fill path
    areaRef.current = g.append('path').attr('class', 'area-path')
      .attr('fill', `url(#${gradId})`).node();

    // Price line path
    pathRef.current = g.append('path').attr('class', 'price-path')
      .attr('fill', 'none').attr('stroke', '#f59e0b')
      .attr('stroke-width', 2.5).attr('stroke-linejoin', 'round').node();

    // Pulse ring (CSS animated)
    pulseRef.current = g.append('circle').attr('class', 'pulse-ring')
      .attr('r', 6).attr('fill', 'none')
      .attr('stroke', '#f59e0b').attr('stroke-width', 1.5).attr('opacity', 0).node();

    // Glow halo
    g.append('circle').attr('class', 'dot-halo')
      .attr('r', 9).attr('fill', 'rgba(245,158,11,0.15)');

    // Core dot
    dotRef.current = g.append('circle').attr('class', 'dot-core')
      .attr('r', 5).attr('fill', '#f59e0b')
      .attr('stroke', '#0a0a0a').attr('stroke-width', 2)
      .attr('filter', `url(#glow-${ticker})`).node();

    // Price badge group
    badgeGroupRef.current = g.append('g').attr('class', 'price-badge').node();
    const bg = d3.select(badgeGroupRef.current);
    bg.append('rect').attr('rx', 4).attr('fill', '#f59e0b');
    bg.append('text').attr('fill', '#0a0a0a')
      .attr('font-size', 11).attr('font-weight', 700).attr('font-family', 'monospace');

    // X axis
    xAxisRef.current = g.append('g').attr('class', 'x-axis')
      .attr('transform', `translate(0,${H})`).node();

    initialized.current = true;
  }, [ticker]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── DATA UPDATE EFFECT — animates path/dot/axes on every new point ──────────
  useEffect(() => {
    if (!svgRef.current || !containerRef.current || !initialized.current || data.length < 1) return;

    const el = svgRef.current;
    const totalWidth = containerRef.current.clientWidth || 600;
    const totalHeight = containerRef.current.clientHeight || 280;
    const W = totalWidth - M.left - M.right;
    const H = totalHeight - M.top - M.bottom;

    const last = data[data.length - 1];
    const isAbove = last.price > targetPrice;

    // Background tint
    d3.select(el).select('.bg-tint')
      .attr('fill', isAbove ? 'rgba(34,197,94,0.04)' : 'rgba(239,68,68,0.04)');

    // Y scale — auto-range from data
    const prices = data.map(d => d.price);
    const dataMin = Math.min(...prices, targetPrice);
    const dataMax = Math.max(...prices, targetPrice);
    const dataRange = Math.max(dataMax - dataMin, targetPrice * 0.001);
    const pad = dataRange * 0.4;
    const yScale = d3.scaleLinear().domain([dataMin - pad, dataMax + pad]).range([H, 0]);

    // X scale
    const xDomain: [Date, Date] = data.length < 2
      ? [new Date(data[0].time.getTime() - 120_000), new Date(data[0].time.getTime() + 60_000)]
      : d3.extent(data, d => d.time) as [Date, Date];
    const xScale = d3.scaleTime().domain(xDomain).range([0, W]);

    // Grid
    if (gridRef.current) {
      d3.select(gridRef.current).selectAll('line')
        .data(yScale.ticks(4)).join('line')
        .attr('x1', 0).attr('x2', W)
        .attr('y1', d => yScale(d)).attr('y2', d => yScale(d))
        .attr('stroke', 'rgba(255,255,255,0.05)').attr('stroke-width', 1);
    }

    // Target band
    const bandY1 = yScale(targetPrice * 1.001);
    const bandY2 = yScale(targetPrice * 0.999);
    const g = d3.select(el).select<SVGGElement>('g');
    g.select('.target-band')
      .attr('y', Math.max(0, bandY1))
      .attr('height', Math.max(0, Math.min(H, bandY2) - Math.max(0, bandY1)));

    // Target line + label
    const targetY = yScale(targetPrice);
    if (targetLineRef.current) {
      d3.select(targetLineRef.current).attr('y1', targetY).attr('y2', targetY);
    }
    if (targetLabelRef.current) {
      const fmt = targetPrice < 1
        ? targetPrice.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
        : targetPrice.toLocaleString('en-US', { maximumFractionDigits: 0 });
      d3.select(targetLabelRef.current).attr('y', targetY + 4).text(`$${fmt}`);
    }

    // Line + area generators
    const lineGen = d3.line<DataPoint>()
      .x(d => xScale(d.time)).y(d => yScale(d.price)).curve(d3.curveMonotoneX);
    const areaGen = d3.area<DataPoint>()
      .x(d => xScale(d.time)).y0(H).y1(d => yScale(d.price)).curve(d3.curveMonotoneX);

    // Animate path update
    if (pathRef.current) {
      d3.select(pathRef.current)
        .transition().duration(250).ease(d3.easeLinear)
        .attr('d', lineGen(data) ?? '');
    }
    if (areaRef.current) {
      d3.select(areaRef.current)
        .transition().duration(250).ease(d3.easeLinear)
        .attr('d', areaGen(data) ?? '');
    }

    // Animate dot
    const cx = xScale(last.time);
    const cy = yScale(last.price);
    if (dotRef.current) {
      d3.select(dotRef.current)
        .transition().duration(250).ease(d3.easeLinear)
        .attr('cx', cx).attr('cy', cy);
    }
    // Halo (no transition needed — follows dot)
    g.select('.dot-halo').attr('cx', cx).attr('cy', cy);

    // Pulse ring
    if (pulseRef.current) {
      d3.select(pulseRef.current)
        .attr('cx', cx).attr('cy', cy).attr('opacity', 0.7);
    }

    // Price badge
    if (badgeGroupRef.current) {
      const priceTxt = `$${last.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      const badgeW = priceTxt.length * 7.8 + 10;
      const bx = W + 6;
      const by = cy - 11;
      d3.select(badgeGroupRef.current).select('rect')
        .attr('x', bx).attr('y', by).attr('width', badgeW).attr('height', 22);
      d3.select(badgeGroupRef.current).select('text')
        .attr('x', bx + 5).attr('y', by + 14).text(priceTxt);
    }

    // X axis
    if (xAxisRef.current) {
      const xAxis = d3.axisBottom(xScale)
        .ticks(d3.timeSecond.every(30))
        .tickFormat(d => {
          const date = d as Date;
          return [
            date.getHours().toString().padStart(2, '0'),
            date.getMinutes().toString().padStart(2, '0'),
            date.getSeconds().toString().padStart(2, '0'),
          ].join(':');
        });
      d3.select(xAxisRef.current).call(xAxis)
        .call(ax => ax.select('.domain').remove())
        .call(ax => ax.selectAll('line').attr('stroke', 'rgba(255,255,255,0.08)'))
        .call(ax => ax.selectAll('text')
          .attr('fill', 'rgba(255,255,255,0.3)')
          .attr('font-size', 9).attr('font-family', 'monospace'));
    }
  }, [data, targetPrice]);

  // Flash overlay
  const flashBg = crossFlash === 'above'
    ? 'rgba(34,197,94,0.18)'
    : crossFlash === 'below'
    ? 'rgba(239,68,68,0.18)'
    : 'transparent';

  return (
    <div ref={containerRef} className="relative w-full" style={{ height: 280 }}>
      <div
        className="pointer-events-none absolute inset-0 rounded-xl transition-colors duration-700"
        style={{ background: flashBg }}
      />
      {data.length < 1 ? (
        <div className="flex h-full items-center justify-center text-text-muted text-sm">
          <span className="animate-pulse">Fetching live price data…</span>
        </div>
      ) : (
        <svg ref={svgRef} className="w-full overflow-visible" />
      )}
    </div>
  );
}
