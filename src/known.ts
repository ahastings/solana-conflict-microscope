const LABELS: Record<string, string> = {
  "11111111111111111111111111111111": "System Program",
  "Vote111111111111111111111111111111111111111": "Vote Program",
  "Stake11111111111111111111111111111111111111": "Stake Program",
  "Config1111111111111111111111111111111111111": "Config Program",
  "ComputeBudget111111111111111111111111111111": "Compute Budget Program",
  "AddressLookupTab1e1111111111111111111111111": "Address Lookup Table Program",
  "BPFLoaderUpgradeab1e11111111111111111111111": "BPF Upgradeable Loader",
  "BPFLoader2111111111111111111111111111111111": "BPF Loader 2",
  "LoaderV411111111111111111111111111111111111": "Loader v4",
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA": "SPL Token Program",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb": "Token-2022 Program",
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL": "Associated Token Account Program",
  "SysvarC1ock11111111111111111111111111111111": "Clock Sysvar",
  "SysvarEpochSchedu1e111111111111111111111111": "Epoch Schedule Sysvar",
  "SysvarFees111111111111111111111111111111111": "Fees Sysvar",
  "SysvarRecentB1ockHashes11111111111111111111": "Recent Blockhashes Sysvar",
  "SysvarRent111111111111111111111111111111111": "Rent Sysvar",
  "SysvarRewards111111111111111111111111111111": "Rewards Sysvar",
  "SysvarS1otHashes111111111111111111111111111": "Slot Hashes Sysvar",
  "SysvarS1otHistory11111111111111111111111111": "Slot History Sysvar",
  "SysvarStakeHistory1111111111111111111111111": "Stake History Sysvar",
  "Sysvar1nstructions1111111111111111111111111": "Instructions Sysvar",
};

export function knownAccountLabel(address: string): string | null { return LABELS[address] ?? null; }
export function isKnownSysvar(address: string): boolean { return (LABELS[address] ?? "").endsWith("Sysvar"); }
export function programLabel(address: string | null, parsedProgram?: string | null): string {
  if (address && LABELS[address]) return LABELS[address];
  if (parsedProgram) return parsedProgram;
  return address ? `Unknown program ${address}` : "Unknown program";
}

