// src/app/modules/Payment/payment.gateway.ts

import axios from 'axios';

export interface GatewayResponse {
  status_code?: string | number;
  status?: string;
  message?: string;
  payment_url?: string;
  invoice_number?: string;
  payment_amount?: string | number;
  data?: Record<string, any>;
}

export const paymentEnvironment = () =>
  process.env.PAYSTATION_ENV === 'live'
    ? 'live'
    : 'sandbox';

const baseURL = () =>
  paymentEnvironment() === 'live'
    ? 'https://api.paystation.com.bd'
    : 'https://sandbox.paystation.com.bd';

const merchantId = () => {
  const value = process.env.PAYSTATION_MERCHANT_ID;
  if (!value) throw new Error('Missing PayStation Merchant ID');
  return value;
};

const merchantPassword = () => {
  const value = process.env.PAYSTATION_PASSWORD;
  if (!value) throw new Error('Missing PayStation password');
  return value;
};

async function gatewayPost(
  endpoint: string,
  body: URLSearchParams | Record<string, unknown>,
  headers: Record<string, string>
): Promise<GatewayResponse> {
  const response = await axios.post<GatewayResponse>(
    `${baseURL()}${endpoint}`,
    body,
    {
      headers,
      timeout: 12000,
      maxRedirects: 0,
      validateStatus: (status) => status < 500,
    }
  );

  if (!response.data || typeof response.data !== 'object') {
    throw new Error('Invalid PayStation response');
  }

  return response.data;
}

export interface InitiateInput {
  invoice_number: string;
  payment_amount: number;
  pay_with_charge: number;
  cust_name: string;
  cust_phone: string;
  cust_email: string;
  cust_address?: string;
  reference?: string;
  checkout_items?: string;
  opt_a?: string;
  opt_b?: string;
  opt_c?: string;
  emi?: number;
}

// API 1: Hosted Checkout / Initiate Payment
export async function initiatePayment(
  input: InitiateInput
) {
  const callback = process.env.PAYSTATION_CALLBACK_URL;

  if (!callback) {
    throw new Error('Missing PayStation callback URL');
  }

  const body = new URLSearchParams({
    merchantId: merchantId(),
    password: merchantPassword(),
    invoice_number: input.invoice_number,
    currency: 'BDT',
    payment_amount: String(input.payment_amount),
    pay_with_charge: String(input.pay_with_charge),
    cust_name: input.cust_name,
    cust_phone: input.cust_phone,
    cust_email: input.cust_email,
    callback_url: callback,
  });

  const optionalFields = [
    'cust_address',
    'reference',
    'checkout_items',
    'opt_a',
    'opt_b',
    'opt_c',
  ] as const;

  for (const field of optionalFields) {
    const value = input[field];
    if (value !== undefined && value !== '') {
      body.append(field, value);
    }
  }

  if (input.emi !== undefined) {
    body.append('emi', String(input.emi));
  }

  return gatewayPost(
    '/initiate-payment',
    body,
    {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    }
  );
}

// API 2: Transaction Status v1
export async function transactionStatusV1(
  invoiceNumber: string
) {
  return gatewayPost(
    '/transaction-status',
    new URLSearchParams({
      invoice_number: invoiceNumber,
    }),
    {
      merchantId: merchantId(),
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    }
  );
}

// API 3: Transaction Status v2
export async function transactionStatusV2(
  transactionId: string
) {
  return gatewayPost(
    '/v2/transaction-status',
    { trxId: transactionId },
    {
      merchantId: merchantId(),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    }
  );
}

export function isValidCheckoutUrl(url: string) {
  try {
    const parsed = new URL(url);
    const expected = new URL(baseURL());

    return (
      parsed.protocol === 'https:' &&
      parsed.hostname === expected.hostname &&
      parsed.pathname.startsWith('/checkout/')
    );
  } catch {
    return false;
  }
}