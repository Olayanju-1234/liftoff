import { BadRequestException } from '@nestjs/common';
import { isIP } from 'net';
import { lookup } from 'dns/promises';

function ipv4(address: string): number {
  return (
    address.split('.').reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>>
    0
  );
}

// Anything a webhook must never reach: this host, the LAN, link-local and cloud metadata.
const BLOCKED_V4: [number, number][] = [
  [ipv4('0.0.0.0'), 8],
  [ipv4('10.0.0.0'), 8],
  [ipv4('100.64.0.0'), 10],
  [ipv4('127.0.0.0'), 8],
  [ipv4('169.254.0.0'), 16],
  [ipv4('172.16.0.0'), 12],
  [ipv4('192.0.0.0'), 24],
  [ipv4('192.0.2.0'), 24],
  [ipv4('192.168.0.0'), 16],
  [ipv4('198.18.0.0'), 15],
  [ipv4('198.51.100.0'), 24],
  [ipv4('203.0.113.0'), 24],
  [ipv4('224.0.0.0'), 3],
];

function isBlockedV4(address: string): boolean {
  const value = ipv4(address);
  return BLOCKED_V4.some(([network, bits]) => {
    const mask = (~0 << (32 - bits)) >>> 0;
    return (value & mask) >>> 0 === network;
  });
}

function isBlockedV6(address: string): boolean {
  const lower = address.toLowerCase();
  const mapped = /^(?:0*:)*:?ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (mapped) {
    return isBlockedV4(mapped[1]);
  }
  return (
    lower === '::' ||
    lower === '::1' ||
    /^fe[89ab]/.test(lower) ||
    /^f[cd]/.test(lower) ||
    lower.startsWith('ff')
  );
}

export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isBlockedV4(address);
  if (family === 6) return isBlockedV6(address);
  return true;
}

export function isBlockedHostname(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost')) {
    return true;
  }
  if (host.endsWith('.internal') || host.endsWith('.local')) {
    return true;
  }
  return isIP(host) !== 0 && isBlockedAddress(host);
}

// Checks the URL shape and any literal address. Runs when the URL is saved.
export function parseWebhookUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BadRequestException('webhookUrl is not a valid URL');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new BadRequestException('webhookUrl must use http or https');
  }
  if (url.username || url.password) {
    throw new BadRequestException('webhookUrl must not embed credentials');
  }
  if (isBlockedHostname(url.hostname)) {
    throw new BadRequestException(
      'webhookUrl must point at a public host, not a private or loopback address',
    );
  }
  return url;
}

export type Resolver = (hostname: string) => Promise<{ address: string }[]>;

const resolveAll: Resolver = (hostname) => lookup(hostname, { all: true });

// Resolves the host at delivery time, so a DNS record pointing inside is caught too.
export async function assertPublicDestination(
  url: URL,
  resolve: Resolver = resolveAll,
): Promise<void> {
  if (isBlockedHostname(url.hostname)) {
    throw new Error(`Refusing to deliver to blocked host ${url.hostname}`);
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) {
    return;
  }
  const addresses = await resolve(host);
  if (addresses.length === 0) {
    throw new Error(`Could not resolve ${url.hostname}`);
  }
  const blocked = addresses.find(({ address }) => isBlockedAddress(address));
  if (blocked) {
    throw new Error(
      `Refusing to deliver to ${url.hostname}: it resolves to ${blocked.address}`,
    );
  }
}
