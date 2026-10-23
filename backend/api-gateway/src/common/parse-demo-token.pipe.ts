import { Injectable, NotFoundException, PipeTransform } from '@nestjs/common';
import { DEMO_TOKEN_PATTERN } from '@liftoff/shared-types';

// Same answer as an unknown token, before anything reaches tenant-service.
@Injectable()
export class ParseDemoTokenPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!DEMO_TOKEN_PATTERN.test(value)) {
      throw new NotFoundException(
        'This demo has ended or the link is incomplete',
      );
    }
    return value;
  }
}
