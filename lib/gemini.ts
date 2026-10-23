import { GoogleGenAI } from '@google/genai';

const apiKey = process.env.GEMINI_API_KEY || '';

// Singleton SDK instance
export const genai = new GoogleGenAI({ apiKey });

export const GEMINI_MODELS = {
  FAST: process.env.GEMINI_MODEL_FAST || 'gemini-3.5-flash',
  DEEP: process.env.GEMINI_MODEL_DEEP || 'gemini-4-argon',
};
