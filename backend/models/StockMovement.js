const mongoose = require('mongoose');

const stockMovementSchema = new mongoose.Schema(
  {
    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'InventoryItem',
      required: true
    },
    productName: {
      type: String,
      required: true
    },
    productCode: {
      type: String,
      default: ''
    },
    type: {
      type: String,
      enum: ['Purchase', 'Sale', 'Adjustment', 'Wastage'],
      required: true
    },
    quantityChange: {
      type: Number,
      required: true
    },
    balanceAfter: {
      type: Number,
      required: true
    },
    unitCost: {
      type: Number,
      default: 0
    },
    totalCost: {
      type: Number,
      default: 0
    },
    reason: {
      type: String,
      default: ''
    },
    performedBy: {
      type: String,
      default: 'Manager'
    },
    notes: {
      type: String,
      default: ''
    },
    timestamp: {
      type: String,
      default: () => new Date().toISOString()
    }
  },
  { timestamps: true }
);

stockMovementSchema.index({ itemId: 1 });
stockMovementSchema.index({ createdAt: -1 });

module.exports = mongoose.model('StockMovement', stockMovementSchema);
