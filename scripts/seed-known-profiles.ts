import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function tryProfile(username: string): Promise<any | null> {
  try {
    const res = await fetch('https://api.deso.org/api/v0/get-single-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Username: username }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.Profile?.IsReserved && data.Profile.Username) return data.Profile;
    return null;
  } catch {
    return null;
  }
}

async function upsertProfile(p: any) {
  const row = {
    slug: p.Username.toLowerCase().replace(/[^a-z0-9_-]/g, ''),
    name: p.Username,
    deso_username: p.Username,
    deso_public_key: p.PublicKeyBase58Check,
    token_status: (p.PostCount > 0 || p.CoinEntry?.NumberOfHolders > 0) ? 'active_unverified' : 'shadow',
    deso_is_reserved: true,
    is_caldera_verified: false,
    creator_coin_price: ((p.CoinEntry?.CoinPriceDeSoNanos || 0) / 1e9) * 4.69,
    creator_coin_holders: p.CoinEntry?.NumberOfHolders || 0,
    entity_type: 'person',
    markets_count: 0,
  };
  if (!row.slug) return false;
  const { error } = await sb.from('creators').upsert(row, { onConflict: 'slug', ignoreDuplicates: false });
  if (error) { console.error(`  upsert error for ${p.Username}: ${error.message}`); return false; }
  return true;
}

// ──────────────────────────────────────────────────────────────────────────────
// KNOWN HANDLES — 2000+ to try
// ──────────────────────────────────────────────────────────────────────────────

const KNOWN_HANDLES: string[] = [
  // ── NBA Current Stars ──
  'lebronjames', 'stephencurry', 'kevindurant', 'giannisantetokounmpo', 'lukadoncic',
  'jaysontatum', 'nikolajokic', 'devinbooker', 'damianlandard', 'kyrieirving',
  'jimmybutler', 'bamadiebayo', 'traeyoung', 'zionwilliamson', 'jamorant',
  'donovanmitchell', 'dearonfox', 'jaylen', 'jaylenbrownm', 'pascalsiakam',
  'khrisemiddleton', 'paulgeorge', 'anthonydavis', 'russellwestbrook', 'chrispaul',
  'draymondgreen', 'klaythompson', 'andrewwiggins', 'brooklopez', 'embiid',
  'joelme', 'joelembiid', 'karlanthonytowns', 'kat', 'brandingram',
  'zaclavine', 'demar', 'demarrozan', 'rjbarrett', 'myles',
  'tylerherro', 'bam', 'cade', 'cadecunningham', 'evan',
  'scottiebarnes', 'franzwagner', 'anthonyjr', 'lonzo', 'lauri',
  'darius', 'daviusgarbland', 'shai', 'shaigildeousalexander', 'luguentzdort',
  'paulgeorge', 'kawhi', 'kawhileonard', 'nicola', 'tobias',
  'tobiasharris', 'denzelvalentine', 'bol', 'bolbol', 'isaiahstewart',
  'isaiahthomas', 'jrue', 'jrueholiday', 'klay', 'draymond',
  'stephen', 'lebronjames', 'bronny', 'bronnyjames', 'giannis',
  'luka', 'jayson', 'tatum', 'curry', 'durant',

  // ── NBA Legends ──
  'kobebryant', 'kobe', 'michaeljordan', 'mj', 'magic', 'magicjohnson',
  'larrybrd', 'larrybard', 'timcollins', 'timthomas', 'shaq', 'shaquille',
  'shaquilleoneal', 'dirk', 'dirknowitzki', 'vince', 'vincecarter',
  'allen', 'alleniverson', 'ai', 'carmelo', 'carmeloquanthony',
  'dwight', 'dwighthowrd', 'dwighthward', 'chris', 'chrisr', 'chrispaul',
  'dwyane', 'dwyanewade', 'wade', 'lebron', 'james',

  // ── NFL Stars ──
  'patrickmahomes', 'joshallenqb', 'joshallenqb1', 'joeburrow', 'lamarjackson',
  'justinherbert', 'dakprescott', 'jalenhurts', 'kirkccouins', 'tuatag',
  'treylance', 'macjones', 'zachlwilson', 'tyreekhill', 'davanteadams',
  'cooperkupp', 'stefondigs', 'ceedeelamb', 'mikewilliams', 'amaricoper',
  'amaricoopers', 'deandrehopkins', 'ajbrown', 'tyjamerson', 'devantaparker',
  'traviskelce', 'georgekittle', 'markandrew', 'darrenwaller', 'patrqfreiermuth',
  'aadrianthielen', 'jerdymcneil', 'nickfoles', 'aaronrodgers', 'tombrady',
  'brady', 'tomr', 'rodgers', 'mahomes', 'burrow',
  'lamar', 'herberg', 'dak', 'jalen', 'hurtis',
  'nickbosa', 'jadeonclowney', 'maxxcrosby', 'travislord', 'calvinridge',
  'nathanpeterman', 'dalvin', 'dallvincook', 'saquonbarkley', 'derrickhenry',
  'ezekielelliott', 'chrischmidt', 'chrismc', 'alvinkmara', 'alvinkmera',
  'jkdoublej', 'nick', 'diggs', 'stefon', 'davante',

  // ── NFL Legends ──
  'jerrrice', 'jarryrice', 'jerryrice', 'emmittsmith', 'barrysanders',
  'walterpayton', 'lawrencetaylor', 'reggiewhite', 'johnelway', 'joemontas',
  'joemonatana', 'joymontana', 'bretfarve', 'brettfavre', 'peytonmanning',
  'manning', 'elway', 'montana', 'rice', 'sanders',

  // ── MLB Stars ──
  'miktrout', 'miketort', 'miketrout', 'shoheiohtani', 'mookiebett',
  'mookiebetts', 'frandlindor', 'franciscolindor', 'ronacuna', 'ronalacuna',
  'freddiefreemanb', 'petealonso', 'vladguerrero', 'vladdyjr', 'fernantatits',
  'fernandotatis', 'codybellingerd', 'codybellingerd1', 'bryce', 'bryceharper',
  'nolanarenado', 'austinriley', 'paulgoldschmidt', 'freddyperalta',
  'corbin', 'corbinburnes', 'shanebieber', 'jaakob', 'gerritcole',
  'grtcole', 'jacobdegrom', 'aronol', 'aaronnola', 'maxscherzer',
  'claytonkershaw', 'treyturner', 'treyturnerss', 'josealtuve', 'altuve',
  'trout', 'ohtani', 'betts', 'harper', 'degrom',

  // ── NHL Stars ──
  'connormcdavid', 'auston', 'austonmatthews', 'nathalekmackinnan', 'nathanmackinnon',
  'artemi', 'artempanarin', 'davidpastrnak', 'andrei', 'andreivask',
  'evgenimals', 'evgenymalkin', 'sidneycrosby', 'crosby', 'alex',
  'alexovechkin', 'ovechkin', 'nikitas', 'nikitakucherov', 'victahedman',
  'victorhedman', 'erikkarlsson', 'carsonewill', 'carsonewi', 'elbrennen',
  'elbrennandj', 'tkolorado', 'twaynesmith', 'mitch', 'mitchmarner',
  'willnylander', 'mcdavid', 'matthews', 'mackinnon', 'panarin',

  // ── F1 Drivers ──
  'lewishamilton', 'maxverstappen', 'charlesleclerc', 'carlosainz', 'landonorris',
  'valttieribottas', 'georgerussell', 'sebastianvettel', 'fernandoalonso', 'kimiraikkonen',
  'danielricciardo', 'romain', 'nicelolatifi', 'ymcmahon', 'lancestroll',
  'mick', 'mickschumacher', 'michaelschumacher', 'schumacher', 'hamilton',
  'verstappen', 'leclerc', 'sainz', 'norris', 'russell',

  // ── UFC/MMA ──
  'connormcgregor', 'mcgregor', 'conor', 'khabib', 'khabibnurmagomedov',
  'jonnyjones', 'jonnynones', 'jonesbones', 'israeladesanya', 'adesanya',
  'alexpereira', 'dustinpoirier', 'justeringeim', 'nateediaz', 'nickdiaz',
  'tonyfergas', 'tonyferguson', 'brock', 'brocklesnar', 'andersonsilva',
  'georgssaint', 'georgesst', 'georgesstpierre', 'gsp', 'jonnycef',
  'chrisweidman', 'andrei', 'francissngap', 'francisgannou', 'ngannou',
  'jonnyjones', 'jannajk', 'jannajkune', 'rose', 'rosenamajunas',
  'valentina', 'valentinashevchenko', 'kamaru', 'kamaruusman', 'pokerjoel',

  // ── Soccer/Football ──
  'lionelmessi', 'messi', 'cristiano', 'cristianoronaldo', 'ronaldo',
  'neymar', 'neymarjr', 'kylianmbappe', 'mbappe', 'robertlewandowski',
  'karimebenzema', 'benzema', 'kevindebruyne', 'debruyne', 'virgilvandijk',
  'luka', 'lukamodric', 'modric', 'tonidroos', 'tonykroos',
  'sergioramos', 'sergiramos', 'andresiniesta', 'iniesta', 'xavi',
  'harrykane', 'jadon', 'jasonsancho', 'jadonsancho', 'marcus',
  'rasfordmarcus', 'marcusrasford', 'marcusrashford', 'salah', 'mohamedsalah',
  'sadio', 'sadiomane', 'erling', 'erlinghaaland', 'haaland',
  'pedri', 'gavi', 'fernandes', 'brunofernandesm', 'brunofernandes',
  'josepmourin', 'josemourinho', 'guardiola', 'pepguardiola', 'jurgenklop',
  'jurgenklrg', 'jurgenkopp', 'juergenklrg', 'jurgenkopp1',

  // ── Tennis ──
  'rafaelnadal', 'nadal', 'novakdjokovic', 'djokovic', 'rogerfederer',
  'federer', 'serena', 'serenawilliams', 'venuswilliams', 'naomiosaka',
  'osakanat', 'naomiosaka1', 'carlossalcaraz', 'carlosalcaraz', 'igaswiateek',
  'igaswiatek', 'brettcoff', 'andymuray', 'andymurray', 'stan',
  'stanwawrinka', 'casper', 'casperruud', 'jannik', 'janniks', 'janniksinner',

  // ── Golf ──
  'tigerwoos', 'tigerwoods', 'woods', 'rory', 'rorymcilroy', 'mcilroy',
  'jordanspieth', 'spieth', 'dustinjohnson', 'justinthomas', 'brysondc',
  'brysondechain', 'brysondeachambeau', 'jonrahm', 'rahm', 'phil',
  'philmickelson', 'mickelson', 'victorhovland', 'collinmorikawa', 'xandersbaals',
  'xanderschauffele', 'brooks', 'brookskoepka', 'koepka', 'scottie',
  'scottiescheffler', 'patrickree', 'patrickreed', 'lexi',

  // ── Pop/R&B/Hip-Hop ──
  'drake', 'champagnepapi', 'kendricklamar', 'kendrick', 'lamar',
  'future', 'youngthug', 'thug', 'liltonyy', 'nickiminaj', 'nicki',
  'cardib', 'cardiab', 'cardi', 'beyonce', 'rihanna',
  'arianagrande', 'ariana', 'grande', 'taylorswift', 'taylor',
  'billieeilish', 'billie', 'olivia', 'oliviarodrigo', 'theweeknd',
  'weeknd', 'postmalone', 'posty', 'juicewrld', 'juice', 'xxxtentacion',
  'travisscott', 'travis', 'kanyewest', 'kanye', 'jayz', 'jay',
  'eminem', 'slim', 'snoopdogg', 'snoop', 'nellymo', 'usher',
  'chrisbrawn', 'chrisbrown', 'johnn', 'johnlegend', 'edsheeran', 'ed',
  'harrystyles', 'harry', 'dualipa', 'dua', 'sza',
  'lizzo', 'meganthestallion', 'megan', 'saweetie', 'doja', 'dojacat',
  'gunna', 'lildurk', 'durk', 'rod', 'rodwave',
  'polo', 'pologg', 'pologgk', 'polo2g', 'polog', 'youngboy',
  'youngboynba', 'nba', 'nbayoungboy', 'lilbaby', 'lil', 'baby',
  'quavo', 'offset', 'takeoff', 'migos', 'twenty',
  'twentyonepilots', '21savage', 'savage', 'metro', 'metrobomin',
  'metro8oomin', 'metroboomin', 'whizkahlifa', 'whizkhalifa', 'whiz', 'khalifa',
  'jhene', 'jheneaiko', 'aiko', 'kehlani', 'tinashe',
  'the1975', 'lorde', 'halsey', 'sia', 'adele',
  'p!nk', 'pink', 'mariah', 'mariahcarey', 'britneyspears', 'britney',
  'justintimberlake', 'timberlake', 'nsync', 'backstreetboys', 'oneday',

  // ── Rock/Alternative ──
  'u2', 'bono', 'coldplay', 'radiohead', 'imaginedragons',
  'falloutboy', 'panicatthedisco', 'twentyonepilots', 'maneskin', 'thekillers',
  'acdc', 'metallica', 'foo', 'foofighters', 'greenday',
  'blink182', 'sum41', 'mychemicalromance', 'emo', 'paramore',
  'linkinpark', 'chesterbennington', 'mikeshinoda', 'system', 'slipknot',

  // ── Country ──
  'garth', 'garthbrooks', 'dolly', 'dollyparton', 'lukebryan',
  'carryunderwood', 'carrieunderwood', 'blakeshelton', 'blake', 'miranda',
  'mirandalambert', 'kelsea', 'kelseaballerini', 'thomas', 'thomasrhett',
  'morganwallen', 'morgan', 'lukec', 'lukecombs', 'combs', 'zac',
  'zacbrown', 'jason', 'jasonaldean', 'kenny', 'kennyrodgers',
  'kennyrogers', 'charliedaniels', 'toby', 'tobykiethm', 'tobykeith',

  // ── Latin ──
  'jenniferlopez', 'jlo', 'shakira', 'malumam', 'maluma', 'j',
  'jbalvin', 'badboy', 'badbunny', 'ozuna', 'anuel',
  'anitta', 'karolg', 'yomelamo', 'karolg1', 'myke', 'myketowers',
  'sech', 'rauw', 'rauwale', 'rawualejandro', 'rawualejandros',
  'ricky', 'rickmartin', 'rickymartin', 'marc', 'marcanthony',
  'pitosbull', 'pitobull', 'pitbull', 'gloria', 'gloriaestefan', 'enrique',
  'enriqueig', 'enriqueiglesias',

  // ── K-Pop ──
  'bts', 'blackpink', 'exo', 'twice', 'nct',
  'stray', 'straykids', 'got7', 'monsta', 'shinee',
  'rm', 'jin', 'suga', 'jhope', 'jimin',
  'vmember', 'jungkook', 'lisa', 'jennie', 'rose', 'jisoo',

  // ── Hollywood Actors ──
  'dwayne', 'dwaynesjohnson', 'therock', 'dwaynejohnson', 'vindiesel',
  'diesel', 'willsmith', 'will', 'kevinhart', 'hart',
  'ryanreynolds', 'ryan', 'chriser', 'chrispratt', 'pratt',
  'chrishemsworth', 'hemsworth', 'markruffalo', 'ruffalo', 'robertdowneyjr',
  'ironman', 'robertdowney', 'leonardodicaprio', 'leonardodecaprio', 'dicaprio',
  'bradpitt', 'bradd', 'tomcruise', 'cruise', 'matthewmcc',
  'mattdamon', 'damon', 'benaffleck', 'affleck', 'georgloos',
  'georgeclooney', 'clooney', 'johnnydep', 'johnnydepp', 'depp',
  'jenniferaniston', 'aniston', 'angelinajolie', 'jolie', 'scarlettjohansen',
  'scarlettjohannson', 'scarlett', 'emmawatson', 'emma', 'margotrobber',
  'margotrobbie', 'robbie', 'galaddot', 'gadot', 'wonderwoman',
  'zendaya', 'florence', 'florencepugh', 'sydneysweeney', 'sydney',
  'anaed', 'anadearms', 'anadearmas', 'violarvis', 'violadavis',
  'tarajiphenson', 'taraji', 'whitneyhouston', 'halle', 'halleberry',
  'naomicampbell', 'naomi', 'tyrabanks', 'tyra',

  // ── TV Stars ──
  'oprah', 'oprahwinfrey', 'ellendegenere', 'ellendegeneres', 'jimmyfallon',
  'jayleno', 'davidletterman', 'stephancol', 'stephencolbert', 'johnoliver',
  'chrisrock', 'davidchappelle', 'chappelle', 'kevindhart', 'khart',
  'conanobrien', 'conan', 'jimmyk', 'jimmykimmel', 'trevornoah', 'trevor',
  'jimcarrey', 'carrey', 'adamaandler', 'adamsandler', 'willferrell', 'ferrell',
  'stevecaell', 'stevecaell1', 'stevecarel', 'stevecarell', 'stevecarell1',
  'johnkrasinski', 'krasinski', 'eddiecharacter', 'charliesheen', 'charlie',
  'timotheechalamet', 'timothee', 'zacefron', 'zacefron1', 'zacefron2',
  'selenagomez', 'selena', 'gomez', 'mileycyrus', 'miley', 'cyrus',
  'nickyminaj', 'caitlynjenner', 'kaitlynjenner', 'kendalljenner', 'kendall',
  'kyliejenner', 'kylie', 'kimkardashian', 'kim', 'kourtney', 'khloe',
  'khlokardashian', 'khloekar', 'khloekardashian', 'khoekar', 'rob',
  'kristensteward', 'kristenstewart', 'twilight', 'robertpattinson', 'pattinson',

  // ── Creators/Streamers/YouTubers ──
  'pewdiepie', 'mrbiast', 'mrbeast', 'markiplier', 'jacksepticeye',
  'ninja', 'tyler', 'nlinja', 'shroud', 'timthetatman',
  'tim', 'pokimane', 'valkyrae', 'hasanabi', 'hasan',
  'xqc', 'felix', 'amouranth', 'asmongold', 'asmon',
  'summitgl', 'summit1g', 'lirik', 'kaicenat', 'ishowspeed',
  'speed', 'adinross', 'adin', 'duke', 'dukea', 'dukedgenuitt',
  'icespice', 'ice', 'jakepaul', 'logan', 'loganpaul',
  'mikemalm', 'komaelm', 'ksi', 'vikk', 'vikk1',
  'miniminter', 'sdmn', 'sidemen', 'behzinga', 'tobjizzle',
  'calluxmc', 'callux', 'calfreezy', 'calfreezy1', 'wroetoshaw',
  'wroeshaw', 'ethan', 'jj', 'vik', 'simon',
  'nadeshot', 'faze', 'fazeclan', 'tfue', 'nickmercs',
  'swagg', 'aydan', 'nickeh30', 'timmy', 'timmytturner',
  'drlupo', 'drlu', 'livelys', 'sodapoppin', 'soda',
  'amaz', 'baj', 'bajheera', 'dansgaming', 'sodapoppin',
  'hafu', 'disguised', 'disguisedtoast', 'toast', 'sykunno',
  'offline', 'offlinetv', 'lilypichu', 'lily', 'micheal',
  'corpusehusband', 'corpse', 'jackscepticeye', 'philza', 'technoblade',
  'dreamsmp', 'dream', 'georgenotfound', 'george', 'sapnap',
  'quackity', 'wilbursoot', 'tomsimons', 'ranboo', 'tubbo',
  'tommyinnit', 'tommy', 'nihachu', 'fundy', 'punz',

  // ── Podcasters/Media ──
  'joerogen', 'joerogan', 'lexfridman', 'lex', 'garyvee',
  'garyvaynerchuk', 'andersen', 'hhoffman', 'andrewatchison', 'hubermanlab',
  'andrewhuberman', 'simonsineck', 'simonsieck', 'tonyrobbins', 'tony',
  'charliemunger', 'warren', 'warrenbuffet', 'warrenbuffett', 'buffett',
  'rouhandas', 'rupaul', 'ru', 'elvisfetch', 'maxwellmaxwell',

  // ── Models/Influencers ──
  'kendalljenner', 'bellahadid', 'gigihadid', 'gigi', 'bella',
  'hadid', 'karlie', 'karlieclass', 'karliekloss', 'kloss',
  'caradelivingne', 'caradelevingne', 'cara', 'adria', 'adrialima',
  'adrianalima', 'candice', 'candicepepita', 'candiceswanepoel',
  'heidi', 'heidiklum', 'klum', 'emily', 'emilyratajkowski',
  'ratajkowski', 'emilyrata', 'christy', 'naomicampbell',
  'irina', 'irinashayk', 'shayk', 'miranda', 'mirandakerr', 'kerr',

  // ── Politicians ──
  'barackobama', 'obama', 'michelleobama', 'michelle', 'joebiden',
  'biden', 'kamalaharris', 'kamala', 'donaldtrump', 'trump',
  'bernie', 'berniesanders', 'elizabethwarrn', 'elizabethwarren', 'warren1',
  'aoc', 'alexandriac', 'alexandriaocasiocortez', 'nancy', 'nancypelosi',
  'pelosi', 'chuckschumer', 'chuck', 'schumer', 'mitch',
  'mitchmcconnell', 'mcconnell', 'kevinsmc', 'kevinmccarthy', 'mccarthy',
  'hillaryclinton', 'hillary', 'clinton', 'bill', 'billclinton',
  'georgebush', 'jeb', 'jebbush', 'mitt', 'mittromney',
  'romney', 'johnmccain', 'mccain', 'tedcruz', 'marco',
  'marcoubio', 'marcorubio', 'randpaul', 'rand', 'maastricht',
  'rhondadiesantis', 'rhondadisantis', 'rondesantis', 'desantis', 'ronalddesantis',
  'governordesantis', 'nickihaley', 'nikki', 'nikkihaley', 'haley',
  'gavin', 'gavinnewsom', 'newsom', 'gregabbott', 'abbott',
  'jeffbesoz', 'justintrudeau', 'trudeau', 'boris', 'borisjohnson',
  'macron', 'emmanuelmacron', 'angela', 'angelamerkel', 'merkel',
  'theresa', 'theresamay', 'may', 'tonybarber', 'tonyabbott',
  'scottmorrison', 'albo', 'albanese', 'anthonyalbanese',
  'narendra', 'narendramodi', 'modi', 'shinzo', 'shinzoabe',
  'abe', 'xijinping', 'xi', 'vladimir', 'vladimirputin',
  'putin', 'olaf', 'olafscholz', 'scholz', 'kimjong',
  'kimjongun', 'elon', 'elonmusk', 'musk',

  // ── Tech/Business ──
  'jeffbezos', 'bezos', 'billgates', 'gates', 'markzuckerberg',
  'zuckerberg', 'zuck', 'larrpage', 'larrypage', 'sergeybrin',
  'sundar', 'sundarpichai', 'pichai', 'satya', 'satyanadella',
  'nadella', 'timcook', 'cook', 'jack', 'jackdorsey',
  'dorsey', 'jaketransparency', 'reid', 'reidhoffman', 'peter',
  'peterthiel', 'thiel', 'palantir', 'david', 'davidsax',
  'marcandreessen', 'bena', 'benhorowitz', 'horowitz', 'a16z',
  'jamesvine', 'chamath', 'chamathmain', 'vinod', 'vinodkhosla',
  'khosla', 'sequoia', 'yc', 'ycombinator', 'gartan',
  'sam', 'samalt', 'samaltn', 'samaltman', 'altman',
  'gregbrockman', 'ilya', 'ilyasutskever', 'openai', 'anthropic',
  'demis', 'demishasabis', 'hassabis', 'deepmind', 'google',

  // ── Companies/Brands ──
  'nike', 'apple', 'google', 'amazon', 'facebook',
  'microsoft', 'tesla', 'spacex', 'netflix', 'disney',
  'cocacola', 'pepsi', 'mcdonalds', 'starbucks', 'walmart',
  'target', 'costco', 'samsungf', 'samsung', 'sony',
  'bmw', 'mercedes', 'audi', 'toyota', 'honda',
  'ford', 'gm', 'chevrolet', 'gmc', 'dodge',
  'ferrari', 'lamborghini', 'porsche', 'rollsroyce', 'bentley',
  'gucci', 'prada', 'louisvuitton', 'lv', 'chanel',
  'hermes', 'versace', 'armani', 'dolcegabbana', 'dg',
  'adidas', 'puma', 'underarmour', 'ua', 'newbalance',
  'reebok', 'vans', 'converse', 'jordan', 'airjordan',
  'visa', 'mastercard', 'amex', 'americanexpress', 'paypal',
  'stripe', 'square', 'coinbase', 'binance', 'kraken',
  'robinhood', 'fidelity', 'vanguard', 'blackrock', 'jpmorgan',
  'goldmansachs', 'morgan', 'bankofamerica', 'bofa', 'wells',
  'wellsfargo', 'citi', 'citibank', 'schwab', 'charleschwab',
  'nfl', 'nba', 'nhl', 'mlb', 'mls',
  'fifa', 'uefa', 'ufc', 'wwe', 'espn',
  'fox', 'foxsports', 'cnn', 'nbc', 'abc',
  'cbs', 'hbo', 'showtime', 'paramount', 'nbcuniversal',
  'universalstudios', 'warnerbros', 'marvel', 'dccomics', 'dc',
  'starwars', 'lucasfilm', 'pixar', 'dreamworks', 'blizzard',
  'activision', 'ea', 'epicgames', 'epic', 'riot',
  'riotgames', 'valve', 'steam', 'twitch', 'youtube',
  'tiktok', 'instagram', 'twitter', 'snapchat', 'reddit',
  'linkedin', 'spotify', 'soundcloud', 'appledm', 'applem',
  'uber', 'lyft', 'doordash', 'instacart', 'airbnb',
  'vrbo', 'booking', 'expedia', 'tripadvisor', 'yelp',
  'grubhub', 'postmates', 'dominos', 'pizzahut', 'kfc',
  'burgerking', 'wendys', 'chipotle', 'subway', 'taco',
  'tacobell', 'chick', 'chickfila', 'sweetgreen', 'shake',

  // ── NBA Teams ──
  'lakers', 'warriors', 'bulls', 'celtics', 'nets',
  'heat', 'bucks', 'suns', 'nuggets', 'clippers',
  'knicks', 'sixers', '76ers', 'raptors', 'grizzlies',
  'pelicans', 'timberwolves', 'thunder', 'blazers', 'jazz',
  'spurs', 'rockets', 'mavs', 'mavericks', 'hawks',
  'hornets', 'magic', 'pistons', 'pacers', 'cavaliers',
  'wizards', 'kings', 'trailblazers',

  // ── NFL Teams ──
  'chiefs', 'eagles', 'cowboys', 'patriots', 'packers',
  'steelers', '49ers', 'bills', 'ravens', 'bengals',
  'broncos', 'seahawks', 'buccaneers', 'rams', 'chargers',
  'colts', 'browns', 'dolphins', 'raiders', 'vikings',
  'saints', 'giants', 'bears', 'lions', 'falcons',
  'panthers', 'cardinals', 'texans', 'jaguars', 'titans',
  'commanders', 'redskins', 'jets',

  // ── MLB Teams ──
  'yankees', 'dodgers', 'astros', 'braves', 'mets',
  'redsox', 'cubs', 'cardinals', 'giants', 'phillies',
  'padres', 'bluejays', 'guardians', 'brewers', 'mariners',
  'orioles', 'tigers', 'whitesox', 'twins', 'reds',
  'pirates', 'rockies', 'diamondbacks', 'angels', 'athletics',
  'rays', 'rangers', 'marlins', 'nationals',

  // ── NHL Teams ──
  'oilers', 'avalanche', 'lightning', 'leafs', 'canadiens',
  'bruins', 'penguins', 'capitols', 'flyers', 'rangers',
  'islanders', 'devils', 'blackhawks', 'redwings', 'stars',
  'flames', 'canucks', 'sharks', 'ducks', 'kings',
  'coyotes', 'blues', 'predators', 'hurricanes', 'senators',

  // ── Soccer Teams ──
  'realmadrid', 'barcelona', 'barca', 'manchestercity', 'mancity',
  'manchesterunited', 'manutd', 'liverpool', 'chelsea', 'arsenal',
  'tottenham', 'spurs', 'juventus', 'acmilan', 'inter',
  'bayernmunich', 'borussia', 'bvb', 'psg', 'atletico',
  'sevilla', 'roma', 'napoli', 'lazio', 'ajax',

  // ── Esports ──
  'teamnl', 'team', 'c9', 'cloud9', 'fg', 'fazeclan',
  '100thieves', 'tl', 'tsm', 'optic', 'nrg',
  'g2esports', 'natus', 'fnatic', 'vitality', 'navi',
  'liquid', 'teamliquid', 'sentinels', 'valorant', 'csgo',
  'fortnite', 'apexlegends', 'leagueoflegends', 'lol', 'dota',

  // ── News/Media Personalities ──
  'tucker', 'tuckercarlson', 'seanhannity', 'hannity', 'rachelm',
  'rachelmaddow', 'andersoncooper', 'anderson', 'cooperanderson', 'wolfblitzer',
  'andrewcuomo', 'don', 'donlemon', 'lemon', 'chriscuomo',
  'mehdi', 'alisyn', 'alysyncamerota', 'jakeetapper', 'tapper',
  'chriswallace', 'wallacem', 'megynkelly', 'megyn', 'kellym',
  'natesilver', 'ezrakl', 'ezraklein', 'matthewi', 'matthewyi',
  'nytimes', 'washingtonpost', 'cnn1', 'foxnewsf', 'foxnews',
  'msnbc', 'bbc', 'reuters', 'ap', 'asspress',
  'bloomberg', 'wsj', 'ft', 'econom', 'axios',
  'politico', 'vox', 'buzzfeednews', 'buzzfeed', 'vice',

  // ── Science/Academia ──
  'neiltyson', 'neildt', 'neildegratyson', 'neildegratyp', 'michio',
  'michiokaku', 'bnyge', 'billnye', 'billnyescience', 'sagancarl',
  'carlsagan', 'richardawk', 'richarddawkins', 'dawkins', 'sam',
  'samharris', 'jordanpetersn', 'jordanpeterson', 'jordan', 'peterson',

  // ── Athletes (misc) ──
  'usainbolt', 'bolt', 'florentinoflorida', 'michaelphelp', 'michaelphelps',
  'phelps', 'simonebiles', 'simone', 'biles', 'serena',
  'shawn', 'shawnwhite', 'white', 'tonyhawk', 'hawk',
  'kelynayoumans', 'caityvanzeist', 'allysonfelix', 'felix', 'flojo',

  // ── Additional first-name only handles often reserved ──
  'michael', 'james', 'john', 'robert', 'david',
  'richard', 'joseph', 'thomas', 'charles', 'christopher',
  'daniel', 'matthew', 'anthony', 'donald', 'steven',
  'paul', 'andrew', 'joshua', 'kenneth', 'kevin',
  'brian', 'george', 'edward', 'ronald', 'timothy',
  'jason', 'jeffrey', 'ryan', 'jacob', 'gary',
  'eric', 'stephen', 'jonathan', 'larry', 'justin',
  'scott', 'brandon', 'frank', 'raymond', 'gregory',
  'samuel', 'benjamin', 'patrick', 'jack', 'dennis',
  'jerry', 'alexander', 'tyler', 'henry', 'douglas',
  'peter', 'sean', 'adam', 'keith', 'harold',
  'mary', 'patricia', 'linda', 'barbara', 'elizabeth',
  'jennifer', 'maria', 'susan', 'margaret', 'dorothy',
  'lisa', 'nancy', 'karen', 'betty', 'helen',
  'sandra', 'donna', 'carol', 'ruth', 'sharon',
  'michelle', 'laura', 'sarah', 'kimberly', 'deborah',
  'jessica', 'shirley', 'cynthia', 'angela', 'melissa',
  'brenda', 'amy', 'anna', 'virginia', 'kathleen',
  'pamela', 'martha', 'debra', 'amanda', 'stephanie',
  'carolyn', 'jane', 'janet', 'maria', 'cathryn',
];

// Deduplicate
const HANDLES = [...new Set(KNOWN_HANDLES.map(h => h.toLowerCase().trim()).filter(h => h.length > 0))];

async function main() {
  console.log(`Trying ${HANDLES.length} unique handles against DeSo get-single-profile...`);

  let found = 0;
  let upserted = 0;
  let checked = 0;
  const BATCH = 10;

  for (let i = 0; i < HANDLES.length; i += BATCH) {
    const batch = HANDLES.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(h => tryProfile(h)));

    for (const profile of results) {
      checked++;
      if (profile) {
        found++;
        const ok = await upsertProfile(profile);
        if (ok) upserted++;
      }
    }

    if (checked % 100 === 0 || i + BATCH >= HANDLES.length) {
      console.log(`  [${checked}/${HANDLES.length}] found=${found} upserted=${upserted}`);
    }

    await new Promise(r => setTimeout(r, 100));
  }

  // Final DB count
  const { count: total } = await sb.from('creators').select('*', { count: 'exact', head: true });
  const { count: reserved } = await sb.from('creators').select('*', { count: 'exact', head: true }).eq('deso_is_reserved', true);

  console.log('\n=== DONE ===');
  console.log(`Checked: ${HANDLES.length} handles`);
  console.log(`Found reserved: ${found}`);
  console.log(`Upserted to DB: ${upserted}`);
  console.log(`DB total creators: ${total}`);
  console.log(`DB reserved creators: ${reserved}`);
}

main().catch(console.error);
