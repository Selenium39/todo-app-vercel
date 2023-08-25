import { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
    const { finishDatas, todoDatas, query, user, response_mode } = req.query;

    try {
        const apiUrl = 'https://api.dify.ai/v1/completion-messages';

        // 设置 SSE 相关的响应头
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const response = await axios.post(apiUrl, {
            inputs: {
                finishDatas: decodeURIComponent(finishDatas as string),
                todoDatas: decodeURIComponent(todoDatas as string)
            },
            query,
            user,
            response_mode
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.NEXT_PUBLIC_DIFY_APP_TOKEN}`,
                'Content-Type': 'application/json',
            },
            responseType: 'stream'
        });

        response.data.on('data', (chunk:any) => {
            res.write(chunk);
        });

        response.data.on('end', () => {
            res.end();
        });

        response.data.on('error', (err:any) => {
            console.error('Error in SSE proxy:', err);
            res.status(500).end();
        });

    } catch (error) {
        console.error('Error in SSE proxy:', error);
        res.status(500).end();
    }
}

export default handler;

export const config = {
    api: {
      externalResolver: true,
    },
  }
  
