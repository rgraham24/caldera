-- Fix market categories to match new system
UPDATE markets SET category = 'creators' WHERE category IN ('streamers', 'streaming', 'gaming');
UPDATE markets SET category = 'entertainment' WHERE category IN ('viral', 'celebrity');
-- sports, music, politics, tech stay as-is

-- Specific market fixes based on content
UPDATE markets SET category = 'creators' WHERE slug IN (
  'kai-cenat-20m-subs', 'kai-cenat-subathon-record', 'kai-cenat-50m-twitch',
  'mrbeast-netflix-2026', 'mrbeast-netflix-award', 'mrbeast-500m-subs',
  'ishowspeed-nike-deal', 'pokimane-fulltime-streaming',
  'xqc-esports-org-q3', 'adin-ross-kick-ban-2026',
  'clavicular-florida-battery', 'clavicular-kick-ban-2026', 'clavicular-fortune500-sponsor',
  'prime-amazon-listing-2026', 'charli-damelio-brand-2026'
);

UPDATE markets SET category = 'entertainment' WHERE slug IN (
  'diddy-convicted-2026', 'lively-baldoni-retaliation-trial', 'lively-baldoni-settlement',
  'ice-spice-platinum-single'
);

UPDATE markets SET category = 'politics' WHERE slug IN (
  'elon-musk-doge-stepdown'
);

UPDATE markets SET category = 'sports' WHERE slug IN (
  'tiger-woods-dui-conviction', 'tiger-woods-retirement-july',
  'lebron-retires-2026', 'lebron-30pts-next-game',
  'messi-2026-world-cup', 'messi-score-next-mls',
  'chiefs-3peat-superbowl', 'mahomes-3td-week1',
  'lakers-nba-championship-2026', 'warriors-playoffs-2026',
  'cowboys-playoffs-2026', 'duke-ncaa-tournament-2026',
  'alabama-cfp-2026', 'yankees-world-series-2026',
  'pacers-vs-cavaliers-2026'
);
