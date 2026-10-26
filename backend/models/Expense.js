
const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema(
  {
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200
    },
    category: {
      type: String,
      required: true,
      enum: [
        'Electricity',
        'Water',
        'Internet & Phone',
        'Rent',
        'Salaries & Wages',
        'Cleaning',
        'Repairs & Maintenance',
        'Transport',
        'Office Supplies',
        'Marketing',
        'Bank & Payment Fees',
        'Other'
      ]
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01
    },
    date: {
      type: String,
      required: true
    },
    paymentMethod: {
      type: String,
      required: true,
      enum: ['Cash', 'Card', 'Bank Transfer', 'Other']
    },
    notes: {
      type: String,
      default: '',
      maxlength: 500
    },
    recordedBy: {
      type: String,
      default: 'Store Manager',
      trim: true
    },
    status: {
      type: String,
      enum: ['Recorded', 'Cancelled'],
      default: 'Recorded'
    }
  },
  { timestamps: true }
);

expenseSchema.index({ date: -1, status: 1 });
expenseSchema.index({ category: 1, date: -1 });

module.exports = mongoose.model('Expense', expenseSchema);
