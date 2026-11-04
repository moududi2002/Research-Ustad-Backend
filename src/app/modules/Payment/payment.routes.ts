// src/app/modules/Payment/payment.routes.ts

import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcrypt';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { randomInt } from 'crypto';
import { z } from 'zod';
import { sharedIpnDispatcher } from './shared-ipn.middleware';

import {
  PaymentAdmin,
  PaymentTransaction,
  PaymentWebhookLog,
} from './payment.model';

import {
  initiatePayment,
  transactionStatusV1,
  transactionStatusV2,
  isValidCheckoutUrl,
  paymentEnvironment,
} from './payment.gateway';

const router = Router();

type AdminRequest = Request & {
  paymentAdminId?: string;
};

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 6,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

const jwtSecret = () => {
  const secret = process.env.PAYMENT_JWT_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error('Invalid PAYMENT_JWT_SECRET');
  }

  return secret;
};

// Create the independent admin only on first setup.
export async function seedPaymentAdmin() {
  const existing = await PaymentAdmin.exists({});

  if (existing) return;

  const email = process.env.PAYMENT_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.PAYMENT_ADMIN_PASSWORD;

  if (!email || !password || password.length < 16) {
    throw new Error('Invalid initial Payment Admin credentials');
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await PaymentAdmin.create({
    email,
    passwordHash,
    active: true,
    sessionVersion: 0,
  });

  console.log('Payment Admin account created');
}

// JWT guard: completely separate from existing website admins.
async function requirePaymentAdmin(
  req: AdminRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const header = req.headers.authorization || '';

    if (!header.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const decoded = jwt.verify(
      header.slice(7),
      jwtSecret(),
      {
        algorithms: ['HS256'],
        issuer: 'research-ustad-payment',
        audience: 'payment-admin',
      }
    ) as JwtPayload;

    if (!decoded.sub) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const admin = await PaymentAdmin.findById(decoded.sub);

    if (
      !admin ||
      !admin.active ||
      decoded.v !== admin.sessionVersion
    ) {
      return res.status(401).json({ message: 'Session invalid' });
    }

    req.paymentAdminId = String(admin._id);
    return next();
  } catch {
    return res.status(401).json({ message: 'Session expired' });
  }
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
}).strict();

router.post('/login', authLimiter, async (req, res) => {
  try {
    const parsed = loginSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const email = parsed.data.email.toLowerCase();

    const admin = await PaymentAdmin.findOne({
      email,
      active: true,
    }).select('+passwordHash');

    const valid = admin
      ? await bcrypt.compare(
          parsed.data.password,
          admin.passwordHash
        )
      : false;

    if (!admin || !valid) {
      return res.status(401).json({
        message: 'Invalid email or password',
      });
    }

    const token = jwt.sign(
      {
        sub: String(admin._id),
        v: admin.sessionVersion,
      },
      jwtSecret(),
      {
        algorithm: 'HS256',
        expiresIn: '2h',
        issuer: 'research-ustad-payment',
        audience: 'payment-admin',
      }
    );

    return res.json({
      success: true,
      token,
      expiresIn: 7200,
    });
  } catch {
    return res.status(500).json({ message: 'Login unavailable' });
  }
});

router.get('/me', requirePaymentAdmin, async (req: AdminRequest, res) => {
  const admin = await PaymentAdmin.findById(req.paymentAdminId);

  return res.json({
    email: admin?.email,
    environment: paymentEnvironment(),
  });
});

router.post(
  '/logout',
  requirePaymentAdmin,
  async (req: AdminRequest, res) => {
    await PaymentAdmin.findByIdAndUpdate(req.paymentAdminId, {
      $inc: { sessionVersion: 1 },
    });

    return res.json({ success: true });
  }
);

// Verify status using PayStation itself, not callback/IPN claims.
async function reconcile(
  version: 'v1' | 'v2',
  identifier: string
) {
  const gateway = version === 'v1'
    ? await transactionStatusV1(identifier)
    : await transactionStatusV2(identifier);

  const data = gateway.data;

  if (
    String(gateway.status_code) !== '200' ||
    String(gateway.status).toLowerCase() !== 'success' ||
    !data?.invoice_number
  ) {
    return {
      gateway,
      saved: false,
      verified: false,
      reason: 'Gateway did not confirm a transaction',
    };
  }

  const invoice = String(data.invoice_number);
  const trxId = data.trx_id ? String(data.trx_id) : '';

  if (version === 'v1' && invoice !== identifier) {
    return {
      gateway, saved: false, verified: false,
      reason: 'Invoice mismatch',
    };
  }

  if (version === 'v2' && trxId !== identifier) {
    return {
      gateway, saved: false, verified: false,
      reason: 'Transaction ID mismatch',
    };
  }

  const transaction = await PaymentTransaction.findOne({
    invoiceNumber: invoice,
    environment: paymentEnvironment(),
  });

  if (!transaction) {
    return {
      gateway, saved: false, verified: false,
      reason: 'Transaction not created in this dashboard',
    };
  }

  if (transaction.trxId && transaction.trxId !== trxId) {
    return {
      gateway, saved: false, verified: false,
      reason: 'Stored transaction ID mismatch',
    };
  }

  // When customer pays charges, v2 request_amount
  // is required for safe original-amount verification.
  let amountToCompare: unknown =
    version === 'v2'
      ? data.request_amount
      : transaction.payWithCharge === 0
        ? data.payment_amount
        : undefined;

  if (
    amountToCompare === undefined &&
    version === 'v1' &&
    transaction.payWithCharge === 1 &&
    trxId
  ) {
    const v2 = await transactionStatusV2(trxId);

    if (
      String(v2.status_code) === '200' &&
      String(v2.status).toLowerCase() === 'success' &&
      String(v2.data?.invoice_number) === invoice &&
      String(v2.data?.trx_id) === trxId
    ) {
      amountToCompare = v2.data?.request_amount;
    }
  }

  const verifiedAmount = Number(amountToCompare);

  if (
    amountToCompare === undefined ||
    !Number.isFinite(verifiedAmount) ||
    Math.abs(verifiedAmount - transaction.amount) > 0.001
  ) {
    return {
      gateway, saved: false, verified: false,
      reason: 'Payment amount could not be verified',
    };
  }

  const gatewayState = String(
    data.trx_status || ''
  ).toLowerCase();

  const allowed = [
    'success', 'processing', 'failed', 'refund', 'refunded',
  ];

  if (!allowed.includes(gatewayState)) {
    return {
      gateway, saved: false, verified: false,
      reason: 'Unknown gateway transaction status',
    };
  }

 const nextStatus: 'success' | 'processing' | 'failed' | 'refunded' =
  gatewayState === 'success'
    ? 'success'
    : gatewayState === 'processing'
    ? 'processing'
    : gatewayState === 'failed'
    ? 'failed'
    : 'refunded';
    
  // Never downgrade an already successful payment to failed.
  if (
    transaction.status === 'success' &&
    nextStatus !== 'refunded'
  ) {
    return {
      gateway,
      saved: true,
      verified: true,
      status: transaction.status,
    };
  }

  transaction.status = nextStatus;
  transaction.trxId = trxId || transaction.trxId;
  transaction.paymentMethod = String(
    data.payment_method || transaction.paymentMethod || ''
  );

  if (nextStatus === 'success') {
    if (!trxId) {
      return {
        gateway, saved: false, verified: false,
        reason: 'Missing gateway transaction ID',
      };
    }

    transaction.verifiedAt = new Date();
  }

  await transaction.save();

  return {
    gateway,
    saved: true,
    verified: nextStatus === 'success',
    status: nextStatus,
  };
}

const initiateSchema = z.object({
  amount: z.coerce.number().int().min(1).max(10000000),
  customerName: z.string().trim().min(2).max(150),
  customerEmail: z.string().email().max(255),
  customerPhone: z.string().trim().min(10).max(20),
  customerAddress: z.string().max(500).optional(),
  reference: z.string().max(200).optional(),
  checkoutItems: z.string().max(2000).optional(),
  payWithCharge: z.union([z.literal(0), z.literal(1)]),
  opt_a: z.string().max(500).optional(),
  opt_b: z.string().max(500).optional(),
  opt_c: z.string().max(500).optional(),
  emi: z.union([z.literal(0), z.literal(1)]).optional(),
}).strict();

// Create payment / PayStation Hosted Checkout
router.post('/initiate', requirePaymentAdmin, async (req, res) => {
  const parsed = initiateSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: 'Invalid payment information',
      errors: parsed.error.flatten(),
    });
  }

  const p = parsed.data;

  const invoiceNumber =
    `${Date.now()}${randomInt(100000, 999999)}`;

  const transaction = await PaymentTransaction.create({
    invoiceNumber,
    environment: paymentEnvironment(),
    amount: p.amount,
    payWithCharge: p.payWithCharge,
    customerName: p.customerName,
    customerEmail: p.customerEmail,
    customerPhone: p.customerPhone,
    customerAddress: p.customerAddress,
    reference: p.reference,
    checkoutItems: p.checkoutItems,
    status: 'initiating',
  });

  try {
    const gateway = await initiatePayment({
      invoice_number: invoiceNumber,
      payment_amount: p.amount,
      pay_with_charge: p.payWithCharge,
      cust_name: p.customerName,
      cust_email: p.customerEmail,
      cust_phone: p.customerPhone,
      cust_address: p.customerAddress,
      reference: p.reference,
      checkout_items: p.checkoutItems,
      opt_a: p.opt_a,
      opt_b: p.opt_b,
      opt_c: p.opt_c,
      emi: p.emi,
    });

    const accepted =
      String(gateway.status_code) === '200' &&
      String(gateway.status).toLowerCase() === 'success' &&
      String(gateway.invoice_number) === invoiceNumber &&
      typeof gateway.payment_url === 'string' &&
      isValidCheckoutUrl(gateway.payment_url);

    if (!accepted) {
      transaction.status = 'initiation_failed';
      transaction.gatewayMessage = gateway.message || 'Rejected';
      await transaction.save();

      return res.status(502).json({
        message: 'PayStation did not create a valid payment link',
      });
    }

    transaction.status = 'pending';
    transaction.paymentUrl = gateway.payment_url;
    await transaction.save();

    return res.json({
      success: true,
      invoiceNumber,
      paymentUrl: gateway.payment_url,
      environment: transaction.environment,
    });
  } catch {
    transaction.status = 'initiation_failed';
    transaction.gatewayMessage = 'Gateway connection error';
    await transaction.save();

    return res.status(502).json({
      message: 'Could not connect to PayStation',
    });
  }
});

// Transaction Status v1
router.post('/status/v1', requirePaymentAdmin, async (req, res) => {
  const invoice = req.body?.invoiceNumber;

  if (typeof invoice !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(invoice)) {
    return res.status(400).json({ message: 'Invalid invoice number' });
  }

  try {
    return res.json(await reconcile('v1', invoice));
  } catch {
    return res.status(502).json({ message: 'Gateway check failed' });
  }
});

// Transaction Status v2
router.post('/status/v2', requirePaymentAdmin, async (req, res) => {
  const trxId = req.body?.trxId;

  if (typeof trxId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(trxId)) {
    return res.status(400).json({ message: 'Invalid transaction ID' });
  }

  try {
    return res.json(await reconcile('v2', trxId));
  } catch {
    return res.status(502).json({ message: 'Gateway check failed' });
  }
});

// Dashboard summary
router.get('/summary', requirePaymentAdmin, async (_req, res) => {
  const rows = await PaymentTransaction.aggregate([
    { $match: { environment: paymentEnvironment() } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        amount: { $sum: '$amount' },
      },
    },
  ]);

  const result: Record<string, number> = {
    total: 0,
    success: 0,
    pending: 0,
    failed: 0,
    refunded: 0,
    revenue: 0,
  };

  for (const row of rows) {
    result.total += row.count;

    if (row._id === 'success') {
      result.success += row.count;
      result.revenue += row.amount;
    } else if (row._id === 'refunded') {
      result.refunded += row.count;
    } else if (['pending', 'processing', 'initiating'].includes(row._id)) {
      result.pending += row.count;
    } else {
      result.failed += row.count;
    }
  }

  return res.json({
    ...result,
    currency: 'BDT',
    environment: paymentEnvironment(),
  });
});

// Searchable and paginated transactions
router.get('/transactions', requirePaymentAdmin, async (req, res) => {
  const page = Math.min(
    10000,
    Math.max(1, Number(req.query.page) || 1)
  );

  const limit = 20;
  const rawStatus = String(req.query.status || 'all');
  const allowedStatus = [
    'initiating', 'pending', 'processing',
    'success', 'failed', 'refunded', 'initiation_failed',
  ];

  const filter: Record<string, unknown> = {
    environment: paymentEnvironment(),
  };

  if (allowedStatus.includes(rawStatus)) {
    filter.status = rawStatus;
  }

  const q = String(req.query.q || '').slice(0, 80);

  if (q) {
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    filter.$or = [
      { invoiceNumber: { $regex: escaped, $options: 'i' } },
      { customerEmail: { $regex: escaped, $options: 'i' } },
      { trxId: { $regex: escaped, $options: 'i' } },
    ];
  }

  const [items, total] = await Promise.all([
    PaymentTransaction.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    PaymentTransaction.countDocuments(filter),
  ]);

  return res.json({
    items,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
  });
});

// Verified webhook history
router.get('/webhooks', requirePaymentAdmin, async (_req, res) => {
  const items = await PaymentWebhookLog.find({
    environment: paymentEnvironment(),
  })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  return res.json({ items });
});

// NEW: Shared IPN dispatcher.
router.post(
  '/ipn',
  webhookLimiter,
  sharedIpnDispatcher
);

// Public Merchant IPN: called by PayStation server
router.post('/ipn', async (req, res) => {
  const {
    invoice_number,
    trx_id,
    trx_status,
    trx_amount,
  } = req.body || {};

  if (
    typeof invoice_number !== 'string' ||
    typeof trx_id !== 'string' ||
    !invoice_number ||
    !trx_id ||
    trx_status !== 'Success' ||
    !Number.isFinite(Number(trx_amount))
  ) {
    return res.status(400).json({ message: 'Invalid IPN' });
  }

  const transaction = await PaymentTransaction.findOne({
    invoiceNumber: invoice_number,
    environment: paymentEnvironment(),
  });

  if (!transaction) {
    return res.status(404).json({ message: 'Unknown invoice' });
  }

  if (transaction.trxId && transaction.trxId !== trx_id) {
    return res.status(409).json({ message: 'Transaction ID mismatch' });
  }

  if (
    transaction.payWithCharge === 0 &&
    Math.abs(transaction.amount - Number(trx_amount)) > 0.001
  ) {
    return res.status(422).json({ message: 'Amount mismatch' });
  }

  if (
    transaction.status === 'success' &&
    transaction.trxId === trx_id
  ) {
    return res.json({ status: 'success' });
  }

  try {
    const checked = await reconcile('v1', invoice_number);

    const latest = await PaymentTransaction.findById(transaction._id);

    const accepted =
      checked.verified === true &&
      latest?.status === 'success' &&
      latest?.trxId === trx_id;

    await PaymentWebhookLog.create({
      invoiceNumber: invoice_number,
      trxId: trx_id,
      accepted,
      reason: accepted ? 'Verified' : 'Verification pending',
      environment: paymentEnvironment(),
    });

    if (!accepted) {
      return res.status(503).json({
        message: 'Transaction not yet independently verified',
      });
    }

    return res.json({ status: 'success' });
  } catch {
    return res.status(503).json({
      message: 'Verification temporarily unavailable',
    });
  }
});

// Public browser callback: never trust callback status alone
async function callbackHandler(req: Request, res: Response) {
  const invoice = String(
    req.query.invoice_number || req.body?.invoice_number || ''
  );

  if (/^[A-Za-z0-9_-]{1,80}$/.test(invoice)) {
    try {
      const exists = await PaymentTransaction.exists({
        invoiceNumber: invoice,
        environment: paymentEnvironment(),
      });

      if (exists) await reconcile('v1', invoice);
    } catch {
      // IPN or a later admin status check can still reconcile.
    }
  }

  const frontend = (
    process.env.PAYMENT_FRONTEND_URL ||
    'https://researchustad.org'
  ).replace(/\/$/, '');

  return res.redirect(
    303,
    `${frontend}/payment/result?invoice=${encodeURIComponent(invoice)}`
  );
}

router.get('/callback', webhookLimiter, callbackHandler);
router.post('/callback', webhookLimiter, callbackHandler);

export const PaymentRoutes = router;
