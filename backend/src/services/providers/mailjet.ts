import mailjet, { Client } from 'node-mailjet';

export interface MailjetConfig {
  apiKey: string;
  apiSecret: string;
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

export class MailjetProvider {
  private client: Client;
  private config: MailjetConfig;

  constructor(config: MailjetConfig) {
    this.config = config;
    this.client = mailjet.apiConnect(config.apiKey, config.apiSecret);
  }

  async sendEmail(params: SendEmailParams): Promise<{ messageId: string; provider: string }> {
    try {
      const result = await this.client.post('send', { version: 'v3.1' }).request({
        Messages: [
          {
            From: {
              Email: params.fromEmail || this.config.fromEmail,
              Name: params.fromName || this.config.fromName || 'Followly',
            },
            To: [
              {
                Email: params.to,
              },
            ],
            Subject: params.subject,
            HTMLPart: params.htmlContent,
          },
        ],
      });

      const messageId = (result.body as any).Messages?.[0]?.To?.[0]?.MessageID || 'unknown';
      
      return {
        messageId: messageId.toString(),
        provider: 'mailjet',
      };
    } catch (error: any) {
      throw new Error(`Mailjet send error: ${error.message || 'Unknown error'}`);
    }
  }

  async getDailyLimit(): Promise<number> {
    // Mailjet limits vary by plan
    return 6000; // Default, should be configurable
  }
}

