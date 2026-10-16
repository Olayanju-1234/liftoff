import { Controller, Get, Put, Body } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@ApiTags('Settings')
@ApiBearerAuth('bearer')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @ApiOperation({ summary: "Get the caller's settings" })
  getSettings(@CurrentUser('id') userId: string) {
    return this.settingsService.getSettings(userId);
  }

  @Put()
  @ApiOperation({ summary: "Update the caller's settings" })
  updateSettings(
    @Body() updateSettingsDto: UpdateSettingsDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.settingsService.updateSettings(userId, updateSettingsDto);
  }
}
