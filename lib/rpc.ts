/**
 * lib/rpc.ts
 *
 * Shared Ethereum JSON-RPC utilities used by wallet-reader and live-positions.
 * All calls use raw eth_call with hand-encoded ABI — no external SDK required.
 */

export const DEFAULT_RPC = "https://cloudflare-eth.com";

export function getRpcUrl(): string {
  return process.env.ETH_RPC_URL ?? DEFAULT_RPC;
}

// ---------------------------------------------------------------------------
// ABI encoding helpers
// ---------------------------------------------------------------------------

export function encodeAddress(addr: string): string {
  return addr.replace(/^0x/, "").toLowerCase().padStart(64, "0");
}

export function encodeUint256(n: bigint): string {
  return n.toString(16).padStart(64, "0");
}

export function decodeUint256(hex: string): bigint {
  const cleaned = hex.replace(/^0x/, "");
  if (!cleaned || cleaned === "0".repeat(64)) return BigInt(0);
  return BigInt("0x" + cleaned.slice(0, 64));
}

export function decodeBool(hex: string): boolean {
  const cleaned = hex.replace(/^0x/, "").replace(/^0+/, "") || "0";
  return cleaned !== "0";
}

// ---------------------------------------------------------------------------
// Raw JSON-RPC call — throws on any error
// ---------------------------------------------------------------------------

export async function ethCall(
  to: string,
  data: string,
  rpcUrl?: string
): Promise<string> {
  const url = rpcUrl ?? getRpcUrl();
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "eth_call",
    params: [{ to, data }, "latest"],
  });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    signal: AbortSignal.timeout(6000),
  });

  if (!res.ok) throw new Error(`RPC HTTP ${res.status}: ${res.statusText}`);

  const json = (await res.json()) as {
    result?: string;
    error?: { message: string };
  };
  if (json.error) throw new Error(`RPC error: ${json.error.message}`);
  if (!json.result || json.result === "0x")
    throw new Error("RPC returned empty result");
  return json.result;
}

// ---------------------------------------------------------------------------
// Batch: run multiple ethCalls and return settled results
// ---------------------------------------------------------------------------

export async function ethCallBatch(
  calls: { to: string; data: string }[],
  rpcUrl?: string
): Promise<PromiseSettledResult<string>[]> {
  const url = rpcUrl ?? getRpcUrl();
  const body = JSON.stringify(
    calls.map((c, i) => ({
      jsonrpc: "2.0",
      id: i + 1,
      method: "eth_call",
      params: [{ to: c.to, data: c.data }, "latest"],
    }))
  );

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = (await res.json()) as Array<{
      id: number;
      result?: string;
      error?: { message: string };
    }>;

    // Re-order by id in case the RPC returns out-of-order
    const byId = new Map(json.map((r) => [r.id, r]));
    return calls.map((_, i) => {
      const r = byId.get(i + 1);
      if (!r) return { status: "rejected", reason: new Error("No response") };
      if (r.error) return { status: "rejected", reason: new Error(r.error.message) };
      if (!r.result || r.result === "0x")
        return { status: "rejected", reason: new Error("Empty result") };
      return { status: "fulfilled", value: r.result };
    });
  } catch {
    // Batch failed — fall back to individual calls
    return Promise.allSettled(calls.map((c) => ethCall(c.to, c.data, url)));
  }
}
