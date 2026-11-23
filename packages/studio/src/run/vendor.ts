export type Vendor = "claude" | "codex" | "exec" | "gemini" | "opencode";

interface VendorRule {
  vendor: Vendor;
  matches(lowercased: string): boolean;
}

const vendorRules: VendorRule[] = [
  { vendor: "gemini", matches: (lowercased) => lowercased.includes("gemini") },
  { vendor: "opencode", matches: (lowercased) => lowercased.includes("opencode") },
  { vendor: "codex", matches: (lowercased) => lowercased.startsWith("gpt") },
];

export function vendorOf(model: string): Vendor {
  const lowercased = model.toLowerCase();

  return vendorRules.find((rule) => rule.matches(lowercased))?.vendor ?? "claude";
}
