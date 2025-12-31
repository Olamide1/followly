import Handlebars from 'handlebars';

export interface PersonalizationData {
  name?: string;
  company?: string;
  email?: string;
  [key: string]: any;
}

export class PersonalizationService {
  private static instance: PersonalizationService;

  static getInstance(): PersonalizationService {
    if (!PersonalizationService.instance) {
      PersonalizationService.instance = new PersonalizationService();
    }
    return PersonalizationService.instance;
  }

  constructor() {
    // Register default helpers
    Handlebars.registerHelper('uppercase', (str: string) => {
      return str ? str.toUpperCase() : '';
    });

    Handlebars.registerHelper('lowercase', (str: string) => {
      return str ? str.toLowerCase() : '';
    });

    Handlebars.registerHelper('capitalize', (str: string) => {
      return str ? str.charAt(0).toUpperCase() + str.slice(1).toLowerCase() : '';
    });
  }

  renderTemplate(template: string, data: PersonalizationData): string {
    try {
      // Handlebars handles both {{name}} and {{ name }} syntax
      // Ensure all expected fields are present (even if empty) to avoid undefined errors
      const safeData = {
        name: data.name || '',
        company: data.company || '',
        email: data.email || '',
        ...data, // Include any additional fields
      };
      const compiled = Handlebars.compile(template);
      return compiled(safeData);
    } catch (error: any) {
      throw new Error(`Template rendering error: ${error.message}`);
    }
  }

  extractFields(template: string): string[] {
    const regex = /\{\{(\w+)\}\}/g;
    const fields: string[] = [];
    let match;

    while ((match = regex.exec(template)) !== null) {
      if (!fields.includes(match[1])) {
        fields.push(match[1]);
      }
    }

    return fields;
  }

  validateTemplate(template: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    try {
      Handlebars.compile(template);
    } catch (error: any) {
      errors.push(error.message);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

