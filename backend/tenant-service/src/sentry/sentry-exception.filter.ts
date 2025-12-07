import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { SentryService } from './sentry.service';

@Catch()
export class SentryExceptionFilter implements ExceptionFilter {
    constructor(private readonly sentryService: SentryService) { }

    catch(exception: unknown, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<FastifyReply>();
        const request = ctx.getRequest<FastifyRequest>();

        const status = exception instanceof HttpException
            ? exception.getStatus()
            : HttpStatus.INTERNAL_SERVER_ERROR;

        const message = exception instanceof HttpException
            ? exception.message
            : 'Internal server error';

        // Only capture non-client errors to Sentry
        if (status >= 500) {
            this.sentryService.captureException(
                exception instanceof Error ? exception : new Error(String(exception)),
                {
                    url: request.url,
                    method: request.method,
                    statusCode: status,
                },
            );
        }

        response.status(status).send({
            statusCode: status,
            message,
            timestamp: new Date().toISOString(),
            path: request.url,
        });
    }
}
