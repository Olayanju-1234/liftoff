import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import {
  PROVISIONING_STEP_NAMES,
  type ProvisioningStepName,
} from '@liftoff/shared-types';

@Injectable()
export class ParseStepNamePipe
  implements PipeTransform<string, ProvisioningStepName>
{
  transform(value: string): ProvisioningStepName {
    if (!(PROVISIONING_STEP_NAMES as readonly string[]).includes(value)) {
      throw new BadRequestException(
        `Unknown step "${value}". Steps: ${PROVISIONING_STEP_NAMES.join(', ')}.`,
      );
    }
    return value as ProvisioningStepName;
  }
}
