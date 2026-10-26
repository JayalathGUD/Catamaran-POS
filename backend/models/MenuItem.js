const mongoose = require('mongoose');

const menuItemSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    category: {
      type: String,
      required: true,
      enum: ['Food', 'Drinks', 'Surf Lessons', 'Other Services']
    },
    sellingPrice: {
      type: Number,
      required: true,
      min: 0
    },
    costPrice: {
      type: Number,
      required: true,
      min: 0
    },
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true
    },
    stockTracking: {
      type: Boolean,
      default: false
    },
    isActive: {
      type: Boolean,
      default: true
    },
    description: {
      type: String,
      trim: true,
      default: ''
    },
    inventoryItemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'InventoryItem',
      default: null
    }
  },
  { timestamps: true }
);

menuItemSchema.index({ code: 1 }, { unique: true });

module.exports = mongoose.model('MenuItem', menuItemSchema);