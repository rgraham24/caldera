import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: market } = await supabase
    .from('markets')
    .select('title, yes_price, category, creator_slug, total_volume')
    .eq('id', id)
    .single();

  if (!market) return new NextResponse('Not found', { status: 404 });

  const yesPrice = Math.round((market.yes_price || 0.5) * 100);
  const noPrice = 100 - yesPrice;
  const category = market.category || 'Market';
  const volume = market.total_volume
    ? '$' + (market.total_volume / 1000000).toFixed(1) + 'M vol'
    : '';

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 600px; height: 314px;
    background: #0a0a0a;
    font-family: -apple-system, sans-serif;
    display: flex; align-items: center; justify-content: center;
    overflow: hidden;
  }
  .card {
    width: 560px; height: 280px;
    background: linear-gradient(135deg, #111 0%, #1a1a1a 100%);
    border: 1px solid #333;
    border-radius: 16px;
    padding: 28px;
    display: flex; flex-direction: column; justify-content: space-between;
  }
  .top { display: flex; justify-content: space-between; align-items: flex-start; }
  .category {
    background: #f97316; color: white;
    font-size: 11px; font-weight: 700; letter-spacing: 0.05em;
    padding: 4px 10px; border-radius: 20px; text-transform: uppercase;
  }
  .logo { color: #f97316; font-size: 18px; font-weight: 800; }
  .title {
    font-size: 22px; font-weight: 700; color: white;
    line-height: 1.3; margin: 16px 0;
    max-height: 80px; overflow: hidden;
  }
  .bottom { display: flex; align-items: center; gap: 12px; }
  .yes-btn {
    background: #22c55e; color: white;
    font-size: 16px; font-weight: 800;
    padding: 10px 20px; border-radius: 10px;
  }
  .no-btn {
    background: #3f3f46; color: #a1a1aa;
    font-size: 16px; font-weight: 700;
    padding: 10px 20px; border-radius: 10px;
  }
  .volume { color: #71717a; font-size: 13px; margin-left: auto; }
  .token { color: #f97316; font-size: 13px; font-weight: 600; }
</style>
</head>
<body>
<div class="card">
  <div class="top">
    <span class="category">${category}</span>
    <span class="logo">Caldera</span>
  </div>
  <div class="title">${market.title}</div>
  <div class="bottom">
    <span class="yes-btn">YES ${yesPrice}¢</span>
    <span class="no-btn">NO ${noPrice}¢</span>
    ${market.creator_slug ? `<span class="token">$${market.creator_slug}</span>` : ''}
    ${volume ? `<span class="volume">${volume}</span>` : ''}
  </div>
</div>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html' },
  });
}
