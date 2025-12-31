import { Resend } from 'resend';

export interface ResendConfig {
  apiKey: string;
  fromEmail: string;
  fromName?: string;
}

export interface SendEmailParams {
  to: string;
  subject: string;
  htmlContent: string;
  fromEmail?: string;
  fromName?: string;
}

export class ResendProvider {
  private client: Resend;
  private config: ResendConfig;

  constructor(config: ResendConfig) {
    this.config = config;
    this.client = new Resend(config.apiKey);
  }

  async sendEmail(params: SendEmailParams): Promise<{ messageId: string; provider: string }> {
    try {
      const result = await this.client.emails.send({
        from: `${params.fromName || this.config.fromName || 'Followly'} <${params.fromEmail || this.config.fromEmail}>`,
        to: params.to,
        subject: params.subject,
        html: params.htmlContent,
      });

      if (result.error) {
        throw new Error(result.error.message || 'Resend send error');
      }

      return {
        messageId: result.data?.id || 'unknown',
        provider: 'resend',
      };
    } catch (error: any) {
      throw new Error(`Resend send error: ${error.message || 'Unknown error'}`);
    }
  }

  async getDailyLimit(): Promise<number> {
    // Resend typically has higher limits
    return 50000; // Default, should be configurable
  }
}

