import cors from 'cors'; // ✅ ADD THIS
import cookieParser from 'cookie-parser';
import express, { Application, Request, Response } from 'express';
import globalErrorHandler from './app/middlewares/globalErrorhandler';
import notFound from './app/middlewares/notFound';
import router from './app/routes';
import * as http from 'http';
import { io } from './app/utils/socket';
import path from 'path';
import config from './app/config/index';
import 'express-async-errors';

const app: Application = express();
const server = http.createServer(app);

io.attach(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // allow Postman or curl

      if (config.frontend_urls.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },

    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  },
});

// ✅ Add this before any routes
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      
      // Use environment-based allowed origins with fallbacks
      const allowedOrigins = config.frontend_urls || [
        'http://localhost:3000',
        'https://researchustad.org',
        'https://www.researchustad.org'
      ];
      
      console.log('🔍 CORS Check:', {
        origin,
        allowedOrigins,
        isAllowed: allowedOrigins.includes(origin)
      });
      
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.log('❌ CORS blocked origin:', origin);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type', 
      'Authorization', 
      'X-Requested-With',
      'Accept',
      'Origin',
      'Access-Control-Request-Method',
      'Access-Control-Request-Headers'
    ],
  }),
);


app.use(
  '/api/v1/payment-admin/ipn',
  express.json({
    limit: '16kb',
    type: 'application/json',
  })
);
app.use(express.json({ limit: '100mb' })); // Higher limits for VPS deployment
app.use(express.urlencoded({ extended: true, limit: '100mb' })); // Higher limits for VPS deployment
app.use(cookieParser());

// application routes
app.use('/api/v1', router);

// ✅ Make uploaded files publicly accessible
app.use('/upload', express.static(path.join(process.cwd(), 'upload')));

// Health check endpoint
app.get('/', (req: Request, res: Response) => {
  res.json({
    message: 'Research Ustad API is running!',
    status: 'success',
    timestamp: new Date().toISOString(),
    environment: config.NODE_ENV,
    cors: {
      allowedOrigins: config.frontend_urls
    }
  });
});

// Health check for API
app.get('/api/v1/health', (req: Request, res: Response) => {
  res.json({
    message: 'API is healthy',
    status: 'success',
    timestamp: new Date().toISOString()
  });
});

app.use(globalErrorHandler);
app.use(notFound);



export default app;
