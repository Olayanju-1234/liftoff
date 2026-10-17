import { BadRequestException } from '@nestjs/common';

import {
  assertPublicDestination,
  isBlockedAddress,
  isBlockedHostname,
  parseWebhookUrl,
} from './destination';

describe('webhook destinations', () => {
  it.each([
    '127.0.0.1',
    '127.255.255.254',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '::1',
    '::',
    'fe80::1',
    'fd12::1',
    'fc00::1',
    '::ffff:127.0.0.1',
    '::ffff:10.0.0.1',
    'not-an-ip',
  ])('blocks %s', (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each([
    '8.8.8.8',
    '1.1.1.1',
    '172.32.0.1',
    '2606:4700::1111',
    '93.184.216.34',
  ])('allows %s', (address) => {
    expect(isBlockedAddress(address)).toBe(false);
  });

  it.each([
    'localhost',
    'LOCALHOST',
    'db.localhost',
    'rabbit.internal',
    'printer.local',
    '[::1]',
  ])('blocks the hostname %s', (host) => {
    expect(isBlockedHostname(host)).toBe(true);
  });

  describe('parseWebhookUrl', () => {
    it('accepts a public https URL and normalises it', () => {
      expect(parseWebhookUrl('https://Hooks.Acme.com/liftoff').toString()).toBe(
        'https://hooks.acme.com/liftoff',
      );
    });

    it.each([
      'nope',
      'mailto:a@b.c',
      'https://localhost/x',
      'https://a:b@hooks.acme.com/x',
    ])('rejects %s with 400', (raw) => {
      expect(() => parseWebhookUrl(raw)).toThrow(BadRequestException);
    });
  });

  describe('assertPublicDestination', () => {
    const url = new URL('https://hooks.acme.com/liftoff');

    it('passes when every resolved address is public', async () => {
      const resolve = jest
        .fn()
        .mockResolvedValue([
          { address: '93.184.216.34' },
          { address: '2606:4700::1111' },
        ]);

      await expect(
        assertPublicDestination(url, resolve),
      ).resolves.toBeUndefined();
      expect(resolve).toHaveBeenCalledWith('hooks.acme.com');
    });

    it('refuses a public name that resolves to a private address (DNS rebinding)', async () => {
      const resolve = jest
        .fn()
        .mockResolvedValue([
          { address: '93.184.216.34' },
          { address: '10.0.0.7' },
        ]);

      await expect(assertPublicDestination(url, resolve)).rejects.toThrow(
        'resolves to 10.0.0.7',
      );
    });

    it('refuses a name that does not resolve', async () => {
      await expect(
        assertPublicDestination(url, jest.fn().mockResolvedValue([])),
      ).rejects.toThrow('Could not resolve');
    });

    it('does not look up a literal public address', async () => {
      const resolve = jest.fn();

      await assertPublicDestination(new URL('https://8.8.8.8/hook'), resolve);

      expect(resolve).not.toHaveBeenCalled();
    });
  });
});
