import mongoose from "mongoose";

const InstalledShopSchema = new mongoose.Schema({
  shopId: { type: String, required: true, unique: true },
  accessToken: { type: String, required: true },
  installedAt: { type: Date, default: Date.now },
  active: { type: Boolean, default: true }
});

export default mongoose.models.InstalledShop || mongoose.model('InstalledShop', InstalledShopSchema);