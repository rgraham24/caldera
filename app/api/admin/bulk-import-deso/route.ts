import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_KEYS } from "@/lib/admin/market-generator";

// Curated list of known DeSo usernames across all categories
// These are real profiles that exist on DeSo with active coins
const DESO_USERNAME_BATCHES: string[][] = [
  // Batch 1 — Top DeSo OGs + crypto
  ["dharmesh","Da5id","PremierNS","diamondhands","pearl","artz","nader","naval",
   "chamath","balajis","elonmusk","realdonaldtrump","vitalikbuterin","cz_binance",
   "shl","craig","scottadamssays","madonna","arodb","trevian",
   "gainzy","maebeam","salilsethi","clayspace","clayvis"],

  // Batch 2 — Streamers / creators
  ["loganpaul","ksi","MrBeast","IShowSpeed","xqc","KaiCenat","pokimane",
   "ninja","Valkyrae","DisguisedToast","HasanAbi","Asmongold","Shroud",
   "TimTheTatman","NICKMERCS","DrDisrespect","Tfue","summit1g","sodapoppin",
   "moistcr1tikal","penguinz0","jacksepticeye","markiplier","pewdiepie"],

  // Batch 3 — Athletes
  ["lebronjames","tombrady","tigerwoods","conormcgregor","LionelMessi",
   "cristiano","stephencurry","patrickmahomes","serenawilliams","novakdjokovic",
   "jonjones","caneloalvarez","tysonfury","anthonyjoshua","kyliejenner",
   "kimkardashian","kendalljenner","justinbieber","arianagrande","selenagomez"],

  // Batch 4 — Music
  ["drake","kanyewest","beyonce","taylorswift","TravisScott","kendricklamar",
   "nickiminaj","eminem","jayz","rihanna","theweeknd","postmalone","badbunny",
   "billieeilish","dualipa","lizzo","cardib","megantheestallion","dojacatmusic",
   "oliviarodrigo","harrystyles","edzsheeran","adele","brunomarss"],

  // Batch 5 — Pundits / commentary
  ["tuckercarlson","benshapiro","joerogan","jordanpeterson","lexfridman",
   "hubermanlab","timpool","daverubin","glennbeck","megynkelly","rachelmaddow",
   "billmaher","samharris","bariweiss","scottgalloway","profgalloway",
   "andrewsullivan","matttaibbi","glenngreenwald","jessesignorino"],

  // Batch 6 — Tech / business
  ["samaltman","markzuckerberg","jeffbezos","sundarpichai","jensenhuang",
   "satyanadella","timcook","jackdorsey","ev","paulg","ycombinator",
   "andrewchen","eriktorenberg","packyM","byrnehobart","stratechery"],

  // Batch 7 — Politics
  ["aoc","rondesantis","gavinnewsom","nikkihaley",
   "berniesanders","tedcruz","jdvance","mikepence",
   "hillaryclinton","elizabethwarren","marcorubio","randpaul","tulsigabbard"],

  // Batch 8 — Sports teams
  ["lakers","chiefs","yankees","warriors","patriots","cowboysNFL",
   "realmadrid","manchesterunited","barcelona","liverpool","chelsea",
   "UFC","WWE","nba","nfl","mlb","nhl","espn"],

  // Batch 9 — Entertainment / viral
  ["johnnysomali","ac7ionman","destiny","moistcr1tikal","jidion",
   "adin","amp","fanum","duke","chrismd","wroetoshaw","miniminter",
   "calluxofficial","calfreezy","vikstarr123","behzinga"],

  // Batch 10 — DeSo ecosystem / web3
  ["naderthemaker","clayspace","tijn","maebeam","rigelrozanski",
   "lazynina","bitcloutpulse","desoprotocol","diamondapp","openfund",
   "daodao","heroswap","polygram","desocialworld","bitcloutx"],
];

async function getDesoPriceUsd(): Promise<number> {
  try {
    const res = await fetch("https://api.deso.org/api/v0/get-exchange-rate");
    if (!res.ok) return 5;
    const data = await res.json();
    const cents = data?.USDCentsPerDeSoExchangeRate ?? 0;
    return cents > 0 ? cents / 100 : 5;
  } catch { return 5; }
}

export async function POST(req: NextRequest) {
  try {
    const {
      batchIndex = 0,
      adminPassword,
      desoPublicKey,
      minHolders = 0,
    } = await req.json();

    const isAdmin =
      ADMIN_KEYS.includes(desoPublicKey || "") ||
      (process.env.ADMIN_PASSWORD && adminPassword === process.env.ADMIN_PASSWORD);

    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const batch = DESO_USERNAME_BATCHES[batchIndex];
    if (!batch) {
      return NextResponse.json({
        data: { message: "All batches complete!", totalBatches: DESO_USERNAME_BATCHES.length },
      });
    }

    const desoPriceUsd = await getDesoPriceUsd();
    const supabase = await createClient();
    const startTime = Date.now();

    let totalImported = 0;
    let totalSkipped = 0;

    // Fetch all profiles in parallel — get-single-profile is fast
    const results = await Promise.allSettled(
      batch.map((username) =>
        fetch("https://api.deso.org/api/v0/get-single-profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ Username: username }),
        })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)
      )
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: Record<string, any>[] = [];
    for (const result of results) {
      if (result.status !== "fulfilled" || !result.value?.Profile) {
        totalSkipped++;
        continue;
      }

      const p = result.value.Profile;
      const username = p.Username as string;
      if (!username) { totalSkipped++; continue; }

      const coinPriceNanos = (p.CoinPriceDeSoNanos as number) || 0;
      const coinEntry = p.CoinEntry as Record<string, unknown> | undefined;
      const holders = (coinEntry?.NumberOfHolders as number) || 0;

      if (coinPriceNanos === 0 && holders === 0) { totalSkipped++; continue; }
      if (holders < minHolders) { totalSkipped++; continue; }

      const coinPriceUSD = (coinPriceNanos / 1e9) * desoPriceUsd;
      const slug = username.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const publicKey = p.PublicKeyBase58Check as string;
      const coinsNanos = (coinEntry?.CoinsInCirculationNanos as number) || 0;
      const tokenStatus = holders > 10 && coinPriceUSD > 2 ? "active_unverified" : "shadow";

      rows.push({
        name: username,
        slug,
        deso_username: username,
        deso_public_key: publicKey,
        image_url: `https://node.deso.org/api/v0/get-single-profile-picture/${publicKey}`,
        creator_coin_price: coinPriceUSD,
        creator_coin_holders: holders,
        creator_coin_market_cap: (coinsNanos / 1e9) * coinPriceUSD,
        creator_coin_symbol: username.toUpperCase().replace(/[^A-Z0-9]/g, "").substring(0, 20),
        token_status: tokenStatus,
        estimated_followers: holders * 100,
        bio: (p.Description as string) ?? null,
      });
    }

    if (rows.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("creators")
        .upsert(rows, { onConflict: "slug", ignoreDuplicates: false });
      if (error) {
        console.warn("[bulk-import] Upsert error:", error.message);
        totalSkipped += rows.length;
        totalImported = 0;
      } else {
        totalImported += rows.length;
      }
    }

    const nextBatchIndex = batchIndex + 1;
    const hasMore = nextBatchIndex < DESO_USERNAME_BATCHES.length;

    return NextResponse.json({
      data: {
        totalImported,
        totalSkipped,
        batchIndex,
        nextBatchIndex: hasMore ? nextBatchIndex : null,
        hasMore,
        totalBatches: DESO_USERNAME_BATCHES.length,
        desoPriceUsd,
        elapsed: Date.now() - startTime,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
