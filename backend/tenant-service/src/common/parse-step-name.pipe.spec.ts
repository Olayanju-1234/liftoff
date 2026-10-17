import { BadRequestException } from '@nestjs/common';
import { ParseStepNamePipe } from './parse-step-name.pipe';

describe('ParseStepNamePipe', () => {
  const pipe = new ParseStepNamePipe();

  it.each(['database', 'address', 'credentials', 'billing', 'welcome'])(
    'passes %s through',
    (step) => {
      expect(pipe.transform(step)).toBe(step);
    },
  );

  it.each(['dnsStatus', 'Database', 'notification', ''])(
    'refuses %p with 400 naming the steps',
    (step) => {
      expect(() => pipe.transform(step)).toThrow(BadRequestException);
      expect(() => pipe.transform(step)).toThrow(
        'Steps: database, address, credentials, billing, welcome.',
      );
    },
  );
});
