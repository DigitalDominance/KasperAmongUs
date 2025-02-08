// models/Player.js
const mongoose = require('mongoose');

const PlayerSchema = new mongoose.Schema({
  walletAddress: { type: String, unique: true, required: true },
  score: { type: Number, default: 0 },
  lastOnline: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Player', PlayerSchema);
