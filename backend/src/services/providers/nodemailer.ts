import nodemailer, { Transporter } from 'nodemailer';

export interface NodemailerConfig {
  host: string;
  port: number;
  secure: boolean; // true for 465 (SSL), false for other ports (TLS)
  user: string;
  pass: string;
  fromEmail: string;
  fromName?: string;
  // DKIM configuration for better deliverability
  dkim?: {
    domainName: string;    // e.g., "example.com"
    keySelector: string;   // e.g., "default" or "mail"
    privateKey: string;    // Private key for DKIM signing
  };
  // Optional pool settings for high-volume sending
  pool?: boolean;          // Use pooled connections
  maxConnections?: number; // Max simultaneous connections
  maxMessages?: number;    // Max messages per connection
}

export interface SendEmailParams {
  to: string;
  subject: string;
  htmlContent: string;
  fromEmail?: string;
  fromName?: string;
}

export class NodemailerProvider {
  private transporter: Transporter;
  private config: NodemailerConfig;

  constructor(config: NodemailerConfig) {
    this.config = config;
    
    // Build transport options
    const transportOptions: any = {
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.pass,
      },
    };

    // Enable connection pooling for high-volume sending
    if (config.pool) {
      transportOptions.pool = true;
      transportOptions.maxConnections = config.maxConnections || 5;
      transportOptions.maxMessages = config.maxMessages || 100;
    }

    // Add DKIM signing if configured
    if (config.dkim && config.dkim.privateKey) {
      transportOptions.dkim = {
        domainName: config.dkim.domainName,
        keySelector: config.dkim.keySelector,
        privateKey: config.dkim.privateKey,
      };
    }

    // Set reasonable timeouts
    transportOptions.connectionTimeout = 30000; // 30 seconds
    transportOptions.greetingTimeout = 30000;
    transportOptions.socketTimeout = 60000; // 60 seconds for slow servers

    this.transporter = nodemailer.createTransport(transportOptions);
  }

  async sendEmail(params: SendEmailParams): Promise<{ messageId: string; provider: string }> {
    try {
      const fromAddress = params.fromEmail || this.config.fromEmail;
      const fromName = params.fromName || this.config.fromName || 'Followly';
      
      const mailOptions = {
        from: `${fromName} <${fromAddress}>`,
        to: params.to,
        subject: params.subject,
        html: params.htmlContent,
        // Add headers for better deliverability
        headers: {
          'X-Mailer': 'Followly',
          'X-Priority': '3', // Normal priority
        },
      };

      const result = await this.transporter.sendMail(mailOptions);

      return {
        messageId: result.messageId || 'unknown',
        provider: 'nodemailer',
      };
    } catch (error: any) {
      // Provide detailed error messages for common SMTP issues
      let errorMessage = error.message || 'Unknown error';
      const errorResponse = error.response || '';
      const errorResponseLower = errorResponse.toLowerCase();
      
      // Check for rate limit errors in response message
      const isRateLimitError = errorResponseLower.includes('exceeded') ||
                               errorResponseLower.includes('rate limit') ||
                               errorResponseLower.includes('max emails per hour') ||
                               errorResponseLower.includes('too many emails') ||
                               errorResponseLower.includes('quota exceeded') ||
                               error.message?.toLowerCase().includes('exceeded') ||
                               error.message?.toLowerCase().includes('rate limit');
      
      if (error.code === 'ECONNREFUSED') {
        errorMessage = `Connection refused to ${this.config.host}:${this.config.port}. Check your SMTP host and port settings.`;
      } else if (error.code === 'ETIMEDOUT') {
        errorMessage = `Connection timed out to ${this.config.host}:${this.config.port}. The server may be unreachable.`;
      } else if (error.code === 'EAUTH') {
        errorMessage = 'Authentication failed. Check your SMTP username and password.';
      } else if (error.responseCode === 550) {
        errorMessage = `Recipient rejected: ${error.response || 'Unknown reason'}`;
      } else if (error.responseCode === 553) {
        errorMessage = `Invalid sender address: ${error.response || 'Check from_email'}`;
      } else if (error.responseCode === 421 || error.responseCode === 450) {
        // SMTP codes that might indicate rate limiting
        errorMessage = `Service unavailable: ${error.response || 'Rate limit may have been exceeded'}`;
      } else if (isRateLimitError) {
        // Rate limit error detected
        errorMessage = `Rate limit exceeded: ${error.response || error.message || 'Hourly sending limit reached'}`;
        // Add a flag to the error so the worker can detect it
        (error as any).isRateLimitError = true;
      }

      const finalError = new Error(`Nodemailer send error: ${errorMessage}`);
      // Preserve rate limit flag
      if (isRateLimitError) {
        (finalError as any).isRateLimitError = true;
        (finalError as any).responseCode = error.responseCode;
      }
      throw finalError;
    }
  }

  /**
   * Verify SMTP connection and authentication
   * Call this after configuration to validate settings
   */
  async verifyConnection(): Promise<boolean> {
    try {
      await this.transporter.verify();
      return true;
    } catch (error: any) {
      console.error('SMTP verification failed:', error.message);
      return false;
    }
  }

  async getDailyLimit(): Promise<number> {
    // Nodemailer with your own SMTP has no inherent limit
    // Return a very high number to indicate unlimited sending
    return 1000000; // 1 million (effectively unlimited)
  }

  /**
   * Close the transporter (important for pooled connections)
   */
  close(): void {
    this.transporter.close();
  }
}
