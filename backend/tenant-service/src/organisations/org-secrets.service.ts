import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

export const ORG_SECRETS_KEY_ENV = 'ORG_SECRETS_KEY';
export const SECRETS_NOT_CONFIGURED =
  'Secrets cannot be stored on this deployment: ORG_SECRETS_KEY is not set';

const VERSION = 'v1';
const IV_BYTES = 12;

// Encrypts per-organisation secrets (today: the Stripe key) at rest with AES-256-GCM.
// The key is derived from ORG_SECRETS_KEY, so rotating that env var orphans stored values.
@Injectable()
export class OrgSecretsService {
  private readonly key: Buffer | null;

  constructor(config: ConfigService) {
    const raw = config.get<string>(ORG_SECRETS_KEY_ENV)?.trim();
    this.key = raw ? createHash('sha256').update(raw).digest() : null;
  }

  get enabled(): boolean {
    return this.key !== null;
  }

  encrypt(plain: string): string {
    const key = this.requireKey();
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plain, 'utf8'),
      cipher.final(),
    ]);
    return [VERSION, iv, cipher.getAuthTag(), ciphertext]
      .map((part) =>
        typeof part === 'string' ? part : part.toString('base64url'),
      )
      .join('.');
  }

  decrypt(blob: string): string {
    const key = this.requireKey();
    const [version, iv, tag, ciphertext] = blob.split('.');
    if (version !== VERSION || !iv || !tag || !ciphertext) {
      throw new Error('Stored secret is not in a known format');
    }
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(iv, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  private requireKey(): Buffer {
    if (!this.key) {
      throw new ServiceUnavailableException(SECRETS_NOT_CONFIGURED);
    }
    return this.key;
  }
}
