import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

// We can't import the DTO from a different service,
// so we'll redefine it for the gateway.
// (We will fix this with a shared package later)
export class CreateTenantDto {
  name: string;
  subdomain: string;
  planId: string;
}

@Injectable()
export class AppService {
  // 1. Inject HttpService
  constructor(private readonly httpService: HttpService) { }

  // 2. Create the proxy method
  async createTenant(createTenantDto: CreateTenantDto) {
    // We use firstValueFrom to convert the Observable to a Promise
    const { data } = await firstValueFrom(
      // 3. Make the POST request to the tenant-service
      this.httpService.post('/tenants', createTenantDto),
    );
    return data;
  }
}