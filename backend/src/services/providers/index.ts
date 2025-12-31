import { BrevoProvider, BrevoConfig } from './brevo';
import { MailjetProvider, MailjetConfig } from './mailjet';
import { ResendProvider, ResendConfig } from './resend';

export type ProviderType = 'brevo' | 'mailjet' | 'resend';

export interface ProviderConfig {
  provider: ProviderType;
  brevo?: BrevoConfig;
  mailjet?: MailjetConfig;
  resend?: ResendConfig;
  dailyLimit?: number;
  isDefault?: boolean;
}

export interface SendEmailParams {
  to: string;
  subject: string;
  htmlContent: string;
  fromEmail?: string;
  fromName?: string;
}

export class EmailProviderService {
  private providers: Map<ProviderType, BrevoProvider | MailjetProvider | ResendProvider> = new Map();
  private defaultProvider: ProviderType = 'brevo';

  addProvider(config: ProviderConfig): void {
    let provider: BrevoProvider | MailjetProvider | ResendProvider;

    switch (config.provider) {
      case 'brevo':
        if (!config.brevo) {
          throw new Error('Brevo config required');
        }
        provider = new BrevoProvider(config.brevo);
        break;
      case 'mailjet':
        if (!config.mailjet) {
          throw new Error('Mailjet config required');
        }
        provider = new MailjetProvider(config.mailjet);
        break;
      case 'resend':
        if (!config.resend) {
          throw new Error('Resend config required');
        }
        provider = new ResendProvider(config.resend);
        break;
      default:
        throw new Error(`Unknown provider: ${config.provider}`);
    }

    this.providers.set(config.provider, provider);
    
    if (config.isDefault) {
      this.defaultProvider = config.provider;
    }
  }

  async sendEmail(
    providerType: ProviderType | 'auto',
    params: SendEmailParams
  ): Promise<{ messageId: string; provider: string }> {
    const provider = providerType === 'auto' ? this.defaultProvider : providerType;
    const emailProvider = this.providers.get(provider);

    if (!emailProvider) {
      throw new Error(`Provider ${provider} not configured`);
    }

    return emailProvider.sendEmail(params);
  }

  getProvider(providerType: ProviderType): BrevoProvider | MailjetProvider | ResendProvider | undefined {
    return this.providers.get(providerType);
  }

  getDefaultProvider(): ProviderType {
    return this.defaultProvider;
  }

  hasProvider(providerType: ProviderType): boolean {
    return this.providers.has(providerType);
  }
}

