import { SetMetadata } from '@nestjs/common';

export const ALLOW_API_KEY = 'allowApiKey';
// Lets a company API key, not only a user JWT, call the handler.
export const AllowApiKey = () => SetMetadata(ALLOW_API_KEY, true);
