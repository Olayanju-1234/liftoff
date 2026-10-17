import { Injectable, NotFoundException, PipeTransform } from '@nestjs/common';
import { STATUS_TOKEN_PATTERN } from '@liftoff/shared-types';

// Anything that is not 43 base64url characters cannot be a status token; answer the same
// 404 as an unknown token so the route gives nothing away, and skip the DB round trip.
@Injectable()
export class ParseStatusTokenPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!STATUS_TOKEN_PATTERN.test(value)) {
      throw new NotFoundException('No setup matches this link');
    }
    return value;
  }
}
