/**
 * FineReport 備份工具後端 API 服務入口
 */
import 'express-async-errors';
import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { backupRouter } from './routes/backup.js';

dotenv.config();

const app: Express = express();
const PORT = process.env.PORT ?? 3000;

app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN ?? '*',
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 健康檢查
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'finereport-backup-api',
  });
});

// 備份 API
app.use('/api/backup', backupRouter);

// 404
app.use((req, res) => {
  res.status(404).json({
    error: true,
    code: 'NOT_FOUND',
    message: '找不到請求的資源',
  });
});

app.listen(PORT, () => {
  console.log(`FineReport 備份 API 已啟動，port: ${PORT}`);
});

export default app;
