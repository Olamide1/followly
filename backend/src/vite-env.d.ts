/// <reference types="node" />

declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV?: string;
    PORT?: string;
    DATABASE_URL?: string;
    DB_HOST?: string;
    DB_PORT?: string;
    DB_NAME?: string;
    DB_USER?: string;
    DB_PASSWORD?: string;
    REDIS_URL?: string;
    REDIS_HOST?: string;
    REDIS_PORT?: string;
    JWT_SECRET?: string;
    JWT_EXPIRES_IN?: string;
    BREVO_API_KEY?: string;
    MAILJET_API_KEY?: string;
    MAILJET_API_SECRET?: string;
    RESEND_API_KEY?: string;
    DEFAULT_FROM_EMAIL?: string;
    DEFAULT_FROM_NAME?: string;
    FRONTEND_URL?: string;
    RATE_LIMIT_WINDOW_MS?: string;
    RATE_LIMIT_MAX_REQUESTS?: string;
  }
}

