const mongoose = require('mongoose');

const assignedBoardSchema = new mongoose.Schema(
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
    }
  },
  { _id: false }
);

const lessonSchema = new mongoose.Schema(
  {
    lessonNumber: {
      type: String,
      required: true,
      unique: true,
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
    customerPassportOrId: {
      type: String,
      default: '',
      trim: true
    },
    studentCount: {
      type: Number,
      required: true,
      min: 1,
      default: 1
    },
    lessonType: {
      type: String,
      enum: ['Private', 'Group'],
      default: 'Private'
    },
    pricingMode: {
      type: String,
      enum: ['Per Person', 'Fixed Session'],
      default: 'Per Person'
    },
    unitPrice: {
      type: Number,
      default: 0,
      min: 0
    },
    sessionPrice: {
      type: Number,
      default: 0,
      min: 0
    },
    durationMinutes: {
      type: Number,
      required: true,
      min: 15,
      default: 60
    },
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
    total: {
      type: Number,
      required: true,
      min: 0
    },
    paymentMethod: {
      type: String,
      enum: ['Cash', 'Card', 'Online / QR', 'Room Charge', 'Other'],
      default: 'Cash'
    },
    paymentStatus: {
      type: String,
      enum: ['Paid', 'Partially Paid', 'Unpaid'],
      default: 'Paid'
    },
    billId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Bill',
      default: null
    },
    billNumber: {
      type: String,
      default: ''
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
    endTime: {
      type: String,
      required: true
    },
    endTimestamp: {
      type: Number,
      required: true
    },
    instructorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Instructor',
      default: null
    },
    instructorName: {
      type: String,
      default: 'Unassigned'
    },
    assignedBoards: [assignedBoardSchema],
    status: {
      type: String,
      enum: ['In Progress', 'Completed', 'Cancelled'],
      default: 'In Progress'
    },
    completedAt: {
      type: String,
      default: ''
    },
    completedTimestamp: {
      type: Number,
      default: null
    },
    cancelledAt: {
      type: String,
      default: ''
    },
    cancelReason: {
      type: String,
      default: ''
    },
    coconutIssued: {
      type: Boolean,
      default: false
    },
    coconutsIssuedCount: {
      type: Number,
      default: 0,
      min: 0
    },
    coconutDeclined: {
      type: Boolean,
      default: false
    },
    coconutNotes: {
      type: String,
      default: ''
    },
    coconutIssuedAt: {
      type: String,
      default: ''
    },
    coconutIssuedBy: {
      type: String,
      default: ''
    },
    coconutMovementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StockMovement',
      default: null
    },
    notes: {
      type: String,
      default: ''
    },
    cashier: {
      type: String,
      default: 'Cashier'
    }
  },
  { timestamps: true }
);

lessonSchema.index({ status: 1 });
lessonSchema.index({ startDate: 1 });
lessonSchema.index({ instructorId: 1 });
lessonSchema.index({ billId: 1 });
lessonSchema.index({ startTimestamp: 1, endTimestamp: 1 });
lessonSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Lesson', lessonSchema);
