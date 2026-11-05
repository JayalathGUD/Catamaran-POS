const mongoose = require('mongoose');

const billItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
    code: { type: String, default: '' },
    addedAt: { type: String, default: () => new Date().toISOString() }
  },
  { _id: false }
);

const billSchema = new mongoose.Schema(
  {
    billNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    customerName: {
      type: String,
      default: '',
      trim: true
    },
    date: {
      type: String,
      required: true
    },
    time: {
      type: String,
      required: true
    },
    orderType: {
      type: String,
      enum: ['Dine-in', 'Takeaway'],
      default: 'Dine-in'
    },
    saleType: {
      type: String,
      default: 'Restaurant & Cafe'
    },
    paymentMethod: {
      type: String,
      required: true,
      default: 'Cash'
    },
    items: [billItemSchema],
    subtotal: {
      type: Number,
      required: true,
      min: 0
    },
    discount: {
      type: Number,
      default: 0,
      min: 0
    },
    serviceCharge: {
      type: Number,
      default: 0,
      min: 0
    },
    total: {
      type: Number,
      required: true,
      min: 0
    },
    status: {
      type: String,
      enum: ['Open', 'Settled', 'Refunded', 'Cancelled'],
      default: 'Settled'
    },
    paymentStatus: {
      type: String,
      enum: ['Paid', 'Partially Paid', 'Unpaid'],
      default: 'Paid'
    },
    totalPaid: {
      type: Number,
      default: 0,
      min: 0
    },
    balanceDue: {
      type: Number,
      default: 0,
      min: 0
    },
    cashier: {
      type: String,
      default: 'Kasun P.'
    },
    amountTendered: {
      type: Number,
      default: 0,
      min: 0
    },
    changeDue: {
      type: Number,
      default: 0,
      min: 0
    },
    splitCashAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    splitCardAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    refundReason: {
      type: String,
      default: ''
    },
    refundedAt: {
      type: String,
      default: ''
    },
    closedAt: {
      type: String,
      default: ''
    },
    notes: {
      type: String,
      default: ''
    }
  },
  { timestamps: true }
);

billSchema.index({ createdAt: -1 });
billSchema.index({ status: 1 });

module.exports = mongoose.model('Bill', billSchema);
