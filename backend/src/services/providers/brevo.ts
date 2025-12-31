// @ts-ignore - Brevo types not available
import * as brevo from '@getbrevo/brevo';

export interface BrevoConfig {
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

export class BrevoProvider {
  // @ts-ignore - Brevo types not available
  private apiInstance: any;
  private config: BrevoConfig;

  constructor(config: BrevoConfig) {
    this.config = config;
    // @ts-ignore - Brevo types not available
    this.apiInstance = new brevo.TransactionalEmailsApi();
    // @ts-ignore - Brevo types not available
    this.apiInstance.setApiKey(brevo.TransactionalEmailsApiApiKeys.apiKey, config.apiKey);
  }

  async sendEmail(params: SendEmailParams): Promise<{ messageId: string; provider: string }> {
    try {
      // @ts-ignore - Brevo types not available
      const sendSmtpEmail = new brevo.SendSmtpEmail();
      sendSmtpEmail.to = [{ email: params.to }];
      sendSmtpEmail.subject = params.subject;
      sendSmtpEmail.htmlContent = params.htmlContent;
      sendSmtpEmail.sender = {
        email: params.fromEmail || this.config.fromEmail,
        name: params.fromName || this.config.fromName || 'Followly',
      };

      const result = await this.apiInstance.sendTransacEmail(sendSmtpEmail);
      
      return {
        messageId: result.messageId || 'unknown',
        provider: 'brevo',
      };
    } catch (error: any) {
      throw new Error(`Brevo send error: ${error.message || 'Unknown error'}`);
    }
  }

  async getDailyLimit(): Promise<number> {
    // Brevo typically has tiered limits
    // This would need to be configured per account
    return 10000; // Default, should be configurable
  }
}

