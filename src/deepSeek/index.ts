import OpenAI from 'openai';

const deepseekBaseURL =
    process.env.DEEPSEEK_API_URL ||
    process.env.NEXT_PUBLIC_DEEPSEEK_API_URL ||
    'https://api.deepseek.com';

const openai = new OpenAI({
    baseURL: deepseekBaseURL,
    apiKey: process.env.DEEPSEEK_API_KEY,
});

export default openai;







