'use client';
import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

type DataPoint = { time: Date; price: number };

const COIN_IDS: Record<string, string> = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana',
  LINK: 'chainlink', MATIC: 'matic-network',
};

type Props = {
  ticker: string;
  targetPrice: number;
  onPriceUpdate?: (price: number, change: 'up' | 'down' | null) => void;
};

export function CryptoRealTimeChart({ ticker, targetPrice, onPriceUpdate }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<DataPoint[]>([]);
  const prevPriceRef = useRef<number | null>(null);
  const onPriceUpdateRef = useRef(onPriceUpdate);
  onPriceUpdateRef.current = onPriceUpdate;

  // Poll CoinGecko every 3 seconds
  useEffect(() => {
    const id = COIN_IDS[ticker];
    if (!id) return;

    async function fetchPrice() {
      try {
        const res = await fetch(
          `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`,
          { cache: 'no-store' }
        );
        const json = await res.json();
        const price: number = json[id]?.usd;
        if (!price) return;

        const change: 'up' | 'down' | null =
          prevPriceRef.current !== null
            ? price > prevPriceRef.current ? 'up' : price < prevPriceRef.current ? 'down' : null
            : null;
        prevPriceRef.current = price;

        onPriceUpdateRef.current?.(price, change);
        setData(prev => [...prev, { time: new Date(), price }].slice(-100));
      } catch { /* ignore */ }
    }

    fetchPrice();
    const interval = setInterval(fetchPrice, 3000);
    return () => clearInterval(interval);
  }, [ticker]);

  // D3 render on data change
  useEffect(() => {
    if (!svgRef.current || !containerRef.current || data.length < 2) return;

    const svg = d3.select(svgRef.current);
    const totalWidth = containerRef.current.clientWidth || 600;
    const totalHeight = 300;
    const margin = { top: 16, right: 80, bottom: 28, left: 8 };
    const W = totalWidth - margin.left - margin.right;
    const H = totalHeight - margin.top - margin.bottom;

    svg.attr('width', totalWidth).attr('height', totalHeight);
    svg.selectAll('*').remove();

    const last = data[data.length - 1];
    const isAbove = last.price > targetPrice;

    // Background tint
    svg.append('rect')
      .attr('width', totalWidth).attr('height', totalHeight)
      .attr('rx', 12)
      .attr('fill', isAbove ? 'rgba(34,197,94,0.035)' : 'rgba(239,68,68,0.035)');

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    // Scales
    const yPad = targetPrice * 0.012;
    const prices = data.map(d => d.price);
    const yMin = Math.min(d3.min(prices) as number, targetPrice - yPad);
    const yMax = Math.max(d3.max(prices) as number, targetPrice + yPad);
    const yScale = d3.scaleLinear().domain([yMin, yMax]).range([H, 0]).nice();
    const xExtent = d3.extent(data, d => d.time) as [Date, Date];
    const xScale = d3.scaleTime().domain(xExtent).range([0, W]);

    const defs = svg.append('defs');

    // Gradient fill
    const gradId = `cg-${ticker}`;
    const grad = defs.append('linearGradient')
      .attr('id', gradId).attr('gradientUnits', 'userSpaceOnUse')
      .attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', H);
    grad.append('stop').attr('offset', '0%').attr('stop-color', '#f59e0b').attr('stop-opacity', 0.22);
    grad.append('stop').attr('offset', '100%').attr('stop-color', '#f59e0b').attr('stop-opacity', 0);

    // Glow filter for the dot
    const filter = defs.append('filter').attr('id', `glow-${ticker}`).attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%');
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

    // Target price dashed line
    const targetY = yScale(targetPrice);
    g.append('line')
      .attr('x1', 0).attr('x2', W)
      .attr('y1', targetY).attr('y2', targetY)
      .attr('stroke', 'rgba(255,255,255,0.35)')
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '6,4');

    // Target label
    g.append('text')
      .attr('x', W + 8).attr('y', targetY + 4)
      .attr('fill', 'rgba(255,255,255,0.4)')
      .attr('font-size', 10).attr('font-family', 'monospace')
      .text(`$${targetPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })}`);

    // Area
    const area = d3.area<DataPoint>()
      .x(d => xScale(d.time)).y0(H).y1(d => yScale(d.price))
      .curve(d3.curveMonotoneX);
    g.append('path').datum(data).attr('fill', `url(#${gradId})`).attr('d', area);

    // Line
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

    // Dot at current price
    const dotX = xScale(last.time);
    const dotY = yScale(last.price);

    // Outer glow ring
    g.append('circle')
      .attr('cx', dotX).attr('cy', dotY).attr('r', 9)
      .attr('fill', 'rgba(245,158,11,0.18)')
      .attr('stroke', 'rgba(245,158,11,0.4)')
      .attr('stroke-width', 1);

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

    // X axis — time labels
    const xAxis = d3.axisBottom(xScale)
      .ticks(5)
      .tickFormat(d => {
        const date = d as Date;
        return `${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;
      });
    g.append('g')
      .attr('transform', `translate(0,${H})`)
      .call(xAxis)
      .call(ax => ax.select('.domain').remove())
      .call(ax => ax.selectAll('line').attr('stroke', 'rgba(255,255,255,0.08)'))
      .call(ax => ax.selectAll('text')
        .attr('fill', 'rgba(255,255,255,0.3)')
        .attr('font-size', 10)
        .attr('font-family', 'monospace'));

  }, [data, targetPrice, ticker]);

  return (
    <div ref={containerRef} className="w-full" style={{ height: 300 }}>
      {data.length < 2 ? (
        <div className="flex h-full items-center justify-center text-text-muted text-sm">
          <span className="animate-pulse">Fetching live price data…</span>
        </div>
      ) : (
        <svg ref={svgRef} className="w-full overflow-visible" />
      )}
    </div>
  );
}
