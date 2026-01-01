import crypto from 'crypto';
import { pool } from '../database/connection';

/**
 * Generate a unique unsubscribe token for a contact
 */
export function generateUnsubscribeToken(userId: number, email: string): string {
  const data = `${userId}:${email}:${Date.now()}`;
  return crypto.createHash('sha256').update(data).digest('hex').substring(0, 32);
}

/**
 * Generate unsubscribe URL
 */
export function getUnsubscribeUrl(email: string, token?: string): string {
  const baseUrl = process.env.FRONTEND_URL || process.env.APP_URL || 'http://localhost:5173';
  if (token) {
    return `${baseUrl}/unsubscribe?email=${encodeURIComponent(email)}&token=${token}`;
  }
  return `${baseUrl}/unsubscribe?email=${encodeURIComponent(email)}`;
}

/**
 * Get user's footer settings (company address and custom footer text)
 */
export async function getUserFooterSettings(userId: number): Promise<{
  companyAddress: string | null;
  customFooterText: string | null;
}> {
  const result = await pool.query(
    'SELECT company_address, custom_footer_text FROM users WHERE id = $1',
    [userId]
  );

  if (result.rows.length === 0) {
    return { companyAddress: null, customFooterText: null };
  }

  return {
    companyAddress: result.rows[0].company_address || null,
    customFooterText: result.rows[0].custom_footer_text || null,
  };
}

/**
 * Generate unsubscribe footer HTML
 */
export async function generateUnsubscribeFooter(
  userId: number,
  contactEmail: string,
  options?: {
    includePreferences?: boolean;
    includeViewInBrowser?: boolean;
  }
): Promise<string> {
  const settings = await getUserFooterSettings(userId);
  const unsubscribeUrl = getUnsubscribeUrl(contactEmail);
  
  const defaultFooterText = settings.customFooterText || "Don't want to receive these emails?";
  const companyAddress = settings.companyAddress || '';

  let footer = `
<div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e0e0e0; font-size: 12px; color: #666; line-height: 1.6;">
  <p style="margin: 0 0 10px 0;">
    ${defaultFooterText} <a href="${unsubscribeUrl}" style="color: #000; text-decoration: underline;">Unsubscribe</a>
  </p>`;

  if (options?.includePreferences) {
    footer += `
  <p style="margin: 0 0 10px 0;">
    <a href="${unsubscribeUrl.replace('unsubscribe', 'preferences')}" style="color: #000; text-decoration: underline;">Update your preferences</a>
  </p>`;
  }

  if (options?.includeViewInBrowser) {
    footer += `
  <p style="margin: 0 0 10px 0;">
    <a href="#" style="color: #000; text-decoration: underline;">View in browser</a>
  </p>`;
  }

  if (companyAddress) {
    footer += `
  <p style="margin: 10px 0 0 0; font-size: 11px; color: #999;">
    ${companyAddress}
  </p>`;
  }

  footer += `
</div>`;

  return footer;
}

/**
 * Append unsubscribe footer to email content
 */
export async function appendUnsubscribeFooter(
  userId: number,
  contactEmail: string,
  htmlContent: string,
  options?: {
    includePreferences?: boolean;
    includeViewInBrowser?: boolean;
  }
): Promise<string> {
  // Don't append if footer already exists (backward compatibility)
  // Check for unsubscribe link pattern to avoid duplicates
  if (htmlContent.includes('/unsubscribe') || htmlContent.includes('unsubscribe?') || htmlContent.includes('href="unsubscribe')) {
    return htmlContent;
  }

  const footer = await generateUnsubscribeFooter(userId, contactEmail, options);
  
  // Append footer to content
  // Try to append before closing body tag, or just append at the end
  if (htmlContent.includes('</body>')) {
    return htmlContent.replace('</body>', `${footer}</body>`);
  }
  
  return htmlContent + footer;
}

