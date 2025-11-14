import {
    Injectable,
    CanActivate,
    ExecutionContext,
    UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FastifyRequest } from 'fastify';

@Injectable()
export class AuthGuard implements CanActivate {
    private readonly masterApiKey: string;

    constructor(private readonly configService: ConfigService) {
        const apiKey = this.configService.get<string>('API_KEY');
        if (!apiKey) {
            throw new Error('API_KEY is not set in .env file for api-gateway');
        }
        this.masterApiKey = apiKey;
    }

    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest<FastifyRequest>();
        const authHeader = request.headers.authorization;

        if (!authHeader) {
            throw new UnauthorizedException('Authorization header is missing');
        }

        const [bearer, key] = authHeader.split(' ');

        if (bearer !== 'Bearer' || !key) {
            throw new UnauthorizedException('Invalid authorization header format');
        }

        if (key !== this.masterApiKey) {
            throw new UnauthorizedException('Invalid API key');
        }

        return true;
    }
}