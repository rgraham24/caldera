import * as dotenv from "dotenv";
import path from "path";
import { ethers } from "ethers";
// @ts-ignore
import { signTx } from "deso-protocol";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const PLATFORM_PUBLIC_KEY = process.env.NEXT_PUBLIC_DESO_PLATFORM_PUBLIC_KEY ?? process.env.DESO_PLATFORM_PUBLIC_KEY ?? "";
const PLATFORM_MNEMONIC = process.env.DESO_PLATFORM_SEED ?? "";

function derivePrivateKeyHex(mnemonic: string): string {
  const root = ethers.utils.HDNode.fromMnemonic(mnemonic);
  const node = root.derivePath("m/44'/0'/0'/0/0");
  return node.privateKey.slice(2);
}

const PLATFORM_PRIVATE_KEY_HEX = derivePrivateKeyHex(PLATFORM_MNEMONIC);

async function main() {
  console.log("Renaming platform wallet profile back to CalderaPlatform...");
  const res = await fetch("https://api.deso.org/api/v0/update-profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      UpdaterPublicKeyBase58Check: PLATFORM_PUBLIC_KEY,
      ProfilePublicKeyBase58Check: "",
      NewUsername: "CalderaPlatform",
      NewDescription: "Caldera platform wallet. caldera.market",
      NewProfilePic: "",
      NewCreatorBasisPoints: 1000,
      NewStakeMultipleBasisPoints: 12500,
      IsHidden: false,
      MinFeeRateNanosPerKB: 1000,
    }),
  });
  const data = await res.json();
  if (!data.TransactionHex) { console.error("Failed:", data); process.exit(1); }
  const signed = await signTx(data.TransactionHex, PLATFORM_PRIVATE_KEY_HEX);
  const submitRes = await fetch("https://api.deso.org/api/v0/submit-transaction", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ TransactionHex: signed }),
  });
  const submitData = await submitRes.json();
  console.log(submitData.TxnHashHex ? `✅ Done — tx: ${submitData.TxnHashHex}` : `❌ Failed: ${JSON.stringify(submitData)}`);
}

main().catch(console.error);
