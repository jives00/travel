/** Pure, dependency-free trusted-network check — mirrors Quest/Pulse/Trakt's
 * implementation. Trusts loopback, RFC1918, Tailscale CGNAT, and Tailscale's IPv6
 * ULA prefix; explicitly rejects anything arriving through a Cloudflare tunnel. */

interface Cidr {
  base: number[];
  bits: number;
}

function parseCidr(cidr: string): Cidr {
  const [ip, bitsStr] = cidr.split("/");
  return { base: ip.split(".").map(Number), bits: Number(bitsStr) };
}

const TRUSTED_V4_CIDRS: Cidr[] = [
  parseCidr("127.0.0.0/8"),
  parseCidr("10.0.0.0/8"),
  parseCidr("172.16.0.0/12"),
  parseCidr("192.168.0.0/16"),
  parseCidr("100.64.0.0/10"), // Tailscale CGNAT range
];

const TAILSCALE_V6_PREFIX = "fd7a:115c:a1e0";

function ipv4ToInt(parts: number[]): number {
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function isInCidr(ip: string, cidr: Cidr): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return false;
  const mask = cidr.bits === 0 ? 0 : (0xffffffff << (32 - cidr.bits)) >>> 0;
  return (ipv4ToInt(parts) & mask) === (ipv4ToInt(cidr.base) & mask);
}

function normalizeAddress(remoteAddress: string): string {
  return remoteAddress.startsWith("::ffff:") ? remoteAddress.slice(7) : remoteAddress;
}

export function isTrustedClient(
  headers: Record<string, string | string[] | undefined>,
  remoteAddress: string | undefined,
  extraCidrs: string[] = [],
): boolean {
  // Cloudflare tunnel headers present -> definitely not a trusted LAN/Tailscale client
  if (headers["cf-connecting-ip"] || headers["cf-ray"]) return false;
  if (!remoteAddress) return false;

  const ip = normalizeAddress(remoteAddress);

  if (ip.includes(":")) {
    return ip.toLowerCase().startsWith(TAILSCALE_V6_PREFIX);
  }

  const allCidrs = [...TRUSTED_V4_CIDRS, ...extraCidrs.map(parseCidr)];
  return allCidrs.some((cidr) => isInCidr(ip, cidr));
}
