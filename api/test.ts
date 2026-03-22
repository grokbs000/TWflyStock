import type { VercelRequest, VercelResponse } from '@vercel/node';
import fs from 'node:fs';
import path from 'node:path';

function listFiles(dir: string, fileList: string[] = []): string[] {
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const name = path.join(dir, file);
      if (fs.statSync(name).isDirectory()) {
        if (!name.includes('node_modules')) {
          listFiles(name, fileList);
        }
      } else {
        fileList.push(name.replace('/var/task/', ''));
      }
    }
  } catch (err) {
    fileList.push(`Error reading ${dir}`);
  }
  return fileList;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const deploymentFiles = listFiles('/var/task');

  res.status(200).json({
    status: 'ok',
    message: 'Deployment File Listing',
    files_count: deploymentFiles.length,
    files_sample: deploymentFiles.slice(0, 500),
    env: {
      NODE_ENV: process.env.NODE_ENV,
      VERCEL: process.env.VERCEL,
      PWD: process.env.PWD,
      CWD: process.cwd()
    }
  });
}
