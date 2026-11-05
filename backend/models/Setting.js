const mongoose = require('mongoose');

const settingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'general' },
    cashierName: { type: String, default: 'Kasun P.' },
    restaurantName: { type: String, default: 'CATAMARAN BEACH RESTAURANT' },
    restaurantTagline: { type: String, default: 'BEACHFRONT DINING · BAR · SURF' },
    restaurantPhone: { type: String, default: '+94 91 224 8890 | +94 77 123 4567' },
    restaurantAddress: { type: String, default: 'DEWATA BEACH, GALLE, SRI LANKA' },
    restaurantWebsite: { type: String, default: 'https://www.catamaransurfclubdewata.com' },
    defaultServiceCharge: { type: Number, default: 10 },
    defaultPaymentMethod: { type: String, default: 'Cash' },
    autoPrintReceipt: { type: Boolean, default: true },
    instagramHandle: { type: String, default: '@catamaranbeachrestaurant' },
    softwareCredit: { type: String, default: 'Software by Nexion Solution' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Setting', settingSchema);
