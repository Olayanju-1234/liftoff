import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

// Shape of Prisma's @default(cuid()); anything else can't be a tenant id, so skip the DB round trip.
const CUID = /^c[a-z0-9]{24}$/;

@Injectable()
export class ParseCuidPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!CUID.test(value)) {
      throw new BadRequestException('Validation failed (cuid is expected)');
    }
    return value;
  }
}
