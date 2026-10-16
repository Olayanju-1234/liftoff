import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { ConfirmEmailChangeDto } from './dto/confirm-email-change.dto';

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
  @ApiOperation({
    summary: "Update the caller's settings",
    description:
      'A new email is emailed a confirmation link and stays in pendingEmail until confirmed.',
  })
  updateSettings(
    @Body() updateSettingsDto: UpdateSettingsDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.settingsService.updateSettings(userId, updateSettingsDto);
  }

  // Public: the token is the proof, and the link may open where nobody is signed in.
  @Public()
  @Post('email/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm a pending email change' })
  confirmEmailChange(@Body() dto: ConfirmEmailChangeDto) {
    return this.settingsService.confirmEmailChange(dto.token);
  }
}
