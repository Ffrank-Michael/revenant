// Coin objects as a fingerprint.
//
// On Sui, SUI is held as separate "coin objects", each with its own ID. When a coin object is sent
// WHOLE (not split or merged), it keeps its ID. So if a coin object created in one rug's pull shows up
// in another creator's wallet, that is hard proof the money moved between them.
//
// Server-side only. Reads the chain through Tatum; never writes anything.

import { suiGraphQL } from "./tatum";
import { normalizeSuiAddress } from "./sui";

export type CoinObjectRef = {
  id: string; // the coin object ID
  role: "gas_coin" | "pull_output"; // paid the gas for the pull, or was created/changed by it
  digest: string; // the pull transaction it was seen in
};

const SUI_COIN_SUFFIX = "::coin::Coin<0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI>";
const SUI_COIN_TYPE = "0x2::coin::Coin<0x2::sui::SUI>";
const MAX_PULL_TXS = 4;
const RECENT_TXS = 30;
const HISTORY_FLOOR_CHECKPOINT = 237_661_232; // Tatum's history starts here (about 23 Jan 2026)

type ObjectChangeNode = {
  address: string;
  idDeleted: boolean;
  outputState: { asMoveObject: { contents: { type: { repr: string } } | null; owner: { address?: { address: string } } | null } | null } | null;
};
type TxCoins = {
  gasInput: { gasPayment: { nodes: { address: string }[] } } | null;
  effects: { objectChanges: { nodes: ObjectChangeNode[] } } | null;
};

const TX_COINS = `gasInput{ gasPayment(first:10){ nodes{ address } } }
  effects{ objectChanges(first:40){ nodes{ address idDeleted outputState{ asMoveObject{
    contents{ type{ repr } } owner{ ... on AddressOwner{ address{ address } } } } } } } }`;

// SUI coin objects a transaction used for gas or left behind (created or changed, still alive).
function coinsOfTx(tx: TxCoins): { gas: string[]; out: string[] } {
  const gas = (tx.gasInput?.gasPayment.nodes ?? []).map((n) => normalizeSuiAddress(n.address));
  const out = (tx.effects?.objectChanges.nodes ?? [])
    .filter((c) => !c.idDeleted && c.outputState?.asMoveObject?.contents?.type.repr.endsWith(SUI_COIN_SUFFIX))
    .map((c) => normalizeSuiAddress(c.address));
  return { gas, out };
}

// The coin objects touched by the pull transactions of a rug (the liquidity-removal transactions).
export async function pullCoinObjects(digests: string[]): Promise<CoinObjectRef[]> {
  const found = new Map<string, CoinObjectRef>();
  for (const digest of [...new Set(digests)].slice(0, MAX_PULL_TXS)) {
    const d: { transaction: TxCoins | null } = await suiGraphQL(`query($d:String!){ transaction(digest:$d){ ${TX_COINS} } }`, { d: digest });
    if (!d.transaction) continue;
    const { gas, out } = coinsOfTx(d.transaction);
    for (const id of out) if (!found.has(id)) found.set(id, { id, role: "pull_output", digest });
    for (const id of gas) found.set(id, { id, role: "gas_coin", digest }); // gas role wins if both
  }
  return [...found.values()];
}

// The SUI coin objects a wallet holds now, plus the ones in its most recent transactions (sent or received).
export async function walletCoinObjects(address: string): Promise<Map<string, "holds now" | "seen in a transaction">> {
  const a = normalizeSuiAddress(address);
  const seen = new Map<string, "holds now" | "seen in a transaction">();

  const held: { objects: { nodes: { address: string }[] } } = await suiGraphQL(
    `query($o:SuiAddress!,$t:String!){ objects(first:50, filter:{ type:$t, owner:$o }){ nodes{ address } } }`,
    { o: a, t: SUI_COIN_TYPE },
  );
  for (const n of held.objects.nodes) seen.set(normalizeSuiAddress(n.address), "holds now");

  const txs: { transactions: { nodes: TxCoins[] } } = await suiGraphQL(
    `query($o:SuiAddress!,$n:Int!,$from:UInt53){ transactions(last:$n, filter:{ affectedAddress:$o, afterCheckpoint:$from }){ nodes{ ${TX_COINS} } } }`,
    { o: a, n: RECENT_TXS, from: HISTORY_FLOOR_CHECKPOINT }, // Tatum refuses searches that start below its history
  );
  for (const tx of txs.transactions.nodes) {
    const { gas, out } = coinsOfTx(tx);
    for (const id of [...gas, ...out]) if (!seen.has(id)) seen.set(id, "seen in a transaction");
  }
  return seen;
}
