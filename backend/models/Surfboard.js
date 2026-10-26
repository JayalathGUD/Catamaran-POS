const mongoose = require('mongoose');

const surfboardSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    category: {
      type: String,
      required: true,
      enum: [
        'Soft-top Foamies',
        'Epoxy Funboards',
        'Performance Shortboards',
        'Classic Longboards'
      ]
    },
    length: {
      type: String,
      default: '8\'0"'
    },
    finSetup: {
      type: String,
      default: 'Thruster (3-fin)'
    },
    condition: {
      type: String,
      default: 'Excellent'
    },
    status: {
      type: String,
      enum: ['Available', 'Rented', 'In Lesson', 'Damaged', 'Under Repair'],
      default: 'Available'
    },
    currentRentalId: {
      type: String,
      default: ''
    },
    currentLessonId: {
      type: String,
      default: ''
    },
    currentCustomer: {
      type: String,
      default: ''
    },
    rentalStartTime: {
      type: String,
      default: ''
    },
    lastReturnedTime: {
      type: String,
      default: ''
    },
    damageNotes: {
      type: String,
      default: ''
    },
    acquiredDate: {
      type: String,
      default: () => new Date().toISOString().split('T')[0]
    }
  },
  { timestamps: true }
);

surfboardSchema.index({ name: 1 });
surfboardSchema.index({ status: 1 });

module.exports = mongoose.model('Surfboard', surfboardSchema);
