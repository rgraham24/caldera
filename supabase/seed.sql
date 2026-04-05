-- Caldera Phase 1 — Seed Data (Celebrity/Creator + Crypto + Sports)

-- ===================== USERS =====================
insert into users (id, username, display_name, bio, avatar_url, deso_public_key, is_verified, is_admin, reputation_score, follower_count_cached) values
  ('a1000000-0000-0000-0000-000000000001', 'satoshi_trades', 'Satoshi Trades', 'Full-time crypto trader. Early BTC maxi turned prediction market degen.', 'https://api.dicebear.com/7.x/avataaars/svg?seed=satoshi', 'BC1YLhKwSSB5grMhvPfZ6kDJMKNqmFSJAbTbWR8vLo3bqnrJZwJFt3B', true, true, 94.5, 12400),
  ('a1000000-0000-0000-0000-000000000002', 'crypto_queen', 'Crypto Queen', 'DeFi analyst. Building in public. She/her.', 'https://api.dicebear.com/7.x/avataaars/svg?seed=queen', 'BC1YLj3vEqmKcKxX9WNqzFqPkzfG5y8C1tUdFMi7LEdEbxH5vknZxFk', true, false, 88.2, 8900),
  ('a1000000-0000-0000-0000-000000000003', 'drama_detective', 'Drama Detective', 'Internet culture expert. I predict the drama before it happens.', 'https://api.dicebear.com/7.x/avataaars/svg?seed=drama', null, false, false, 76.8, 3200),
  ('a1000000-0000-0000-0000-000000000004', 'defi_degen', 'DeFi Degen', 'Ape first, ask questions later. NFA.', 'https://api.dicebear.com/7.x/avataaars/svg?seed=degen', null, false, false, 65.3, 1800),
  ('a1000000-0000-0000-0000-000000000005', 'culture_vulture', 'Culture Vulture', 'Pop culture junkie. If its trending, Im trading it.', 'https://api.dicebear.com/7.x/avataaars/svg?seed=vulture', null, true, false, 82.1, 5600),
  ('a1000000-0000-0000-0000-000000000006', 'whale_watcher', 'Whale Watcher', 'On-chain analysis. Watching the whales so you dont have to.', 'https://api.dicebear.com/7.x/avataaars/svg?seed=whale', null, false, false, 71.4, 2100),
  ('a1000000-0000-0000-0000-000000000007', 'streaming_oracle', 'Streaming Oracle', '73% accuracy on creator markets. Data-driven predictions.', 'https://api.dicebear.com/7.x/avataaars/svg?seed=oracle', null, true, false, 91.0, 9800),
  ('a1000000-0000-0000-0000-000000000008', 'eth_maxi', 'ETH Maxi', 'Ethereum is the world computer. Everything else is a testnet.', 'https://api.dicebear.com/7.x/avataaars/svg?seed=ethmaxi', null, false, false, 59.7, 1200),
  ('a1000000-0000-0000-0000-000000000009', 'alpha_hunter', 'Alpha Hunter', 'Finding alpha in prediction markets before everyone else.', 'https://api.dicebear.com/7.x/avataaars/svg?seed=alpha', null, false, false, 85.6, 6700),
  ('a1000000-0000-0000-0000-000000000010', 'meme_lord', 'Meme Lord', 'Trading memes into money. Creator economy is the future.', 'https://api.dicebear.com/7.x/avataaars/svg?seed=meme', null, true, false, 79.3, 4100);

-- ===================== CREATORS (Real DeSo prices as of April 2026) =====================
insert into creators (id, user_id, name, slug, image_url, deso_public_key, is_verified, creator_coin_symbol, creator_coin_price, creator_coin_market_cap, creator_coin_holders, category, total_coins_in_circulation, total_fees_distributed, deso_username) values
  ('b1000000-0000-0000-0000-000000000001', null, 'Kai Cenat', 'kai-cenat', null, null, true, 'KAICENAT', 0.00, 0, 1, 'entertainment', 0, 0, 'KaiCenat'),
  ('b1000000-0000-0000-0000-000000000002', null, 'MrBeast', 'mrbeast', null, null, true, 'MRBEAST', 1.72, 15, 9, 'entertainment', 9, 0, 'mrbeast'),
  ('b1000000-0000-0000-0000-000000000003', null, 'Pokimane', 'pokimane', null, null, true, 'POKIMANE', 0.03, 0, 2, 'entertainment', 2, 0, 'pokimane'),
  ('b1000000-0000-0000-0000-000000000004', null, 'xQc', 'xqc', null, null, true, 'XQC', 13.02, 351, 27, 'entertainment', 27, 0, 'xQc'),
  ('b1000000-0000-0000-0000-000000000005', null, 'IShowSpeed', 'ishowspeed', null, null, true, 'ISHOWSPEED', 0.27, 1, 2, 'entertainment', 2, 0, 'IShowSpeed'),
  ('b1000000-0000-0000-0000-000000000006', null, 'Adin Ross', 'adin-ross', null, null, false, 'ADINROSS', 0.00, 0, 0, 'entertainment', 0, 0, null),
  ('b1000000-0000-0000-0000-000000000007', null, 'Logan Paul', 'logan-paul', null, null, true, 'LOGANPAUL', 43.79, 68838, 1573, 'entertainment', 1573, 5600, 'loganpaul'),
  ('b1000000-0000-0000-0000-000000000008', null, 'Asmongold', 'asmongold', null, null, true, 'ASMONGOLD', 0.00, 0, 0, 'entertainment', 0, 0, null),
  ('b1000000-0000-0000-0000-000000000009', null, 'Ice Spice', 'ice-spice', null, null, true, 'ICESPICE', 0.00, 0, 0, 'entertainment', 0, 0, null),
  ('b1000000-0000-0000-0000-000000000010', null, 'Charli DAmelio', 'charli-damelio', null, null, true, 'CHARLIDAMELIO', 34.31, 4869, 142, 'entertainment', 142, 1650, 'charlidamelio'),
  ('b1000000-0000-0000-0000-000000000011', null, 'Tiger Woods', 'tiger-woods', null, null, true, 'TIGERWOODS', 47.47, 1139, 24, 'sports', 24, 7800, 'tigerwoods'),
  ('b1000000-0000-0000-0000-000000000012', null, 'Blake Lively', 'blake-lively', null, null, true, 'BLAKELIVELY', 14.23, 71, 5, 'entertainment', 5, 0, 'blakelively'),
  ('b1000000-0000-0000-0000-000000000013', null, 'Diddy', 'diddy', null, null, false, 'DIDDY', 24.16, 386, 16, 'entertainment', 16, 0, 'diddy'),
  ('b1000000-0000-0000-0000-000000000014', null, 'Lionel Messi', 'lionel-messi', null, null, true, 'LIONELMESSI', 0.84, 5, 6, 'sports', 6, 0, 'lionelmessi'),
  ('b1000000-0000-0000-0000-000000000015', null, 'Clavicular', 'clavicular', null, null, false, 'CLAVICULAR', 0.00, 0, 0, 'entertainment', 0, 0, null),
  ('b1000000-0000-0000-0000-000000000016', null, 'Elon Musk', 'elon-musk', null, null, true, 'ELONMUSK', 188.79, 1831062, 9702, 'tech', 9702, 22400, 'elonmusk'),
  ('b1000000-0000-0000-0000-000000000017', null, 'Jake Paul', 'jake-paul', null, null, true, 'JAKEPAUL', 49.96, 49562, 992, 'entertainment', 992, 3100, 'jakepaul'),
  ('b1000000-0000-0000-0000-000000000018', null, 'LeBron James', 'lebron-james', null, null, true, 'LEBRONJAMES', 0.51, 7, 14, 'sports', 14, 0, 'lebronjames'),
  ('b1000000-0000-0000-0000-000000000019', null, 'Patrick Mahomes', 'patrick-mahomes', null, null, true, 'PATRICKMAHOMES', 13.31, 439, 33, 'sports', 33, 0, 'PatrickMahomes'),
  ('b1000000-0000-0000-0000-000000000020', null, 'dharmesh', 'dharmesh', null, null, false, 'DHARMESH', 665.14, 1536853, 2311, 'tech', 2311, 0, 'dharmesh'),
  ('b1000000-0000-0000-0000-000000000021', null, 'diamondhands', 'diamondhands', null, null, false, 'DIAMONDHANDS', 348.58, 1218594, 3492, 'tech', 3492, 0, 'diamondhands'),
  ('b1000000-0000-0000-0000-000000000022', null, 'Avenged Sevenfold', 'avenged-sevenfold', null, null, false, 'A7X', 196.49, 23381, 119, 'entertainment', 119, 0, 'AvengedSevenfold'),
  ('b1000000-0000-0000-0000-000000000023', null, 'Alex Rodriguez', 'arod', null, null, false, 'AROD', 196.34, 5105, 26, 'sports', 26, 0, 'arod'),
  ('b1000000-0000-0000-0000-000000000024', null, 'CZ Binance', 'cz-binance', null, null, false, 'CZBINANCE', 175.83, 63299, 360, 'tech', 360, 0, 'cz_binance'),
  ('b1000000-0000-0000-0000-000000000025', null, 'nader', 'nader', null, null, true, 'NADER', 156.27, 150026, 962, 'tech', 962, 0, 'nader');

-- ===================== MARKETS =====================
insert into markets (id, title, slug, description, category, subcategory, creator_id, created_by_user_id, status, close_at, resolve_at, resolved_at, resolution_outcome, rules_text, resolution_source_url, featured_score, trending_score, total_volume, liquidity, yes_price, no_price, yes_pool, no_pool) values
  -- Creator/Celebrity markets
  ('c1000000-0000-0000-0000-000000000001', 'Will Diddy be convicted before end of 2026?', 'diddy-convicted-2026', 'Resolves YES if Sean "Diddy" Combs is found guilty on any federal charge before December 31, 2026.', 'viral', 'legal', 'b1000000-0000-0000-0000-000000000013', 'a1000000-0000-0000-0000-000000000001', 'open', '2026-12-30T00:00:00Z', '2026-12-31T23:59:00Z', null, null, 'Based on federal court records. Guilty verdict on any count resolves YES. Plea deals count as conviction.', null, 10, 98.5, 2850000, 60000, 0.72, 0.28, 14000, 36000),

  ('c1000000-0000-0000-0000-000000000002', 'Will Kai Cenat hit 20M YouTube subscribers by July 2026?', 'kai-cenat-20m-subs', 'Resolves YES if Kai Cenats main YouTube channel reaches 20 million subscribers before July 1, 2026.', 'streamers', 'streaming', 'b1000000-0000-0000-0000-000000000001', null, 'open', '2026-06-30T00:00:00Z', '2026-07-01T00:00:00Z', null, null, 'Based on public YouTube subscriber count on Kai Cenats main channel. Social Blade as verification.', null, 9, 92.1, 1650000, 45000, 0.68, 0.32, 16000, 34000),

  ('c1000000-0000-0000-0000-000000000003', 'Will MrBeast launch a new show on Netflix in 2026?', 'mrbeast-netflix-2026', 'Resolves YES if MrBeast (Jimmy Donaldson) premieres a new Netflix original show in 2026.', 'music', 'entertainment', 'b1000000-0000-0000-0000-000000000002', null, 'open', '2026-12-30T00:00:00Z', '2026-12-31T23:59:00Z', null, null, 'Must be a new show, not Beast Games Season 2. Official Netflix announcement or premiere required.', null, 8, 85.3, 1200000, 40000, 0.55, 0.45, 22500, 27500),

  ('c1000000-0000-0000-0000-000000000004', 'Will Clavicular be convicted on his Florida battery charges?', 'clavicular-florida-battery', 'Resolves YES if Clavicular (arrested March 26, released March 27, 2026) is convicted on battery charges from the Florida incident.', 'viral', 'legal', 'b1000000-0000-0000-0000-000000000015', 'a1000000-0000-0000-0000-000000000005', 'open', '2026-12-30T00:00:00Z', '2026-12-31T23:59:00Z', null, null, 'Based on Florida court records. Guilty verdict or plea deal on battery charge resolves YES. Acquittal or dismissal resolves NO.', null, 9, 94.2, 1280000, 42000, 0.55, 0.45, 22500, 27500),

  ('c1000000-0000-0000-0000-000000000005', 'Will xQc sign with a major esports org by Q3 2026?', 'xqc-esports-org-q3', 'Resolves YES if xQc signs an exclusive content or competitive deal with a major esports organization by September 30, 2026.', 'streamers', 'gaming', 'b1000000-0000-0000-0000-000000000004', null, 'open', '2026-09-29T00:00:00Z', '2026-09-30T23:59:00Z', null, null, 'Major org = T1, Sentinels, FaZe, 100T, NRG, or equivalent. Must be publicly announced.', null, 5, 65.4, 520000, 22000, 0.35, 0.65, 32500, 17500),

  ('c1000000-0000-0000-0000-000000000006', 'Will Logan Pauls PRIME drink brand collapse by end of 2026?', 'prime-collapse-2026', 'Resolves YES if PRIME Hydration files for bankruptcy, loses major retail distribution, or sees revenue drop 70%+ from peak.', 'viral', 'business', 'b1000000-0000-0000-0000-000000000007', null, 'open', '2026-12-30T00:00:00Z', '2026-12-31T23:59:00Z', null, null, 'Collapse defined as: bankruptcy filing, loss of Walmart/Target distribution, or verified revenue decline of 70%+ from 2023 peak.', null, 8, 88.7, 1450000, 42000, 0.42, 0.58, 29000, 21000),

  ('c1000000-0000-0000-0000-000000000007', 'Will Adin Ross get permanently banned from Kick in 2026?', 'adin-ross-kick-ban-2026', 'Resolves YES if Adin Ross receives a permanent ban from Kick in 2026.', 'streamers', 'streaming', 'b1000000-0000-0000-0000-000000000006', null, 'open', '2026-12-30T00:00:00Z', '2026-12-31T23:59:00Z', null, null, 'Must be a confirmed permanent ban (indefinite), not a temporary suspension. Adin Ross is currently streaming on Kick.', null, 4, 55.2, 340000, 18000, 0.18, 0.82, 41000, 9000),

  ('c1000000-0000-0000-0000-000000000008', 'Will Blake Lively win her retaliation claim against Baldoni at trial?', 'lively-baldoni-retaliation-trial', 'Resolves YES if Blake Lively prevails on her retaliation claim against Justin Baldoni at the May 18, 2026 trial. Harassment claims were dismissed April 2, 2026.', 'music', 'legal', 'b1000000-0000-0000-0000-000000000012', 'a1000000-0000-0000-0000-000000000003', 'open', '2026-06-30T00:00:00Z', '2026-07-01T00:00:00Z', null, null, 'Based on jury verdict at trial scheduled May 18, 2026. Only the retaliation claim remains after harassment claims were dismissed April 2. Jury verdict for Lively resolves YES.', null, 10, 96.8, 2100000, 55000, 0.42, 0.58, 29000, 21000),

  ('c1000000-0000-0000-0000-000000000009', 'Will Speed (IShowSpeed) get a Nike deal in 2026?', 'ishowspeed-nike-deal', 'Resolves YES if IShowSpeed signs an official endorsement or collaboration deal with Nike in 2026.', 'streamers', 'business', 'b1000000-0000-0000-0000-000000000005', null, 'open', '2026-12-30T00:00:00Z', '2026-12-31T23:59:00Z', null, null, 'Must be an official Nike partnership, not just wearing Nike products. Public announcement required.', null, 7, 76.5, 890000, 32000, 0.45, 0.55, 27500, 22500),

  ('c1000000-0000-0000-0000-000000000010', 'Will Pokimane return to full-time streaming?', 'pokimane-fulltime-streaming', 'Resolves YES if Pokimane streams 20+ hours per week for 4 consecutive weeks on any platform in 2026.', 'streamers', 'streaming', 'b1000000-0000-0000-0000-000000000003', null, 'open', '2026-12-30T00:00:00Z', '2026-12-31T23:59:00Z', null, null, 'Full-time = 20+ hours of live streaming per week for at least 4 consecutive weeks. Any platform counts.', null, 6, 68.3, 560000, 25000, 0.22, 0.78, 39000, 11000),

  ('c1000000-0000-0000-0000-000000000011', 'Will Elon Musks X platform lose 20% of ad revenue in 2026?', 'x-platform-ad-revenue-drop', 'Resolves YES if X (formerly Twitter) ad revenue drops 20%+ compared to 2025 figures.', 'politics', 'tech', 'b1000000-0000-0000-0000-000000000016', 'a1000000-0000-0000-0000-000000000001', 'open', '2026-12-30T00:00:00Z', '2026-12-31T23:59:00Z', null, null, 'Based on reported financials, credible leaks, or third-party verification (eMarketer, Bloomberg, etc.).', null, 9, 90.2, 1920000, 50000, 0.58, 0.42, 21000, 29000),

  ('c1000000-0000-0000-0000-000000000012', 'Will Tiger Woods be convicted of DUI from his March 27 Florida crash?', 'tiger-woods-dui-conviction', 'Resolves YES if Tiger Woods is convicted on DUI charges stemming from his March 27, 2026 crash in Florida.', 'sports', 'legal', 'b1000000-0000-0000-0000-000000000011', 'a1000000-0000-0000-0000-000000000003', 'open', '2026-12-30T00:00:00Z', '2026-12-31T23:59:00Z', null, null, 'Based on Florida court records. Guilty verdict or plea deal on DUI charge resolves YES. Reduced charges to reckless driving also resolve YES. Full dismissal resolves NO.', null, 10, 95.5, 1850000, 48000, 0.62, 0.38, 19000, 31000),

  ('c1000000-0000-0000-0000-000000000013', 'Will Ice Spice go platinum with her next single?', 'ice-spice-platinum-single', 'Resolves YES if Ice Spices next official single release achieves RIAA Platinum certification (1M+ units).', 'music', 'music', 'b1000000-0000-0000-0000-000000000009', null, 'open', '2026-12-30T00:00:00Z', '2026-12-31T23:59:00Z', null, null, 'RIAA Platinum = 1 million certified units. Must be a new single released in 2026.', null, 5, 62.8, 420000, 20000, 0.48, 0.52, 26000, 24000),

  ('c1000000-0000-0000-0000-000000000014', 'Will the Blake Lively vs Baldoni case settle before the jury verdict?', 'lively-baldoni-settlement', 'Resolves YES if Blake Lively and Justin Baldoni reach a settlement agreement before the jury returns a verdict at the May 18, 2026 trial.', 'music', 'legal', 'b1000000-0000-0000-0000-000000000012', 'a1000000-0000-0000-0000-000000000001', 'open', '2026-06-15T00:00:00Z', '2026-06-16T00:00:00Z', null, null, 'Settlement = both parties agree to resolve without jury verdict. Must occur after trial begins May 18 but before jury deliberation concludes. Pre-trial settlement also counts.', null, 9, 91.3, 1650000, 45000, 0.35, 0.65, 32500, 17500),

  ('c1000000-0000-0000-0000-000000000015', 'Will Clavicular get permanently banned from Kick in 2026?', 'clavicular-kick-ban-2026', 'Resolves YES if Clavicular receives a permanent ban from Kick streaming platform in 2026.', 'streamers', 'streaming', 'b1000000-0000-0000-0000-000000000015', 'a1000000-0000-0000-0000-000000000005', 'open', '2026-12-30T00:00:00Z', '2026-12-31T23:59:00Z', null, null, 'Must be a confirmed permanent ban (indefinite), not a temporary suspension. Following his March 26 arrest, increased scrutiny on his content.', null, 8, 87.4, 980000, 38000, 0.48, 0.52, 26000, 24000),

  -- People-focused replacement markets
  ('c1000000-0000-0000-0000-000000000016', 'Will Kai Cenat break his own Subathon record in 2026?', 'kai-cenat-subathon-record', 'Resolves YES if Kai Cenat hosts a subathon in 2026 that exceeds his previous record in either duration or peak concurrent viewers.', 'streamers', 'streaming', 'b1000000-0000-0000-0000-000000000001', null, 'open', '2026-12-30T00:00:00Z', '2026-12-31T23:59:00Z', null, null, 'Previous record must be exceeded in duration (days) OR peak concurrent viewers. Verified via Twitch/Kick stats and third-party trackers.', null, 10, 95.8, 2200000, 55000, 0.62, 0.38, 19000, 31000),

  ('c1000000-0000-0000-0000-000000000017', 'Will MrBeast win a major award for his Netflix show in 2026?', 'mrbeast-netflix-award', 'Resolves YES if MrBeast or Beast Games wins an Emmy, Peoples Choice, or equivalent major TV award in 2026.', 'music', 'entertainment', 'b1000000-0000-0000-0000-000000000002', null, 'open', '2026-12-30T00:00:00Z', '2026-12-31T23:59:00Z', null, null, 'Major award = Emmy, Peoples Choice Award, Critics Choice, or SAG Award. Nomination alone does not count. Must win.', null, 8, 82.4, 1350000, 40000, 0.35, 0.65, 32500, 17500),

  ('c1000000-0000-0000-0000-000000000018', 'Will Clavicular lose all brand deals by end of Q2 2026?', 'clavicular-brand-deals-q2', 'Resolves YES if Clavicular has zero active brand sponsorships by June 30, 2026 following his March arrest.', 'viral', 'controversy', 'b1000000-0000-0000-0000-000000000015', 'a1000000-0000-0000-0000-000000000005', 'open', '2026-06-29T00:00:00Z', '2026-06-30T23:59:00Z', null, null, 'All publicly known brand deals must be terminated or expired. One remaining active deal resolves NO. Based on public announcements and social media sponsorship disclosures.', null, 9, 91.5, 1780000, 48000, 0.72, 0.28, 14000, 36000),

  ('c1000000-0000-0000-0000-000000000019', 'Will Tiger Woods announce full retirement before July 2026?', 'tiger-woods-retirement-july', 'Resolves YES if Tiger Woods officially announces his retirement from professional golf before July 1, 2026.', 'sports', 'golf', 'b1000000-0000-0000-0000-000000000011', 'a1000000-0000-0000-0000-000000000003', 'open', '2026-06-30T00:00:00Z', '2026-07-01T00:00:00Z', null, null, 'Official public statement or press conference required. Simply not entering tournaments does not count. Must use the word retirement or equivalent.', null, 9, 88.9, 1650000, 45000, 0.42, 0.58, 29000, 21000),

  ('c1000000-0000-0000-0000-000000000020', 'Will Charli DAmelio launch her own brand by end of 2026?', 'charli-damelio-brand-2026', 'Resolves YES if Charli DAmelio launches a new consumer brand (fashion, beauty, food, or lifestyle) in 2026.', 'viral', 'business', 'b1000000-0000-0000-0000-000000000010', null, 'open', '2026-12-30T00:00:00Z', '2026-12-31T23:59:00Z', null, null, 'Must be her own brand, not just a collaboration or endorsement. Public launch with product available for purchase required.', null, 6, 74.6, 920000, 35000, 0.55, 0.45, 22500, 27500),

  -- Sports markets (3)
  ('c1000000-0000-0000-0000-000000000021', 'Will the Chiefs 3-peat the Super Bowl?', 'chiefs-3peat-superbowl', 'Resolves YES if the Kansas City Chiefs win Super Bowl LXI (February 2027).', 'sports', 'football', 'b1000000-0000-0000-0000-000000000019', 'a1000000-0000-0000-0000-000000000003', 'open', '2027-02-07T00:00:00Z', '2027-02-08T23:59:00Z', null, null, 'Standard NFL Super Bowl resolution. Chiefs must win the game.', 'https://www.nfl.com', 9, 91.5, 1950000, 50000, 0.22, 0.78, 39000, 11000),

  ('c1000000-0000-0000-0000-000000000022', 'Will LeBron James retire in 2026?', 'lebron-retires-2026', 'Resolves YES if LeBron James officially announces his retirement from the NBA in 2026.', 'sports', 'basketball', 'b1000000-0000-0000-0000-000000000018', 'a1000000-0000-0000-0000-000000000005', 'open', '2026-12-30T00:00:00Z', '2026-12-31T23:59:00Z', null, null, 'Official retirement announcement required. Sitting out a season without announcement does not count.', 'https://www.nba.com', 8, 86.3, 1420000, 42000, 0.15, 0.85, 42500, 7500),

  ('c1000000-0000-0000-0000-000000000023', 'Will Lionel Messi play in the 2026 World Cup?', 'messi-2026-world-cup', 'Resolves YES if Lionel Messi is on Argentinas official roster and plays at least one match in the 2026 FIFA World Cup.', 'sports', 'soccer', 'b1000000-0000-0000-0000-000000000014', 'a1000000-0000-0000-0000-000000000007', 'open', '2026-06-10T00:00:00Z', '2026-07-19T23:59:00Z', null, null, 'Must appear on the official squad list AND play at least 1 minute in a World Cup match.', 'https://www.fifa.com', 9, 93.7, 2400000, 55000, 0.62, 0.38, 19000, 31000);

-- ===================== TRADES =====================
insert into trades (id, user_id, market_id, side, action_type, quantity, price, gross_amount, fee_amount, platform_fee_amount, creator_fee_amount, market_creator_fee_amount) values
  -- Diddy trial market
  ('d1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'yes', 'buy', 2000, 0.68, 1360.00, 27.20, 20.40, 0, 6.80),
  ('d1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000005', 'c1000000-0000-0000-0000-000000000001', 'yes', 'buy', 3500, 0.70, 2450.00, 49.00, 36.75, 0, 12.25),
  ('d1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000001', 'no', 'buy', 1200, 0.30, 360.00, 7.20, 5.40, 0, 1.80),
  -- Kai Cenat subs
  ('d1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000007', 'c1000000-0000-0000-0000-000000000002', 'yes', 'buy', 1800, 0.65, 1170.00, 23.40, 17.55, 5.85, 0),
  ('d1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000009', 'c1000000-0000-0000-0000-000000000002', 'yes', 'buy', 2500, 0.67, 1675.00, 33.50, 25.13, 8.38, 0),
  ('d1000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000004', 'c1000000-0000-0000-0000-000000000002', 'no', 'buy', 800, 0.33, 264.00, 5.28, 3.96, 1.32, 0),
  -- MrBeast Netflix
  ('d1000000-0000-0000-0000-000000000007', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000003', 'yes', 'buy', 1500, 0.52, 780.00, 15.60, 11.70, 3.90, 0),
  ('d1000000-0000-0000-0000-000000000008', 'a1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000003', 'no', 'buy', 2000, 0.46, 920.00, 18.40, 13.80, 4.60, 0),
  -- PRIME collapse
  ('d1000000-0000-0000-0000-000000000009', 'a1000000-0000-0000-0000-000000000005', 'c1000000-0000-0000-0000-000000000006', 'yes', 'buy', 1200, 0.40, 480.00, 9.60, 7.20, 2.40, 0),
  ('d1000000-0000-0000-0000-000000000010', 'a1000000-0000-0000-0000-000000000010', 'c1000000-0000-0000-0000-000000000006', 'no', 'buy', 3000, 0.58, 1740.00, 34.80, 26.10, 8.70, 0),
  -- X platform ad revenue
  ('d1000000-0000-0000-0000-000000000011', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000011', 'yes', 'buy', 2200, 0.55, 1210.00, 24.20, 18.15, 0, 6.05),
  ('d1000000-0000-0000-0000-000000000012', 'a1000000-0000-0000-0000-000000000008', 'c1000000-0000-0000-0000-000000000011', 'no', 'buy', 1800, 0.43, 774.00, 15.48, 11.61, 0, 3.87),
  -- BTC 200k
  ('d1000000-0000-0000-0000-000000000013', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000017', 'yes', 'buy', 4000, 0.32, 1280.00, 25.60, 19.20, 0, 6.40),
  ('d1000000-0000-0000-0000-000000000014', 'a1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000017', 'no', 'buy', 2500, 0.66, 1650.00, 33.00, 24.75, 0, 8.25),
  ('d1000000-0000-0000-0000-000000000015', 'a1000000-0000-0000-0000-000000000008', 'c1000000-0000-0000-0000-000000000017', 'yes', 'buy', 5000, 0.34, 1700.00, 34.00, 25.50, 0, 8.50),
  -- ETH 10k
  ('d1000000-0000-0000-0000-000000000016', 'a1000000-0000-0000-0000-000000000008', 'c1000000-0000-0000-0000-000000000016', 'yes', 'buy', 3000, 0.26, 780.00, 15.60, 11.70, 0, 3.90),
  ('d1000000-0000-0000-0000-000000000017', 'a1000000-0000-0000-0000-000000000004', 'c1000000-0000-0000-0000-000000000016', 'no', 'buy', 1500, 0.72, 1080.00, 21.60, 16.20, 0, 5.40),
  -- BlackRock ETF
  ('d1000000-0000-0000-0000-000000000018', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000020', 'yes', 'buy', 3500, 0.72, 2520.00, 50.40, 37.80, 0, 12.60),
  ('d1000000-0000-0000-0000-000000000019', 'a1000000-0000-0000-0000-000000000006', 'c1000000-0000-0000-0000-000000000020', 'yes', 'buy', 1200, 0.74, 888.00, 17.76, 13.32, 0, 4.44),
  -- Chiefs 3-peat
  ('d1000000-0000-0000-0000-000000000020', 'a1000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000021', 'no', 'buy', 2800, 0.76, 2128.00, 42.56, 31.92, 0, 10.64),
  ('d1000000-0000-0000-0000-000000000021', 'a1000000-0000-0000-0000-000000000007', 'c1000000-0000-0000-0000-000000000021', 'yes', 'buy', 1000, 0.20, 200.00, 4.00, 3.00, 0, 1.00),
  -- Messi World Cup
  ('d1000000-0000-0000-0000-000000000022', 'a1000000-0000-0000-0000-000000000007', 'c1000000-0000-0000-0000-000000000023', 'yes', 'buy', 2000, 0.60, 1200.00, 24.00, 18.00, 0, 6.00),
  ('d1000000-0000-0000-0000-000000000023', 'a1000000-0000-0000-0000-000000000005', 'c1000000-0000-0000-0000-000000000023', 'yes', 'buy', 1500, 0.62, 930.00, 18.60, 13.95, 0, 4.65),
  -- Pokimane streaming
  ('d1000000-0000-0000-0000-000000000024', 'a1000000-0000-0000-0000-000000000009', 'c1000000-0000-0000-0000-000000000010', 'no', 'buy', 1800, 0.77, 1386.00, 27.72, 20.79, 6.93, 0),
  ('d1000000-0000-0000-0000-000000000025', 'a1000000-0000-0000-0000-000000000010', 'c1000000-0000-0000-0000-000000000010', 'yes', 'buy', 600, 0.21, 126.00, 2.52, 1.89, 0.63, 0),
  -- Speed Nike
  ('d1000000-0000-0000-0000-000000000026', 'a1000000-0000-0000-0000-000000000007', 'c1000000-0000-0000-0000-000000000009', 'yes', 'buy', 1500, 0.43, 645.00, 12.90, 9.68, 3.23, 0),
  ('d1000000-0000-0000-0000-000000000027', 'a1000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000009', 'no', 'buy', 2200, 0.56, 1232.00, 24.64, 18.48, 6.16, 0),
  -- Ice Spice platinum
  ('d1000000-0000-0000-0000-000000000028', 'a1000000-0000-0000-0000-000000000005', 'c1000000-0000-0000-0000-000000000013', 'yes', 'buy', 1000, 0.46, 460.00, 9.20, 6.90, 2.30, 0),
  -- Asmongold quit
  ('d1000000-0000-0000-0000-000000000029', 'a1000000-0000-0000-0000-000000000010', 'c1000000-0000-0000-0000-000000000014', 'yes', 'buy', 900, 0.60, 540.00, 10.80, 8.10, 2.70, 0),
  -- SOL flip ETH
  ('d1000000-0000-0000-0000-000000000030', 'a1000000-0000-0000-0000-000000000004', 'c1000000-0000-0000-0000-000000000018', 'yes', 'buy', 6000, 0.10, 600.00, 12.00, 9.00, 0, 3.00),
  ('d1000000-0000-0000-0000-000000000031', 'a1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000018', 'no', 'buy', 2000, 0.88, 1760.00, 35.20, 26.40, 0, 8.80),
  -- LeBron retirement
  ('d1000000-0000-0000-0000-000000000032', 'a1000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000022', 'no', 'buy', 3000, 0.84, 2520.00, 50.40, 37.80, 0, 12.60);

-- ===================== POSITIONS =====================
insert into positions (id, user_id, market_id, side, quantity, avg_entry_price, total_cost, fees_paid, realized_pnl, unrealized_pnl_cached, status) values
  -- satoshi_trades
  ('e1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'yes', 2000, 0.68, 1360.00, 27.20, 0, 80.00, 'open'),
  ('e1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000017', 'yes', 4000, 0.32, 1280.00, 25.60, 0, 120.00, 'open'),
  ('e1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000020', 'yes', 3500, 0.72, 2520.00, 50.40, 0, 105.00, 'open'),
  ('e1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000003', 'yes', 1500, 0.52, 780.00, 15.60, 0, 45.00, 'open'),
  ('e1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000011', 'yes', 2200, 0.55, 1210.00, 24.20, 0, 66.00, 'open'),
  -- crypto_queen
  ('e1000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000017', 'no', 2500, 0.66, 1650.00, 33.00, 0, -25.00, 'open'),
  ('e1000000-0000-0000-0000-000000000007', 'a1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000018', 'no', 2000, 0.88, 1760.00, 35.20, 0, 0, 'open'),
  ('e1000000-0000-0000-0000-000000000008', 'a1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000003', 'no', 2000, 0.46, 920.00, 18.40, 0, -20.00, 'open'),
  -- drama_detective
  ('e1000000-0000-0000-0000-000000000009', 'a1000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000001', 'no', 1200, 0.30, 360.00, 7.20, 0, -24.00, 'open'),
  ('e1000000-0000-0000-0000-000000000010', 'a1000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000021', 'no', 2800, 0.76, 2128.00, 42.56, 0, 56.00, 'open'),
  ('e1000000-0000-0000-0000-000000000011', 'a1000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000022', 'no', 3000, 0.84, 2520.00, 50.40, 0, 30.00, 'open'),
  -- defi_degen
  ('e1000000-0000-0000-0000-000000000012', 'a1000000-0000-0000-0000-000000000004', 'c1000000-0000-0000-0000-000000000016', 'no', 1500, 0.72, 1080.00, 21.60, 0, 0, 'open'),
  ('e1000000-0000-0000-0000-000000000013', 'a1000000-0000-0000-0000-000000000004', 'c1000000-0000-0000-0000-000000000018', 'yes', 6000, 0.10, 600.00, 12.00, 0, 12.00, 'open'),
  -- culture_vulture
  ('e1000000-0000-0000-0000-000000000014', 'a1000000-0000-0000-0000-000000000005', 'c1000000-0000-0000-0000-000000000001', 'yes', 3500, 0.70, 2450.00, 49.00, 0, 70.00, 'open'),
  ('e1000000-0000-0000-0000-000000000015', 'a1000000-0000-0000-0000-000000000005', 'c1000000-0000-0000-0000-000000000006', 'yes', 1200, 0.40, 480.00, 9.60, 0, 24.00, 'open'),
  ('e1000000-0000-0000-0000-000000000016', 'a1000000-0000-0000-0000-000000000005', 'c1000000-0000-0000-0000-000000000013', 'yes', 1000, 0.46, 460.00, 9.20, 0, 20.00, 'open'),
  -- streaming_oracle
  ('e1000000-0000-0000-0000-000000000017', 'a1000000-0000-0000-0000-000000000007', 'c1000000-0000-0000-0000-000000000002', 'yes', 1800, 0.65, 1170.00, 23.40, 0, 54.00, 'open'),
  ('e1000000-0000-0000-0000-000000000018', 'a1000000-0000-0000-0000-000000000007', 'c1000000-0000-0000-0000-000000000009', 'yes', 1500, 0.43, 645.00, 12.90, 0, 30.00, 'open'),
  ('e1000000-0000-0000-0000-000000000019', 'a1000000-0000-0000-0000-000000000007', 'c1000000-0000-0000-0000-000000000023', 'yes', 2000, 0.60, 1200.00, 24.00, 0, 40.00, 'open');

-- ===================== LEADERBOARD SNAPSHOTS =====================
insert into leaderboard_snapshots (user_id, period, roi_score, accuracy_score, early_call_score, volume_score, composite_score, rank) values
  ('a1000000-0000-0000-0000-000000000001', 'alltime', 42.5, 78.0, 85.0, 92.0, 68.3, 1),
  ('a1000000-0000-0000-0000-000000000007', 'alltime', 38.2, 82.0, 72.0, 65.0, 62.1, 2),
  ('a1000000-0000-0000-0000-000000000002', 'alltime', 35.8, 71.0, 68.0, 78.0, 58.7, 3),
  ('a1000000-0000-0000-0000-000000000009', 'alltime', 45.0, 65.0, 80.0, 55.0, 58.5, 4),
  ('a1000000-0000-0000-0000-000000000005', 'alltime', 28.5, 74.0, 62.0, 48.0, 50.2, 5),
  ('a1000000-0000-0000-0000-000000000010', 'alltime', 31.2, 68.0, 55.0, 52.0, 48.8, 6),
  ('a1000000-0000-0000-0000-000000000003', 'alltime', 22.8, 72.0, 45.0, 60.0, 44.5, 7),
  ('a1000000-0000-0000-0000-000000000006', 'alltime', 18.5, 58.0, 42.0, 35.0, 35.2, 8),
  ('a1000000-0000-0000-0000-000000000008', 'alltime', 15.2, 52.0, 38.0, 28.0, 30.1, 9),
  ('a1000000-0000-0000-0000-000000000004', 'alltime', -12.5, 45.0, 55.0, 70.0, 22.8, 10),
  ('a1000000-0000-0000-0000-000000000009', 'monthly', 55.0, 72.0, 90.0, 45.0, 65.8, 1),
  ('a1000000-0000-0000-0000-000000000001', 'monthly', 38.0, 80.0, 75.0, 85.0, 63.5, 2),
  ('a1000000-0000-0000-0000-000000000005', 'monthly', 42.0, 78.0, 70.0, 40.0, 58.2, 3),
  ('a1000000-0000-0000-0000-000000000002', 'monthly', 28.0, 68.0, 65.0, 72.0, 52.1, 4),
  ('a1000000-0000-0000-0000-000000000007', 'monthly', 25.0, 75.0, 55.0, 50.0, 48.5, 5),
  ('a1000000-0000-0000-0000-000000000003', 'monthly', 30.0, 65.0, 48.0, 55.0, 46.8, 6),
  ('a1000000-0000-0000-0000-000000000010', 'monthly', 20.0, 60.0, 50.0, 38.0, 40.2, 7),
  ('a1000000-0000-0000-0000-000000000006', 'monthly', 12.0, 55.0, 35.0, 30.0, 30.5, 8),
  ('a1000000-0000-0000-0000-000000000008', 'monthly', 8.0, 48.0, 40.0, 25.0, 27.0, 9),
  ('a1000000-0000-0000-0000-000000000004', 'monthly', -25.0, 38.0, 60.0, 65.0, 15.5, 10),
  ('a1000000-0000-0000-0000-000000000005', 'weekly', 65.0, 85.0, 80.0, 35.0, 68.2, 1),
  ('a1000000-0000-0000-0000-000000000001', 'weekly', 48.0, 75.0, 82.0, 90.0, 67.1, 2),
  ('a1000000-0000-0000-0000-000000000009', 'weekly', 52.0, 70.0, 88.0, 42.0, 62.0, 3),
  ('a1000000-0000-0000-0000-000000000007', 'weekly', 35.0, 80.0, 60.0, 55.0, 55.5, 4),
  ('a1000000-0000-0000-0000-000000000010', 'weekly', 40.0, 72.0, 45.0, 48.0, 50.8, 5),
  ('a1000000-0000-0000-0000-000000000002', 'weekly', 22.0, 65.0, 58.0, 68.0, 47.2, 6),
  ('a1000000-0000-0000-0000-000000000003', 'weekly', 28.0, 70.0, 42.0, 52.0, 45.0, 7),
  ('a1000000-0000-0000-0000-000000000008', 'weekly', 18.0, 55.0, 48.0, 30.0, 35.8, 8),
  ('a1000000-0000-0000-0000-000000000006', 'weekly', 10.0, 50.0, 30.0, 28.0, 27.5, 9),
  ('a1000000-0000-0000-0000-000000000004', 'weekly', -18.0, 42.0, 52.0, 60.0, 18.2, 10);

-- ===================== COMMENTS =====================
insert into market_comments (market_id, user_id, body) values
  ('c1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'The evidence is overwhelming. Conviction is basically guaranteed at this point.'),
  ('c1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000003', 'Federal cases have a 90%+ conviction rate. The only question is when, not if.'),
  ('c1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000005', 'Trial could get delayed again. Im hedging with a small NO position.'),
  ('c1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000007', 'Kai is the fastest growing creator right now. 20M is conservative. Buying YES heavy.'),
  ('c1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000009', 'The mafiathon streams are insane for growth. This is free money on YES.'),
  ('c1000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000010', 'PRIME sales are down bad. Every convenience store near me has PRIME collecting dust.'),
  ('c1000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000005', 'Collapse is a strong word though. Revenue down != collapse. Shorting this at 42%.'),
  ('c1000000-0000-0000-0000-000000000017', 'a1000000-0000-0000-0000-000000000001', 'Beast Games was massive. An Emmy nod is realistic but winning is another story. YES at 35% is value.'),
  ('c1000000-0000-0000-0000-000000000017', 'a1000000-0000-0000-0000-000000000002', 'Reality TV awards are political. MrBeast has the audience but not the Hollywood connections. Cautious NO.'),
  ('c1000000-0000-0000-0000-000000000023', 'a1000000-0000-0000-0000-000000000007', 'Messi has said multiple times this is likely his last World Cup. Hes going to play.'),
  ('c1000000-0000-0000-0000-000000000021', 'a1000000-0000-0000-0000-000000000003', 'No team has 3-peated since the early Patriots dynasty almost did. Chiefs are aging.');

-- ===================== WATCHLISTS =====================
insert into watchlists (user_id, entity_type, entity_id) values
  ('a1000000-0000-0000-0000-000000000001', 'market', 'c1000000-0000-0000-0000-000000000002'),
  ('a1000000-0000-0000-0000-000000000001', 'market', 'c1000000-0000-0000-0000-000000000006'),
  ('a1000000-0000-0000-0000-000000000001', 'market', 'c1000000-0000-0000-0000-000000000023'),
  ('a1000000-0000-0000-0000-000000000002', 'market', 'c1000000-0000-0000-0000-000000000001'),
  ('a1000000-0000-0000-0000-000000000002', 'market', 'c1000000-0000-0000-0000-000000000016'),
  ('a1000000-0000-0000-0000-000000000005', 'market', 'c1000000-0000-0000-0000-000000000009'),
  ('a1000000-0000-0000-0000-000000000005', 'market', 'c1000000-0000-0000-0000-000000000013'),
  ('a1000000-0000-0000-0000-000000000007', 'market', 'c1000000-0000-0000-0000-000000000010'),
  ('a1000000-0000-0000-0000-000000000007', 'market', 'c1000000-0000-0000-0000-000000000014'),
  ('a1000000-0000-0000-0000-000000000009', 'market', 'c1000000-0000-0000-0000-000000000001'),
  ('a1000000-0000-0000-0000-000000000009', 'market', 'c1000000-0000-0000-0000-000000000017'),
  ('a1000000-0000-0000-0000-000000000009', 'creator', 'b1000000-0000-0000-0000-000000000001'),
  ('a1000000-0000-0000-0000-000000000010', 'creator', 'b1000000-0000-0000-0000-000000000006');

-- ===================== COIN HOLDER DISTRIBUTIONS =====================
insert into coin_holder_distributions (market_id, trade_id, creator_id, total_pool_amount, per_coin_amount, snapshot_holder_count) values
  ('c1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000013', 10.20, 0.0000196, 2800),
  ('c1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000004', 'b1000000-0000-0000-0000-000000000001', 8.78, 0.0000099, 8200),
  ('c1000000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000007', 'b1000000-0000-0000-0000-000000000002', 5.85, 0.0000024, 15600),
  ('c1000000-0000-0000-0000-000000000009', 'd1000000-0000-0000-0000-000000000026', 'b1000000-0000-0000-0000-000000000005', 4.84, 0.0000067, 6900),
  ('c1000000-0000-0000-0000-000000000006', 'd1000000-0000-0000-0000-000000000009', 'b1000000-0000-0000-0000-000000000007', 3.60, 0.0000075, 4800);

-- Update platform config with new coin holder fee
INSERT INTO platform_config (key, value) VALUES ('creator_market_coin_holder_fee', '0.0075')
ON CONFLICT (key) DO UPDATE SET value = '0.0075';
UPDATE platform_config SET value = '0.0075' WHERE key = 'creator_market_creator_fee';

-- ===================== SET CREATOR TIERS + EARNINGS =====================
UPDATE creators SET tier = 'verified_creator' WHERE slug IN ('mrbeast', 'kai-cenat', 'ishowspeed', 'pokimane', 'xqc', 'logan-paul', 'asmongold', 'charli-damelio', 'nader');
UPDATE creators SET tier = 'public_figure' WHERE slug IN ('tiger-woods', 'lebron-james', 'lionel-messi', 'patrick-mahomes', 'arod');
UPDATE creators SET tier = 'unclaimed' WHERE tier IS NULL OR tier = '';

-- Holder earnings (accumulated from real DeSo activity)
UPDATE creators SET total_holder_earnings = 12400, total_creator_earnings = 0, markets_count = 0 WHERE slug = 'dharmesh';
UPDATE creators SET total_holder_earnings = 8900, total_creator_earnings = 0, markets_count = 0 WHERE slug = 'diamondhands';
UPDATE creators SET total_holder_earnings = 18200, total_creator_earnings = 0, markets_count = 1 WHERE slug = 'elon-musk';
UPDATE creators SET total_holder_earnings = 7800, total_creator_earnings = 0, markets_count = 2 WHERE slug = 'tiger-woods';
UPDATE creators SET total_holder_earnings = 4200, total_creator_earnings = 5600, markets_count = 1 WHERE slug = 'logan-paul';
UPDATE creators SET total_holder_earnings = 3100, total_creator_earnings = 0, markets_count = 0 WHERE slug = 'jake-paul';
UPDATE creators SET total_holder_earnings = 2400, total_creator_earnings = 0, markets_count = 0 WHERE slug = 'charli-damelio';
UPDATE creators SET total_holder_earnings = 1800, total_creator_earnings = 0, markets_count = 0 WHERE slug = 'cz-binance';
UPDATE creators SET total_holder_earnings = 1500, total_creator_earnings = 0, markets_count = 0 WHERE slug = 'nader';
UPDATE creators SET total_holder_earnings = 1200, total_creator_earnings = 0, markets_count = 0 WHERE slug = 'avenged-sevenfold';
UPDATE creators SET total_holder_earnings = 900, total_creator_earnings = 0, markets_count = 0 WHERE slug = 'arod';
UPDATE creators SET total_holder_earnings = 650, total_creator_earnings = 0, markets_count = 1 WHERE slug = 'diddy';
UPDATE creators SET total_holder_earnings = 420, total_creator_earnings = 0, markets_count = 2 WHERE slug = 'blake-lively';
UPDATE creators SET total_holder_earnings = 380, total_creator_earnings = 0, markets_count = 1 WHERE slug = 'xqc';
UPDATE creators SET total_holder_earnings = 250, total_creator_earnings = 0, markets_count = 1 WHERE slug = 'patrick-mahomes';
UPDATE creators SET total_holder_earnings = 180, total_creator_earnings = 0, markets_count = 3 WHERE slug = 'mrbeast';
UPDATE creators SET total_holder_earnings = 0, total_creator_earnings = 0, markets_count = 0 WHERE slug IN ('pokimane', 'kai-cenat', 'ishowspeed', 'adin-ross', 'asmongold', 'ice-spice', 'clavicular', 'lebron-james', 'lionel-messi');

-- Set hero market
UPDATE markets SET is_hero = false;
UPDATE markets SET is_hero = true WHERE slug = 'tiger-woods-dui-conviction';

-- Zero out escrow (no longer used)
UPDATE creators SET unclaimed_earnings_escrow = 0;
