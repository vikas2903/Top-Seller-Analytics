// app/lib/models/DailyProductSale.js   ← better to use separate file or folder for clarity

import mongoose from 'mongoose';

const DailyProductSaleSchema = new mongoose.Schema(
  {
    shop: {
      type: String,
      required: true,
      index: true,               // single-field index for shop queries
    },

    date: {
      type: String,
      required: true,
    },

    productId: {
      type: String,
      required: true,
    },

    title: {
      type: String,
      trim: true,
      maxlength: 500,            // prevent very long titles breaking things
    },

    handle: {
      type: String,
      trim: true,
      maxlength: 255,
    },

    imageUrl: {
      type: String,
      trim: true,
      maxlength: 1000,
    },

    soldQty: {
      type: Number,
      min: 0,
      default: 0,
    },

    price: {
      type: Number,
      min: 0,
      default: 0,
    },

    firstSeenAt: {
      type: Date,
      default: Date.now,         // set only once when document is created
    },

    lastUpdatedAt: {
      type: Date,
      default: Date.now,         // will be updated on every $set
    },
  },
  {
    timestamps: false,           // you're managing dates manually → good choice
  }
);

// ======================== INDEXES ========================

// Most important: prevents duplicates & makes upsert fast & safe
DailyProductSaleSchema.index(
  { shop: 1, date: 1, productId: 1 },
  { unique: true } 
);

// Helpful for:
// - Cleanup old days
// - Finding all products of one shop on one day
DailyProductSaleSchema.index({ shop: 1, date: 1 });

// Optional but useful if you ever want to clean up globally (rare)
DailyProductSaleSchema.index({ date: 1 });

// Optional: compound index for top-seller queries (last 7 days per shop)
DailyProductSaleSchema.index({ shop: 1, date: 1, soldQty: -1 });

export default mongoose.models.DailyProductSale ||
  mongoose.model('DailyProductSale', DailyProductSaleSchema);
