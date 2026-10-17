import { NotFoundException } from '@nestjs/common';
import { ParseStatusTokenPipe } from './parse-status-token.pipe';

describe('ParseStatusTokenPipe', () => {
  const pipe = new ParseStatusTokenPipe();

  it('passes a 43-character base64url token through', () => {
    const token = `${'a'.repeat(20)}_-${'Z9'.repeat(10)}0`;
    expect(token).toHaveLength(43);
    expect(pipe.transform(token)).toBe(token);
  });

  it.each([
    '',
    'short',
    'a'.repeat(42),
    'a'.repeat(44),
    `${'a'.repeat(42)}=`,
    `${'a'.repeat(42)}/`,
  ])('answers 404, the same as an unknown token, for %p', (bad) => {
    expect(() => pipe.transform(bad)).toThrow(NotFoundException);
  });
});
