import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-github2';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github') {
    constructor(private configService: ConfigService) {
        super({
            clientID: configService.get<string>('GITHUB_CLIENT_ID') || 'not-configured',
            clientSecret: configService.get<string>('GITHUB_CLIENT_SECRET') || 'not-configured',
            callbackURL: configService.get<string>('GITHUB_CALLBACK_URL') || 'http://localhost:4000/auth/github/callback',
            scope: ['user:email'],
        });
    }

    async validate(
        accessToken: string,
        refreshToken: string,
        profile: Profile,
        done: (err: any, user: any) => void,
    ): Promise<any> {
        const { id, username, displayName, emails, photos } = profile;

        const user = {
            provider: 'github',
            providerId: id,
            email: emails?.[0]?.value,
            name: displayName || username,
            picture: photos?.[0]?.value,
            accessToken,
        };

        done(null, user);
    }
}
