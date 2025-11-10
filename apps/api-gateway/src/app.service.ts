// apps/api-gateway/src/app.service.ts

import { HttpService } from '@nestjs/axios';
import { HttpException, Injectable } from '@nestjs/common'; // 1. Import HttpException
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios'; // 2. Import AxiosError

export class CreateTenantDto {
  name: string;
  subdomain: string;
  planId: string;
}

@Injectable()
export class AppService {
  constructor(private readonly httpService: HttpService) { }

  // ... getHello() method might be here ...

  async createTenant(createTenantDto: CreateTenantDto) {
    // 3. --- ADD TRY/CATCH ---
    try {
      const { data } = await firstValueFrom(
        this.httpService.post('/tenants', createTenantDto),
      );
      return data;
    } catch (error) {
      // 4. --- HANDLE THE ERROR ---
      if (error instanceof AxiosError) {
        // This means the tenant-service sent us a clean error (like 409)
        // We just re-throw it so the user gets the clean message.
        throw new HttpException(
          error.response?.data, // The JSON { message: "...", statusCode: 409 }
          error.response?.status || 500, // The 409 status, or 500 if undefined
        );
      }
      // If it's not an Axios error, it's an unexpected crash
      throw error;
    }
  }
}