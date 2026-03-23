import mongoose from "mongoose";


// ====================== PROCESSED DAY TRACKER ======================
// This prevents double-counting when you open the page multiple times during testing
const ProcessedDaySchema = new mongoose.Schema({
    shop: { type: String, required: true, index: true },
    date: { type: String, required: true, index: true },   // "2025-03-18"
    processedAt: { type: Date, required: true },
    orderCount: { type: Number, default: 0 },
    recordsUpdated: { type: Number, default: 0 }
});

// Unique index → same day can be processed only once
ProcessedDaySchema.index({ shop: 1, date: 1 }, { unique: true });

export const ProcessedDay = mongoose.models.ProcessedDay ||
    mongoose.model('ProcessedDay', ProcessedDaySchema);