const mongoose = require('mongoose');

const inventoryItemSchema = new mongoose.Schema(
  {
    productName: {
      type: String,
      required: true,
      trim: true
    },
    category: {
      type: String,
      required: true,
      enum: ['Food', 'Drinks', 'Surf Lessons', 'Other Services']
    },
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true
    },
    currentQuantity: {
      type: Number,
      required: true,
      default: 0
    },
    reorderThreshold: {
      type: Number,
      required: true,
      default: 5
    },
    unit: {
      type: String,
      default: 'Units'
    },
    unitCost: {
      type: Number,
      required: true,
      default: 0
    },
    sellingPrice: {
      type: Number,
      required: true,
      default: 0
    },
    supplier: {
      type: String,
      default: ''
    },
    lastRestockedAt: {
      type: String,
      default: ''
    },
    isActive: {
      type: Boolean,
      default: true
    },
    isArchived: {
      type: Boolean,
      default: false
    },
    legacyCodes: [
      {
        type: String,
        trim: true,
        uppercase: true
      }
    ]
  },
  { timestamps: true }
);

inventoryItemSchema.index({ code: 1 }, { unique: true });
inventoryItemSchema.index({ legacyCodes: 1 });
inventoryItemSchema.index({ isActive: 1, isArchived: 1 });

module.exports = mongoose.model('InventoryItem', inventoryItemSchema);
