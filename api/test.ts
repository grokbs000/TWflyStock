import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.status(200).json({
    status: 'ok',
    message: 'Test endpoint is working',
    env: {
      NODE_ENV: process.env.NODE_ENV,
      VERCEL: process.env.VERCEL,
      APP_ID: !!process.env.APP_ID,
    },
    time: new Date().toISOString()
  });
}
