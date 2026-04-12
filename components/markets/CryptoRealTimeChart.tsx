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

export function CryptoRealTimeChart({ ticker, targetPrice, onPriceUpdate }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<DataPoint[]>([]);
  // Flash state: 'above' | 'below' | null — triggered when price crosses target
  const [crossFlash, setCrossFlash] = useState<'above' | 'below' | null>(null);
  const prevPriceRef = useRef<number | null>(null);
  const prevAboveRef = useRef<boolean | null>(null);
  const onPriceUpdateRef = useRef(onPriceUpdate);
  onPriceUpdateRef.current = onPriceUpdate;

  // SSE subscription — 1-second updates via /api/crypto/stream
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

        // Detect target line crossing
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

  // D3 render on data change
  useEffect(() => {
    if (!svgRef.current || !containerRef.current || data.length < 1) return;

    const svg = d3.select(svgRef.current);
    const totalWidth = containerRef.current.clientWidth || 600;
    const totalHeight = containerRef.current.clientHeight || 240;
    const margin = { top: 16, right: 84, bottom: 28, left: 8 };
    const W = totalWidth - margin.left - margin.right;
    const H = totalHeight - margin.top - margin.bottom;

    svg.attr('width', totalWidth).attr('height', totalHeight);
    svg.selectAll('*').remove();

    const last = data[data.length - 1];
    const isAbove = last.price > targetPrice;

    // Background tint (regular) + cross-flash handled via CSS class on container
    svg.append('rect')
      .attr('width', totalWidth).attr('height', totalHeight)
      .attr('rx', 12)
      .attr('fill', isAbove ? 'rgba(34,197,94,0.04)' : 'rgba(239,68,68,0.04)');

    // (a) Inject CSS keyframe for pulse animation
    svg.append('defs').append('style').text(`
      @keyframes pulse-ring {
        0%   { r: 6px;  opacity: 0.75; }
        100% { r: 15px; opacity: 0; }
      }
      .pulse-ring { animation: pulse-ring 1.5s ease-out infinite; }
      @keyframes cross-flash-above {
        0%   { opacity: 1; }
        100% { opacity: 0; }
      }
      @keyframes cross-flash-below {
        0%   { opacity: 1; }
        100% { opacity: 0; }
      }
    `);

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    // (c) Tight Y scale: ±0.5% around target
    const yPad = targetPrice * 0.005;
    const prices = data.map(d => d.price);
    const yMin = Math.min(d3.min(prices) as number, targetPrice - yPad);
    const yMax = Math.max(d3.max(prices) as number, targetPrice + yPad);
    const yScale = d3.scaleLinear().domain([yMin, yMax]).range([H, 0]).nice();
    // With a single point d3.extent returns [t, t] — degenerate scale. Use a 2-min window instead.
    const xDomain: [Date, Date] = data.length < 2
      ? [new Date(data[0].time.getTime() - 120_000), new Date(data[0].time.getTime() + 60_000)]
      : d3.extent(data, d => d.time) as [Date, Date];
    const xScale = d3.scaleTime().domain(xDomain).range([0, W]);

    const defs = svg.select('defs');

    // Gradient fill
    const gradId = `cg-${ticker}`;
    const grad = defs.append('linearGradient')
      .attr('id', gradId).attr('gradientUnits', 'userSpaceOnUse')
      .attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', H);
    grad.append('stop').attr('offset', '0%').attr('stop-color', '#f59e0b').attr('stop-opacity', 0.22);
    grad.append('stop').attr('offset', '100%').attr('stop-color', '#f59e0b').attr('stop-opacity', 0);

    // Glow filter
    const filter = defs.append('filter')
      .attr('id', `glow-${ticker}`)
      .attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%');
    filter.append('feGaussianBlur').attr('stdDeviation', 3.5).attr('result', 'coloredBlur');
    const merge = filter.append('feMerge');
    merge.append('feMergeNode').attr('in', 'coloredBlur');
    merge.append('feMergeNode').attr('in', 'SourceGraphic');

    // Subtle grid
    g.selectAll('.grid-line')
      .data(yScale.ticks(4))
      .join('line')
      .attr('x1', 0).attr('x2', W)
      .attr('y1', d => yScale(d)).attr('y2', d => yScale(d))
      .attr('stroke', 'rgba(255,255,255,0.05)').attr('stroke-width', 1);

    // (f) ±0.1% band around target price
    const bandHigh = targetPrice * 1.001;
    const bandLow  = targetPrice * 0.999;
    const bandY1 = yScale(bandHigh);
    const bandY2 = yScale(bandLow);
    if (bandY1 < H && bandY2 > 0) {
      g.append('rect')
        .attr('x', 0).attr('y', Math.max(0, bandY1))
        .attr('width', W)
        .attr('height', Math.min(H, bandY2) - Math.max(0, bandY1))
        .attr('fill', 'rgba(255,255,255,0.04)')
        .attr('stroke', 'none');
    }

    // Target price dashed line
    const targetY = yScale(targetPrice);
    g.append('line')
      .attr('x1', 0).attr('x2', W)
      .attr('y1', targetY).attr('y2', targetY)
      .attr('stroke', 'rgba(255,255,255,0.4)')
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '6,4');

    // Target label
    g.append('text')
      .attr('x', W + 8).attr('y', targetY + 4)
      .attr('fill', 'rgba(255,255,255,0.4)')
      .attr('font-size', 10).attr('font-family', 'monospace')
      .text(`$${targetPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })}`);

    // Area fill
    const area = d3.area<DataPoint>()
      .x(d => xScale(d.time)).y0(H).y1(d => yScale(d.price))
      .curve(d3.curveMonotoneX);
    g.append('path').datum(data).attr('fill', `url(#${gradId})`).attr('d', area);

    // Price line
    const line = d3.line<DataPoint>()
      .x(d => xScale(d.time)).y(d => yScale(d.price))
      .curve(d3.curveMonotoneX);
    g.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', '#f59e0b')
      .attr('stroke-width', 2.5)
      .attr('stroke-linejoin', 'round')
      .attr('d', line);

    // (a) Dot at current price with pulsing ring
    const dotX = xScale(last.time);
    const dotY = yScale(last.price);

    // Animated pulse ring (uses CSS @keyframes injected above)
    g.append('circle')
      .attr('class', 'pulse-ring')
      .attr('cx', dotX).attr('cy', dotY)
      .attr('r', 6)
      .attr('fill', 'none')
      .attr('stroke', '#f59e0b')
      .attr('stroke-width', 1.5)
      .attr('opacity', 0.7);

    // Static glow halo
    g.append('circle')
      .attr('cx', dotX).attr('cy', dotY).attr('r', 9)
      .attr('fill', 'rgba(245,158,11,0.15)');

    // Core dot
    g.append('circle')
      .attr('cx', dotX).attr('cy', dotY).attr('r', 5)
      .attr('fill', '#f59e0b')
      .attr('stroke', '#0a0a0a').attr('stroke-width', 2)
      .attr('filter', `url(#glow-${ticker})`);

    // Current price label badge
    const priceTxt = `$${last.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const badgeW = priceTxt.length * 7.8 + 10;
    g.append('rect')
      .attr('x', W + 6).attr('y', dotY - 11)
      .attr('width', badgeW).attr('height', 22)
      .attr('rx', 4).attr('fill', '#f59e0b');
    g.append('text')
      .attr('x', W + 11).attr('y', dotY + 4)
      .attr('fill', '#0a0a0a')
      .attr('font-size', 11).attr('font-weight', 700).attr('font-family', 'monospace')
      .text(priceTxt);

    // (d) X axis — tick every 30 seconds, HH:MM:SS format
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
    g.append('g')
      .attr('transform', `translate(0,${H})`)
      .call(xAxis)
      .call(ax => ax.select('.domain').remove())
      .call(ax => ax.selectAll('line').attr('stroke', 'rgba(255,255,255,0.08)'))
      .call(ax => ax.selectAll('text')
        .attr('fill', 'rgba(255,255,255,0.3)')
        .attr('font-size', 9)
        .attr('font-family', 'monospace'));

  }, [data, targetPrice, ticker]);

  // (e) Cross-flash overlay color
  const flashBg = crossFlash === 'above'
    ? 'rgba(34,197,94,0.18)'
    : crossFlash === 'below'
    ? 'rgba(239,68,68,0.18)'
    : 'transparent';

  return (
    <div ref={containerRef} className="relative w-full" style={{ height: 240 }}>
      {/* (e) Flash overlay on target crossing */}
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
