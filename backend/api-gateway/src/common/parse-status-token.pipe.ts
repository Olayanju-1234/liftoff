import { Injectable, NotFoundException, PipeTransform } from '@nestjs/common';
import { STATUS_TOKEN_PATTERN } from '@liftoff/shared-types';

// Same answer as an unknown token, before anything reaches tenant-service.
@Injectable()
export class ParseStatusTokenPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!STATUS_TOKEN_PATTERN.test(value)) {
      throw new NotFoundException('No setup matches this link');
    }
    return value;
  }
}
