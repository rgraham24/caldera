import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { importMarqueeProfileDeSoFirst, MarqueeProfile } from "@/lib/admin/pipeline";

const MARQUEE_PROFILES: MarqueeProfile[] = [
  // ── Pundits & Podcasters ──────────────────────────────────────
  { name: "Joe Rogan", desoUsernames: ["joerogan", "JoeRogan"], team: "spotify", league: "podcasts" },
  { name: "Tucker Carlson", desoUsernames: ["tuckercarlson", "TuckerCarlson"], team: "fox-news", league: "conservative-media" },
  { name: "Ben Shapiro", desoUsernames: ["benshapiro", "BenShapiro"], team: "the-daily-wire", league: "conservative-media" },
  { name: "Lex Fridman", desoUsernames: ["lexfridman", "LexFridman"], team: "youtube", league: "podcasts" },
  { name: "Andrew Huberman", desoUsernames: ["hubermanlab", "andrewhuberman"], team: "spotify", league: "podcasts" },
  { name: "Chamath Palihapitiya", desoUsernames: ["chamath", "Chamath"], team: "all-in-podcast", league: "podcasts" },
  { name: "Naval Ravikant", desoUsernames: ["naval", "NavalRavikant"], team: "twitter", league: "commentary" },
  { name: "Bari Weiss", desoUsernames: ["bariweiss", "BariWeiss"], team: "substack", league: "commentary" },
  { name: "Peter Zeihan", desoUsernames: ["peterzeihan", "PeterZeihan"], team: "youtube", league: "podcasts" },
  { name: "Scott Galloway", desoUsernames: ["scottgalloway", "profgalloway"], team: "substack", league: "commentary" },
  { name: "Bill Maher", desoUsernames: ["billmaher", "BillMaher"], team: "hbo", league: "commentary" },
  { name: "Jordan Peterson", desoUsernames: ["jordanpeterson", "JordanPeterson"], team: "youtube", league: "commentary" },
  { name: "Sam Harris", desoUsernames: ["samharris", "SamHarris"], team: "substack", league: "podcasts" },
  { name: "Tim Pool", desoUsernames: ["timpool", "TimPool"], team: "youtube", league: "conservative-media" },
  { name: "Dave Rubin", desoUsernames: ["daverubin", "DaveRubin"], team: "the-daily-wire", league: "conservative-media" },
  { name: "Megyn Kelly", desoUsernames: ["megynkelly", "MegynKelly"], team: "sirius-xm", league: "commentary" },
  { name: "Glenn Beck", desoUsernames: ["glennbeck", "GlennBeck"], team: "blaze-media", league: "conservative-media" },
  { name: "Rachel Maddow", desoUsernames: ["rachelmaddow", "RachelMaddow"], team: "msnbc", league: "progressive-media" },

  // ── Politicians ───────────────────────────────────────────────
  { name: "Donald Trump", desoUsernames: ["realdonaldtrump", "donaldtrump"], team: "republican-party", league: "us-politics" },
  { name: "Alexandria Ocasio-Cortez", desoUsernames: ["aoc", "AOC"], team: "democratic-party", league: "us-politics" },
  { name: "Elon Musk", desoUsernames: ["elonmusk", "ElonMusk"], team: "x-corp", league: "tech" },
  { name: "Ron DeSantis", desoUsernames: ["rondesantis", "RonDeSantis"], team: "republican-party", league: "us-politics" },
  { name: "Gavin Newsom", desoUsernames: ["gavinnewsom", "GavinNewsom"], team: "democratic-party", league: "us-politics" },
  { name: "Nikki Haley", desoUsernames: ["nikkihaley", "NikkiHaley"], team: "republican-party", league: "us-politics" },
  { name: "Bernie Sanders", desoUsernames: ["berniesanders", "BernieSanders"], team: "democratic-party", league: "us-politics" },
  { name: "Ted Cruz", desoUsernames: ["tedcruz", "TedCruz"], team: "republican-party", league: "us-politics" },
  { name: "JD Vance", desoUsernames: ["jdvance", "JDVance"], team: "republican-party", league: "us-politics" },

  // ── Athletes ──────────────────────────────────────────────────
  { name: "LeBron James", desoUsernames: ["lebronjames", "LeBronJames"], team: "lakers", league: "nba" },
  { name: "Lionel Messi", desoUsernames: ["LionelMessi", "lionelmessi"], team: "inter-miami", league: "soccer" },
  { name: "Conor McGregor", desoUsernames: ["ConorMcGregor", "conormcgregor"], team: "ufc", league: "ufc" },
  { name: "Tom Brady", desoUsernames: ["tombrady", "TomBrady"], team: "nfl", league: "nfl" },
  { name: "Tiger Woods", desoUsernames: ["tigerwoods", "TigerWoods"], team: "pga", league: "golf" },
  { name: "Caitlin Clark", desoUsernames: ["caitlinclark", "CaitlinClark"], team: "indiana-fever", league: "wnba" },
  { name: "Cristiano Ronaldo", desoUsernames: ["cristiano", "CristianoRonaldo"], team: "al-nassr", league: "soccer" },
  { name: "Stephen Curry", desoUsernames: ["stephencurry", "StephenCurry", "wardell"], team: "warriors", league: "nba" },
  { name: "Patrick Mahomes", desoUsernames: ["patrickmahomes", "PatrickMahomes"], team: "chiefs", league: "nfl" },
  { name: "Serena Williams", desoUsernames: ["serenawilliams", "SerenaWilliams"], team: "wta", league: "tennis" },
  { name: "Novak Djokovic", desoUsernames: ["novakdjokovic", "NovakDjokovic"], team: "atp", league: "tennis" },
  { name: "Jon Jones", desoUsernames: ["jonjones", "JonJones", "jonnybones"], team: "ufc", league: "ufc" },
  { name: "Canelo Alvarez", desoUsernames: ["caneloalvarez", "Canelo"], team: "boxing", league: "boxing" },
  { name: "Tyson Fury", desoUsernames: ["tysonfury", "TysonFury"], team: "boxing", league: "boxing" },

  // ── Entertainers ──────────────────────────────────────────────
  { name: "Taylor Swift", desoUsernames: ["taylorswift", "TaylorSwift"], team: "republic-records", league: "pop" },
  { name: "Drake", desoUsernames: ["drake", "Drake"], team: "ovo-sound", league: "hiphop" },
  { name: "Kanye West", desoUsernames: ["kanyewest", "KanyeWest"], team: "good-music", league: "hiphop" },
  { name: "Beyonce", desoUsernames: ["beyonce", "Beyonce"], team: "parkwood-entertainment", league: "pop" },
  { name: "Travis Scott", desoUsernames: ["TravisScott", "travisscott"], team: "cactus-jack", league: "hiphop" },
  { name: "Kendrick Lamar", desoUsernames: ["kendricklamar", "KendrickLamar"], team: "pglan", league: "hiphop" },
  { name: "Nicki Minaj", desoUsernames: ["nickiminaj", "NickiMinaj"], team: "young-money", league: "hiphop" },
  { name: "Cardi B", desoUsernames: ["iamcardib", "CardiB"], team: "atlantic-records", league: "hiphop" },
  { name: "Post Malone", desoUsernames: ["postmalone", "PostMalone"], team: "republic-records", league: "pop" },
  { name: "Bad Bunny", desoUsernames: ["badbunny", "BadBunny"], team: "rimas-entertainment", league: "latin" },
  { name: "Billie Eilish", desoUsernames: ["billieeilish", "BillieEilish"], team: "interscope", league: "pop" },
  { name: "Dua Lipa", desoUsernames: ["dualipa", "DuaLipa"], team: "warner-records", league: "pop" },
  { name: "The Weeknd", desoUsernames: ["theweeknd", "TheWeeknd"], team: "republic-records", league: "rnb" },
  { name: "Eminem", desoUsernames: ["eminem", "Eminem"], team: "shady-records", league: "hiphop" },
  { name: "Jay-Z", desoUsernames: ["jayz", "JayZ", "hov"], team: "roc-nation", league: "hiphop" },
  { name: "Rihanna", desoUsernames: ["rihanna", "Rihanna"], team: "fenty", league: "pop" },
  { name: "Ariana Grande", desoUsernames: ["arianagrande", "ArianaGrande"], team: "republic-records", league: "pop" },

  // ── Streamers & Creators ──────────────────────────────────────
  { name: "MrBeast", desoUsernames: ["MrBeast", "mrbeast"], team: "youtube", league: "streamers" },
  { name: "IShowSpeed", desoUsernames: ["IShowSpeed", "ishowspeed"], team: "youtube", league: "streamers" },
  { name: "Kai Cenat", desoUsernames: ["KaiCenat", "kaicenat"], team: "twitch", league: "streamers" },
  { name: "xQc", desoUsernames: ["xqc", "xQcOW"], team: "kick", league: "streamers" },
  { name: "Logan Paul", desoUsernames: ["loganpaul", "LoganPaul"], team: "youtube", league: "streamers" },
  { name: "KSI", desoUsernames: ["ksi", "KSI"], team: "youtube", league: "streamers" },
  { name: "Pokimane", desoUsernames: ["pokimane", "Pokimane"], team: "twitch", league: "streamers" },
  { name: "Ninja", desoUsernames: ["ninja", "Ninja"], team: "twitch", league: "streamers" },
  { name: "Valkyrae", desoUsernames: ["valkyrae", "Valkyrae"], team: "youtube", league: "streamers" },
  { name: "Disguised Toast", desoUsernames: ["disguisedtoast", "DisguisedToast"], team: "youtube", league: "streamers" },
  { name: "HasanAbi", desoUsernames: ["hasanabi", "HasanAbi"], team: "twitch", league: "streamers" },
  { name: "Asmongold", desoUsernames: ["asmongold", "Asmongold"], team: "twitch", league: "streamers" },
  { name: "Shroud", desoUsernames: ["shroud", "Shroud"], team: "twitch", league: "streamers" },
  { name: "TimTheTatman", desoUsernames: ["timthetatman", "TimTheTatman"], team: "youtube", league: "streamers" },
  { name: "NICKMERCS", desoUsernames: ["nickmercs", "NICKMERCS"], team: "twitch", league: "streamers" },

  // ── Tech & Business ───────────────────────────────────────────
  { name: "Sam Altman", desoUsernames: ["samaltman", "SamAltman"], team: "openai", league: "tech" },
  { name: "Mark Zuckerberg", desoUsernames: ["markzuckerberg", "zuck"], team: "meta", league: "tech" },
  { name: "Jeff Bezos", desoUsernames: ["jeffbezos", "JeffBezos"], team: "amazon", league: "tech" },
  { name: "Sundar Pichai", desoUsernames: ["sundarpichai", "SundarPichai"], team: "google", league: "tech" },
  { name: "Jensen Huang", desoUsernames: ["jensenhuang", "JensenHuang"], team: "nvidia", league: "tech" },
  { name: "Balaji Srinivasan", desoUsernames: ["balajis", "balaji"], team: "network-state", league: "tech" },

  // ── Sports Teams ──────────────────────────────────────────────
  { name: "Kansas City Chiefs", desoUsernames: ["KansasCityChiefs", "chiefs"], team: "nfl", league: "nfl" },
  { name: "Los Angeles Lakers", desoUsernames: ["LosAngelesLakers", "lakers"], team: "nba", league: "nba" },
  { name: "New York Yankees", desoUsernames: ["NewYorkYankees", "yankees"], team: "mlb", league: "mlb" },
  { name: "Golden State Warriors", desoUsernames: ["GoldenStateWarriors", "warriors"], team: "nba", league: "nba" },
  { name: "Dallas Cowboys", desoUsernames: ["DallasCowboys", "cowboys"], team: "nfl", league: "nfl" },
  { name: "Manchester United", desoUsernames: ["manchesterunited", "ManUtd"], team: "premier-league", league: "soccer" },
  { name: "Real Madrid", desoUsernames: ["realmadrid", "RealMadrid"], team: "la-liga", league: "soccer" },
  { name: "UFC", desoUsernames: ["ufc", "UFC"], team: "endeavor", league: "ufc" },

  // ── Media Outlets ─────────────────────────────────────────────
  { name: "Fox News", desoUsernames: ["FoxNews", "foxnews"], team: "fox-corporation", league: "conservative-media" },
  { name: "ESPN", desoUsernames: ["ESPN", "espn"], team: "disney", league: "sports-media" },
  { name: "CNN", desoUsernames: ["CNN", "cnn"], team: "warner-bros-discovery", league: "progressive-media" },
  { name: "The Daily Wire", desoUsernames: ["thedailywire", "DailyWire"], team: "the-daily-wire", league: "conservative-media" },
  { name: "New York Times", desoUsernames: ["nytimes", "NYTimes"], team: "new-york-times", league: "journalism" },
  { name: "Barstool Sports", desoUsernames: ["barstoolsports", "BarstoolSports"], team: "penn-entertainment", league: "sports-media" },
];

export async function POST(req: Request) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  const { password } = await req.json().catch(() => ({}));
  if (adminPassword && password !== adminPassword) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();
  const results = [];

  for (const profile of MARQUEE_PROFILES) {
    const result = await importMarqueeProfileDeSoFirst(profile, supabase);
    results.push({ name: profile.name, ...result });
    await new Promise((r) => setTimeout(r, 500));
  }

  const fromDeso = results.filter((r) => r?.source === "deso").length;
  const fromShadow = results.filter((r) => r?.source === "shadow").length;
  const alreadyExisted = results.filter((r) => r?.status === "already_exists").length;

  return NextResponse.json({
    success: true,
    total: results.length,
    fromDeso,
    fromShadow,
    alreadyExisted,
    results,
  });
}
