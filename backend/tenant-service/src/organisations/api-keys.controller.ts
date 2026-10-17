import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ParseCuidPipe } from '../common/parse-cuid.pipe';
import { CurrentOrganisation } from '../auth/decorators/current-organisation.decorator';
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

@ApiTags('API keys')
@ApiBearerAuth('bearer')
@Controller('api-keys')
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a company API key',
    description: 'The key is returned once, in this response only.',
  })
  create(
    @Body() dto: CreateApiKeyDto,
    @CurrentOrganisation() organisationId: string,
  ) {
    return this.apiKeys.create(organisationId, dto.name);
  }

  @Get()
  @ApiOperation({ summary: "List the company's API keys (never the keys)" })
  list(@CurrentOrganisation() organisationId: string) {
    return this.apiKeys.list(organisationId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke an API key' })
  async revoke(
    @Param('id', ParseCuidPipe) id: string,
    @CurrentOrganisation() organisationId: string,
  ): Promise<void> {
    await this.apiKeys.revoke(organisationId, id);
  }
}
