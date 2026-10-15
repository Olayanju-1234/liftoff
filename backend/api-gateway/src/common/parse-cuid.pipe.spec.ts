import { BadRequestException } from '@nestjs/common';

import { ParseCuidPipe } from './parse-cuid.pipe';

describe('ParseCuidPipe', () => {
  const pipe = new ParseCuidPipe();

  it('passes a Prisma cuid through unchanged', () => {
    expect(pipe.transform('cmv9gs7040002vyzf6leznb2s')).toBe(
      'cmv9gs7040002vyzf6leznb2s',
    );
  });

  it.each([
    ['a UUID', '3f2b8c1e-9a4d-4e7b-8c2f-1d5e6a7b8c9d'],
    ['a path traversal', '../settings'],
    ['an embedded slash', 'cmv9gs7040002/vyzf6leznb2s'],
    ['uppercase characters', 'CMV9GS7040002VYZF6LEZNB2S'],
    ['a short id', 'cmv9gs704'],
    ['a long id', 'cmv9gs7040002vyzf6leznb2sx'],
    ['the wrong prefix', 'xmv9gs7040002vyzf6leznb2s'],
    ['an empty string', ''],
  ])('rejects %s', (_label, value) => {
    expect(() => pipe.transform(value)).toThrow(BadRequestException);
  });
});
