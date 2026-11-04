// src/app/modules/Payment/shared-ipn.middleware.ts

import { Request, Response, NextFunction } from 'express';
import { createHmac } from 'crypto';
import axios from 'axios';

import { PaymentTransaction } from './payment.model';
import { paymentEnvironment } from './payment.gateway';

/**
 * Shared PayStation IPN Dispatcher
 *
 * Existing Main Website invoice:
 *   Continue to the existing Express IPN handler.
 *
 * Unknown to Main Website:
 *   Forward to Workshop NestJS using HMAC authentication.
 *
 * Neither branch trusts the incoming IPN as proof of payment.
 */

export async function sharedIpnDispatcher(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const body = req.body || {};

  const invoice = body.invoice_number;
  const trxId = body.trx_id;
  const trxStatus = body.trx_status;
  const trxAmount = body.trx_amount;

  // Step A: Validate incoming notification structure
  if (
    typeof invoice !== 'string' ||
    !/^[A-Za-z0-9_-]{1,100}$/.test(invoice) ||
    typeof trxId !== 'string' ||
    !/^[A-Za-z0-9_-]{1,100}$/.test(trxId) ||
    trxStatus !== 'Success' ||
    !['number', 'string'].includes(typeof trxAmount) ||
    !Number.isFinite(Number(trxAmount)) ||
    Number(trxAmount) <= 0
  ) {
    return res.status(400).json({
      status: 'invalid',
      message: 'Invalid PayStation IPN payload',
    });
  }

  try {
    // Step B: Does the invoice belong to the Main Website?
    const mainPayment = await PaymentTransaction.exists({
      invoiceNumber: invoice,
      environment: paymentEnvironment(),
    });

    if (mainPayment) {
      console.log(
        '[Shared IPN] Routed to Main Website:',
        invoice
      );

      // Execute the EXISTING main payment IPN handler.
      return next();
    }

    // Step C: Not found in Main DB.
    // Send securely to Workshop NestJS Backend.
    const forwardingUrl =
      process.env.WORKSHOP_IPN_FORWARD_URL;

    const sharedSecret =
      process.env.SHARED_IPN_HMAC_SECRET;

    if (
      !forwardingUrl ||
      !sharedSecret ||
      sharedSecret.length < 32
    ) {
      console.error(
        '[Shared IPN] Internal forwarding not configured'
      );

      return res.status(503).json({
        status: 'error',
        message: 'Payment notification routing unavailable',
      });
    }

    // Prevent redirects or accidental external destinations
    // from being silently followed.
    const target = new URL(forwardingUrl);

    if (
      !['http:', 'https:'].includes(target.protocol) ||
      target.username ||
      target.password
    ) {
      return res.status(503).json({
        message: 'Invalid Workshop IPN destination',
      });
    }

    // Step D: Create an authenticated internal message.
    const timestamp = String(Date.now());

    const signedContent =
      `${timestamp}.${JSON.stringify(body)}`;

    const signature = createHmac(
      'sha256',
      sharedSecret
    )
      .update(signedContent)
      .digest('hex');

    console.log(
      '[Shared IPN] Forwarding to Course Backend:',
      invoice
    );

    // Step E: Forward the original IPN data to NestJS.
    const upstream = await axios.post(
      forwardingUrl,
      body,
      {
        timeout: 12000,
        maxRedirects: 0,
        validateStatus: () => true,
        headers: {
          'Content-Type': 'application/json',
          'X-RU-IPN-Timestamp': timestamp,
          'X-RU-IPN-Signature': signature,
        },
      }
    );

    // Step F: Acknowledge only when Workshop
    // accepted and independently verified the transaction.
    if (
      upstream.status >= 200 &&
      upstream.status < 300
    ) {
      console.log(
        '[Shared IPN] Course IPN verified:',
        invoice
      );

      return res.status(200).json({
        status: 'success',
      });
    }

    if (upstream.status === 404) {
      console.warn(
        '[Shared IPN] Invoice unknown to both systems:',
        invoice
      );

      return res.status(404).json({
        status: 'not_found',
        message: 'Unknown payment invoice',
      });
    }

    // Non-2xx: permit gateway retry.
    console.error(
      '[Shared IPN] Workshop rejected notification',
      {
        invoice,
        httpStatus: upstream.status,
      }
    );

    return res.status(503).json({
      status: 'pending',
      message: 'Payment verification not completed',
    });

  } catch (error) {
    console.error(
      '[Shared IPN] Routing error:',
      error instanceof Error
        ? error.message
        : 'Unknown error'
    );

    // Do not acknowledge an unverified payment.
    return res.status(503).json({
      status: 'error',
      message: 'Temporary notification processing error',
    });
  }
}
