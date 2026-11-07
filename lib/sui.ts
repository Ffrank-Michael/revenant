// Small helpers for Sui addresses and coin types.

// Sui addresses can be written short (0x2) or in full (0x000...002). We always use the
// full form: "0x" + 64 lowercase hex characters, so two spellings of one wallet compare equal.
export function normalizeSuiAddress(address: string): string {
  const hex = address.trim().toLowerCase().replace(/^0x/, "");
  return "0x" + hex.padStart(64, "0");
}

export type ParsedCoinType = {
  packageId: string; // full-form package address
  module: string;
  name: string;
  coinType: string; // full-form coin type: 0x<64 hex>::module::NAME
};

// Accepts "0xPACKAGE::module::NAME". Returns null if it does not look like a coin type.
export function parseCoinType(input: string): ParsedCoinType | null {
  const m = /^(0x[0-9a-fA-F]{1,64})::([A-Za-z_][A-Za-z0-9_]*)::([A-Za-z_][A-Za-z0-9_]*)$/.exec(
    input.trim(),
  );
  if (!m) return null;
  const packageId = normalizeSuiAddress(m[1]);
  return { packageId, module: m[2], name: m[3], coinType: `${packageId}::${m[2]}::${m[3]}` };
}
