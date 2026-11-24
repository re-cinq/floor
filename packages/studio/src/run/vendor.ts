export type Vendor = "claude" | "codex" | "exec" | "gemini" | "opencode";

interface VendorRule {
  vendor: Vendor;
  matches(lowercased: string): boolean;
}

const vendorRules: VendorRule[] = [
  { vendor: "exec", matches: (lowercased) => lowercased === "exec" },
  { vendor: "gemini", matches: (lowercased) => lowercased.includes("gemini") },
  { vendor: "opencode", matches: (lowercased) => lowercased.includes("opencode") },
  { vendor: "codex", matches: (lowercased) => lowercased.includes("codex") || ["gpt", "o1", "o3", "o4"].some((prefix) => lowercased.startsWith(prefix)) },
];

export function vendorOf(model: string): Vendor {
  const lowercased = model.toLowerCase();

  return vendorRules.find((rule) => rule.matches(lowercased))?.vendor ?? "claude";
}
