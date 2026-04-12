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

  const prevPriceRef = useRef<number | null>(null);
  const prevAboveRef = useRef<boolean | null>(null);
  const onPriceUpdateRef = useRef(onPriceUpdate);
  onPriceUpdateRef.current = onPriceUpdate;

  // ── SSE subscription ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!SUPPORTED_TICKERS.has(ticker)) return;
    setData([]);
    prevPriceRef.current = null;
    prevAboveRef.current = null;

    const es = new EventSource(`/api/crypto/stream?ticker=${ticker}`);

    es.onmessage = (e) => {
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
          return next.length > 300 ? next.slice(-300) : next;
        });
      } catch { /* ignore */ }
    };

    es.onerror = () => { /* auto-reconnects */ };
    return () => es.close();
  }, [ticker, targetPrice]);

  // ── Single D3 render effect ────────────────────────────────────────────────
  useEffect(() => {
    if (!svgRef.current || !containerRef.current || data.length < 1) return;

    const el = svgRef.current;
    const totalWidth = containerRef.current.clientWidth || 600;
    const totalHeight = 280;
    const W = totalWidth - M.left - M.right;
    const H = totalHeight - M.top - M.bottom;

    const svg = d3.select(el);
    svg.selectAll('*').remove();
    svg.attr('width', totalWidth).attr('height', totalHeight);

    const last = data[data.length - 1];
    const isAbove = last.price > targetPrice;

    // Background tint
    svg.append('rect')
      .attr('width', totalWidth).attr('height', totalHeight).attr('rx', 12)
      .attr('fill', isAbove ? 'rgba(34,197,94,0.04)' : 'rgba(239,68,68,0.04)');

    // Defs: gradient + glow
    const defs = svg.append('defs');
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

    defs.append('style').text(`
      @keyframes pulse-ring {
        0%   { r: 6px;  opacity: 0.7; }
        100% { r: 14px; opacity: 0; }
      }
      .pulse-ring { animation: pulse-ring 1.5s ease-out infinite; }
    `);

    const g = svg.append('g').attr('transform', `translate(${M.left},${M.top})`);

    // Y scale — tight auto-range
    const prices = data.map(d => d.price);
    const dataMin = Math.min(...prices, targetPrice);
    const dataMax = Math.max(...prices, targetPrice);
    const dataRange = Math.max(dataMax - dataMin, targetPrice * 0.0008);
    const pad = dataRange * 0.5;
    const yScale = d3.scaleLinear().domain([dataMin - pad, dataMax + pad]).range([H, 0]);

    // X scale
    const xDomain: [Date, Date] = data.length < 2
      ? [new Date(data[0].time.getTime() - 120_000), new Date(data[0].time.getTime() + 60_000)]
      : d3.extent(data, d => d.time) as [Date, Date];
    const xScale = d3.scaleTime().domain(xDomain).range([0, W]);

    // Grid
    g.append('g').selectAll('line')
      .data(yScale.ticks(4)).join('line')
      .attr('x1', 0).attr('x2', W)
      .attr('y1', d => yScale(d)).attr('y2', d => yScale(d))
      .attr('stroke', 'rgba(255,255,255,0.05)').attr('stroke-width', 1);

    // ±0.1% target band
    const bandY1 = yScale(targetPrice * 1.001);
    const bandY2 = yScale(targetPrice * 0.999);
    g.append('rect').attr('x', 0).attr('width', W)
      .attr('y', Math.max(0, bandY1))
      .attr('height', Math.max(0, Math.min(H, bandY2) - Math.max(0, bandY1)))
      .attr('fill', 'rgba(255,255,255,0.04)');

    // Target dashed line
    const targetY = yScale(targetPrice);
    g.append('line')
      .attr('x1', 0).attr('x2', W)
      .attr('y1', targetY).attr('y2', targetY)
      .attr('stroke', 'rgba(255,255,255,0.4)').attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '6,4');

    // Target label
    const fmt = targetPrice < 1
      ? targetPrice.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
      : targetPrice.toLocaleString('en-US', { maximumFractionDigits: 0 });
    g.append('text')
      .attr('x', W + 8).attr('y', targetY + 4)
      .attr('fill', 'rgba(255,255,255,0.4)')
      .attr('font-size', 10).attr('font-family', 'monospace')
      .text(`$${fmt}`);

    // Line + area generators
    const lineGen = d3.line<DataPoint>()
      .x(d => xScale(d.time)).y(d => yScale(d.price)).curve(d3.curveMonotoneX);
    const areaGen = d3.area<DataPoint>()
      .x(d => xScale(d.time)).y0(H).y1(d => yScale(d.price)).curve(d3.curveMonotoneX);

    // Area fill
    g.append('path').datum(data)
      .attr('fill', `url(#${gradId})`)
      .attr('d', areaGen);

    // Price line
    g.append('path').datum(data)
      .attr('fill', 'none')
      .attr('stroke', '#f59e0b').attr('stroke-width', 2.5).attr('stroke-linejoin', 'round')
      .attr('d', lineGen);

    // Dot at last point
    const cx = xScale(last.time);
    const cy = yScale(last.price);

    // Pulse ring
    g.append('circle').attr('class', 'pulse-ring')
      .attr('cx', cx).attr('cy', cy)
      .attr('r', 6).attr('fill', 'none')
      .attr('stroke', '#f59e0b').attr('stroke-width', 1.5).attr('opacity', 0.7);

    // Halo
    g.append('circle')
      .attr('cx', cx).attr('cy', cy)
      .attr('r', 9).attr('fill', 'rgba(245,158,11,0.15)');

    // Core dot
    g.append('circle')
      .attr('cx', cx).attr('cy', cy)
      .attr('r', 5).attr('fill', '#f59e0b')
      .attr('stroke', '#0a0a0a').attr('stroke-width', 2)
      .attr('filter', `url(#glow-${ticker})`);

    // Price badge
    const priceTxt = `$${last.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const badgeW = priceTxt.length * 7.8 + 10;
    const bx = W + 6;
    const by = cy - 11;
    const badge = g.append('g');
    badge.append('rect').attr('x', bx).attr('y', by).attr('width', badgeW).attr('height', 22)
      .attr('rx', 4).attr('fill', '#f59e0b');
    badge.append('text').attr('x', bx + 5).attr('y', by + 14)
      .attr('fill', '#0a0a0a').attr('font-size', 11).attr('font-weight', 700).attr('font-family', 'monospace')
      .text(priceTxt);

    // X axis
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
    g.append('g').attr('transform', `translate(0,${H})`).call(xAxis)
      .call(ax => ax.select('.domain').remove())
      .call(ax => ax.selectAll('line').attr('stroke', 'rgba(255,255,255,0.08)'))
      .call(ax => ax.selectAll('text')
        .attr('fill', 'rgba(255,255,255,0.3)')
        .attr('font-size', 9).attr('font-family', 'monospace'));
  }, [data, targetPrice, ticker]);

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
