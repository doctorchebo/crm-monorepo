import { registerAs } from '@nestjs/config';

export const openaiConfig = registerAs('openai', () => ({
  apiKey: process.env.OPENAI_API_KEY || '',
  model: 'gpt-4',
  temperature: 0.7,
  maxTokens: 500,
}));
