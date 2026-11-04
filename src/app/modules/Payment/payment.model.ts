// src/app/modules/Payment/payment.model.ts

import { Schema, model } from 'mongoose';

const paymentAdminSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    active: {
      type: Boolean,
      default: true,
    },
    sessionVersion: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

export const PaymentAdmin = model(
  'PaymentAdmin',
  paymentAdminSchema
);

const paymentTransactionSchema = new Schema(
  {
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
    },
    environment: {
      type: String,
      enum: ['sandbox', 'live'],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 1,
    },
    currency: {
      type: String,
      default: 'BDT',
    },
    payWithCharge: {
      type: Number,
      enum: [0, 1],
      default: 0,
    },
    customerName: String,
    customerEmail: String,
    customerPhone: String,
    customerAddress: String,
    reference: String,
    checkoutItems: String,
    paymentUrl: String,
    trxId: {
      type: String,
      sparse: true,
    },
    paymentMethod: String,
    gatewayMessage: String,
    status: {
      type: String,
      enum: [
        'initiating',
        'pending',
        'processing',
        'success',
        'failed',
        'refunded',
        'initiation_failed',
      ],
      default: 'initiating',
    },
    verifiedAt: Date,
  },
  { timestamps: true }
);

paymentTransactionSchema.index({
  environment: 1,
  createdAt: -1,
});

paymentTransactionSchema.index({
  trxId: 1,
}, {
  unique: true,
  sparse: true,
});

export const PaymentTransaction = model(
  'PaymentTransaction',
  paymentTransactionSchema
);

const webhookLogSchema = new Schema(
  {
    invoiceNumber: String,
    trxId: String,
    accepted: Boolean,
    reason: String,
    environment: String,
  },
  { timestamps: true }
);

webhookLogSchema.index({ createdAt: -1 });

export const PaymentWebhookLog = model(
  'PaymentWebhookLog',
  webhookLogSchema
);