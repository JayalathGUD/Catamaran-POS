const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    sourceType: {
      type: String,
      enum: ['Bill', 'Rental', 'Lesson'],
      required: true
    },
    sourceId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true
    },
    sourceReference: {
      type: String,
      required: true,
      trim: true
    },
    customerName: {
      type: String,
      required: true,
      trim: true
    },
    customerContact: {
      type: String,
      default: '',
      trim: true
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01
    },
    paymentMethod: {
      type: String,
      required: true,
      default: 'Cash'
    },
    paymentDate: {
      type: String, // YYYY-MM-DD in Asia/Colombo timezone
      required: true,
      index: true
    },
    paymentTime: {
      type: String, // e.g. "02:30 PM"
      required: true
    },
    paymentTimestamp: {
      type: Number,
      required: true,
      index: true
    },
    cashier: {
      type: String,
      default: 'Staff'
    },
    notes: {
      type: String,
      default: ''
    },
    idempotencyKey: {
      type: String,
      index: {
        unique: true,
        sparse: true
      }
    }
  },
  { timestamps: true }
);

paymentSchema.index({ sourceType: 1, sourceId: 1 });
paymentSchema.index({ paymentDate: 1, paymentMethod: 1 });
paymentSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Payment', paymentSchema);
