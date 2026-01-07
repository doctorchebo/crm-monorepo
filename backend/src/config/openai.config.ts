import { registerAs } from '@nestjs/config';

export const openaiConfig = registerAs('openai', () => ({
  // Support both OPENAI_API_KEY and AI_MEMORY_PROVIDER_API_KEY for flexibility
  apiKey:
    process.env.OPENAI_API_KEY || process.env.AI_MEMORY_PROVIDER_API_KEY || '',
  model: 'gpt-4',
  temperature: 0.7,
  maxTokens: 500,
}));
