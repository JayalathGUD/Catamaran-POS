const mongoose = require('mongoose');

const rentalSchema = new mongoose.Schema(
  {
    boardId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Surfboard',
      required: true
    },
    boardName: {
      type: String,
      required: true
    },
    boardCategory: {
      type: String,
      default: 'Soft-top Foamies'
    },
    customerName: {
      type: String,
      required: true,
      trim: true
    },
    customerContact: {
      type: String,
      default: ''
    },
    customerPassportOrId: {
      type: String,
      default: ''
    },
    startDate: {
      type: String,
      required: true
    },
    startTime: {
      type: String,
      required: true
    },
    startTimestamp: {
      type: Number,
      required: true
    },
    hourlyRate: {
      type: Number,
      default: 1000
    },
    agreedHourlyRate: {
      type: Number,
      default: 1000
    },
    notes: {
      type: String,
      default: ''
    },
    status: {
      type: String,
      enum: ['Active', 'Completed', 'Cancelled'],
      default: 'Active'
    },
    // Return & Settlement details
    receiptNumber: {
      type: String,
      default: ''
    },
    returnDate: {
      type: String,
      default: ''
    },
    returnTime: {
      type: String,
      default: ''
    },
    returnTimestamp: {
      type: Number
    },
    durationMinutes: {
      type: Number,
      default: 0
    },
    durationDisplay: {
      type: String,
      default: ''
    },
    actualRentalCharge: {
      type: Number,
      default: 0
    },
    calculatedReferenceCharge: {
      type: Number,
      default: 0
    },
    discountAmount: {
      type: Number,
      default: 0
    },
    roundingPolicyUsed: {
      type: String,
      default: 'prorated'
    },
    damageFee: {
      type: Number,
      default: 0
    },
    totalCharged: {
      type: Number,
      default: 0
    },
    conditionOnReturn: {
      type: String,
      default: 'Available'
    },
    paymentMethod: {
      type: String,
      default: 'Cash'
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
    paymentRecordedAt: {
      type: String,
      default: ''
    },
    returnedAt: {
      type: String,
      default: ''
    }
  },
  { timestamps: true }
);

rentalSchema.index({ status: 1 });
rentalSchema.index({ boardId: 1 });
rentalSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Rental', rentalSchema);
