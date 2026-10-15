import { ConfigService } from '@nestjs/config';

import { AuthService } from '../auth.service';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const authService = {} as AuthService;
  const originalSecret = process.env.JWT_SECRET;

  beforeEach(() => {
    delete process.env.JWT_SECRET;
  });

  afterAll(() => {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  });

  it('builds when JWT_SECRET is configured', () => {
    const config = new ConfigService({ JWT_SECRET: 'a'.repeat(32) });

    expect(new JwtStrategy(config, authService)).toBeInstanceOf(JwtStrategy);
  });

  it('refuses to start without JWT_SECRET instead of using a default secret', () => {
    const config = new ConfigService({});

    expect(() => new JwtStrategy(config, authService)).toThrow(/JWT_SECRET/);
  });
});
