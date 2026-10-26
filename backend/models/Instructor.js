const mongoose = require('mongoose');

const instructorSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    phone: {
      type: String,
      trim: true,
      default: ''
    },
    email: {
      type: String,
      trim: true,
      default: ''
    },
    specialties: {
      type: String,
      trim: true,
      default: 'All Levels (Beginner to Advanced)'
    },
    isActive: {
      type: Boolean,
      default: true
    },
    notes: {
      type: String,
      trim: true,
      default: ''
    }
  },
  { timestamps: true }
);

instructorSchema.index({ name: 1 });
instructorSchema.index({ isActive: 1 });

module.exports = mongoose.model('Instructor', instructorSchema);
