import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { SentryService } from './sentry.service';

@Catch()
export class SentryExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger(SentryExceptionFilter.name);

    constructor(private readonly sentryService: SentryService) { }

    catch(exception: unknown, host: ArgumentsHost) {
        const contextType = host.getType();

        // Only handle HTTP contexts - let RabbitMQ handle its own errors
        if (contextType !== 'http') {
            // For non-HTTP contexts (RabbitMQ, etc.), just log and re-throw
            const error = exception instanceof Error ? exception : new Error(String(exception));
            // Don't log JWT 'authorization' errors for RabbitMQ handlers - these are expected
            if (!error.message.includes("reading 'authorization'")) {
                this.logger.error(`Non-HTTP error: ${error.message}`);
            }
            throw exception;
        }

        const ctx = host.switchToHttp();
        const response = ctx.getResponse<FastifyReply>();
        const request = ctx.getRequest<FastifyRequest>();

        // Guard against undefined request/response
        if (!request || !response) {
            this.logger.error('Exception occurred but no HTTP context available');
            throw exception;
        }

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
