import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback, Profile } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
    constructor(private configService: ConfigService) {
        super({
            clientID: configService.get<string>('GOOGLE_CLIENT_ID') || 'not-configured',
            clientSecret: configService.get<string>('GOOGLE_CLIENT_SECRET') || 'not-configured',
            callbackURL: configService.get<string>('GOOGLE_CALLBACK_URL') || 'http://localhost:4000/auth/google/callback',
            scope: ['email', 'profile'],
        });
    }

    async validate(
        accessToken: string,
        refreshToken: string,
        profile: Profile,
        done: VerifyCallback,
    ): Promise<any> {
        const { name, emails, photos, id } = profile;

        const user = {
            provider: 'google',
            providerId: id,
            email: emails?.[0]?.value,
            name: name?.givenName ? `${name.givenName} ${name.familyName || ''}`.trim() : undefined,
            picture: photos?.[0]?.value,
            accessToken,
        };

        done(null, user);
    }
}
