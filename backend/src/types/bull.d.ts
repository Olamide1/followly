import { Job } from 'bull';

declare module 'bull' {
  interface Job<T = any> {
    moveToDelayed(delay: number): Promise<Job<T>>;
  }
}

