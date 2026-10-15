import { isAxiosError } from 'axios';

export function apiMessage(err: unknown, fallback: string): string {
    if (isAxiosError(err)) {
        const message = (err.response?.data as { message?: string | string[] } | undefined)?.message;
        if (Array.isArray(message) && message.length) return message[0];
        if (typeof message === 'string' && message) return message;
        if (!err.response) return 'The gateway is unreachable. Is the API running?';
    }
    return fallback;
}
