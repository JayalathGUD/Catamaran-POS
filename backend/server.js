 require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const mongoose = require('mongoose');

const MenuItem = require('./models/MenuItem');
const Bill = require('./models/Bill');
const Surfboard = require('./models/Surfboard');
const Rental = require('./models/Rental');
const InventoryItem = require('./models/InventoryItem');
const Expense = require('./models/Expense');
const StockMovement = require('./models/StockMovement');
const Instructor = require('./models/Instructor');
const Lesson = require('./models/Lesson');
const Payment = require('./models/Payment');
const Setting = require('./models/Setting');

const app = express();
const PORT = process.env.PORT || 5000;

const VALID_CATEGORIES = [
  'Food',
  'Drinks',
  'Surf Lessons',
  'Other Services'
];

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '50kb' }));

// Helper for Sri Lanka (Asia/Colombo, UTC+05:30) date & time representation
function getSriLankaDateTime(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo' }).format(d);
  const timeStr = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Colombo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }).format(d);
  return { dateStr, timeStr, timestamp: d.getTime(), isoStr: d.toISOString() };
}

// Helper for validating reporting date filters (YYYY-MM-DD)
function validateDateRange(startDate, endDate) {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (startDate && !dateRegex.test(startDate)) {
    return 'Invalid startDate format. Expected YYYY-MM-DD';
  }
  if (endDate && !dateRegex.test(endDate)) {
    return 'Invalid endDate format. Expected YYYY-MM-DD';
  }
  if (startDate && endDate && startDate > endDate) {
    return 'startDate cannot be after endDate';
  }
  return null;
}

// ============================================================
// HEALTH CHECK & SYSTEM VERSION / UPDATES
// ============================================================
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    database:
      mongoose.connection.readyState === 1
        ? 'connected'
        : 'disconnected'
  });
});

const https = require('https');

function compareVersions(current, latest) {
  const parse = (v) => String(v || '').replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
  const [cMaj = 0, cMin = 0, cPat = 0] = parse(current);
  const [lMaj = 0, lMin = 0, lPat = 0] = parse(latest);
  if (lMaj > cMaj) return 1;
  if (lMaj < cMaj) return -1;
  if (lMin > cMin) return 1;
  if (lMin < cMin) return -1;
  if (lPat > cPat) return 1;
  if (lPat < cPat) return -1;
  return 0;
}

app.get('/api/system/version', (req, res) => {
  res.json({
    name: 'Catamaran POS',
    version: '1.0.1',
    repository: 'JayalathGUD/Catamaran-POS',
    releasesUrl: 'https://github.com/JayalathGUD/Catamaran-POS/releases'
  });
});

app.get('/api/system/check-update', (req, res) => {
  const currentVersion = req.query.currentVersion || req.query.version || '1.0.1';
  const isSimulated = req.query.simulate === 'true';

  if (isSimulated) {
    const simVersion = req.query.version || '1.1.0';
    return res.json({
      updateAvailable: true,
      currentVersion,
      latestVersion: simVersion,
      releaseName: `Catamaran POS v${simVersion} (Latest Official Release)`,
      releaseNotes: 'Includes high-speed 80mm thermal receipt printing, live customer tab syncing, and surfboard custom rate controls.',
      releaseUrl: 'https://github.com/JayalathGUD/Catamaran-POS/releases',
      publishedAt: new Date().toISOString(),
      isSimulated: true
    });
  }

  const options = {
    hostname: 'api.github.com',
    path: '/repos/JayalathGUD/Catamaran-POS/releases/latest',
    method: 'GET',
    headers: {
      'User-Agent': 'Catamaran-POS-Client',
      'Accept': 'application/vnd.github.v3+json'
    },
    timeout: 5000
  };

  const ghReq = https.request(options, (ghRes) => {
    let raw = '';
    ghRes.on('data', (chunk) => { raw += chunk; });
    ghRes.on('end', () => {
      try {
        if (ghRes.statusCode === 200) {
          const data = JSON.parse(raw);
          const latestTag = data.tag_name || data.name || '';
          const isNewer = compareVersions(currentVersion, latestTag) > 0;
          return res.json({
            updateAvailable: isNewer,
            currentVersion,
            latestVersion: latestTag.replace(/^v/i, ''),
            releaseName: data.name || latestTag,
            releaseNotes: data.body || '',
            releaseUrl: data.html_url || 'https://github.com/JayalathGUD/Catamaran-POS/releases',
            publishedAt: data.published_at || new Date().toISOString()
          });
        } else {
          return res.json({
            updateAvailable: false,
            currentVersion,
            latestVersion: currentVersion,
            message: ghRes.statusCode === 404
              ? 'No GitHub releases found yet for JayalathGUD/Catamaran-POS'
              : `GitHub check returned status ${ghRes.statusCode}`
          });
        }
      } catch {
        return res.json({
          updateAvailable: false,
          currentVersion,
          latestVersion: currentVersion,
          error: 'Failed to parse GitHub response'
        });
      }
    });
  });

  ghReq.on('timeout', () => {
    ghReq.destroy();
    return res.json({
      updateAvailable: false,
      currentVersion,
      latestVersion: currentVersion,
      message: 'Update check timed out'
    });
  });

  ghReq.on('error', (err) => {
    return res.json({
      updateAvailable: false,
      currentVersion,
      latestVersion: currentVersion,
      message: 'Unable to reach update server: ' + (err?.message || 'Network error')
    });
  });

  ghReq.end();
});

// ============================================================
// SYSTEM & POS SETTINGS API
// ============================================================
app.get('/api/settings', async (req, res) => {
  try {
    let setting = await Setting.findOne({ key: 'general' });
    if (!setting) {
      setting = await Setting.create({
        key: 'general',
        restaurantWebsite: 'https://www.catamaransurfclubdewata.com'
      });
    } else if (!setting.restaurantWebsite) {
      setting.restaurantWebsite = 'https://www.catamaransurfclubdewata.com';
      await setting.save();
    }
    res.json(setting);
  } catch (err) {
    console.error('Failed to get settings:', err);
    res.status(500).json({ error: 'Failed to retrieve settings' });
  }
});

app.put('/api/settings', async (req, res) => {
  try {
    const allowedFields = [
      'cashierName',
      'restaurantName',
      'restaurantTagline',
      'restaurantPhone',
      'restaurantAddress',
      'restaurantWebsite',
      'defaultServiceCharge',
      'defaultPaymentMethod',
      'autoPrintReceipt',
      'instagramHandle',
      'softwareCredit'
    ];
    const updateData = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    }
    const setting = await Setting.findOneAndUpdate(
      { key: 'general' },
      { $set: updateData },
      { new: true, upsert: true }
    );
    res.json(setting);
  } catch (err) {
    console.error('Failed to update settings:', err);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// ============================================================
// MENU MANAGEMENT API (Optimized with In-Memory Cache & Concurrent Atlas Queries)
// ============================================================
let cachedMenuResponse = null;
let cachedMenuTime = 0;
const MENU_CACHE_TTL = 15000; // 15 seconds high-speed cache

function invalidateMenuCache() {
  cachedMenuResponse = null;
  cachedMenuTime = 0;
}

// Get all menu items
app.get('/api/menu', async (req, res) => {
  try {
    // Return cached response instantly if fresh (< 15 seconds old)
    if (cachedMenuResponse && (Date.now() - cachedMenuTime < MENU_CACHE_TTL)) {
      return res.json(cachedMenuResponse);
    }

    // Query MenuItem and InventoryItem concurrently in parallel to cut Atlas latency in half
    const [items, inventoryItems] = await Promise.all([
      MenuItem.find().sort({ name: 1 }).lean(),
      InventoryItem.find({ isArchived: { $ne: true } }).lean()
    ]);

    const invMapByCode = new Map();
    const invMapById = new Map();
    inventoryItems.forEach((inv) => {
      invMapById.set(inv._id.toString(), inv.currentQuantity);
      if (inv.code) invMapByCode.set(inv.code.toUpperCase(), inv.currentQuantity);
      if (Array.isArray(inv.legacyCodes)) {
        inv.legacyCodes.forEach((c) => invMapByCode.set(c.toUpperCase(), inv.currentQuantity));
      }
    });

    const enriched = items.map((m) => {
      let currentStock = undefined;
      if (m.stockTracking) {
        if (m.inventoryItemId && invMapById.has(m.inventoryItemId.toString())) {
          currentStock = invMapById.get(m.inventoryItemId.toString());
        } else if (m.code && invMapByCode.has(m.code.toUpperCase())) {
          currentStock = invMapByCode.get(m.code.toUpperCase());
        } else {
          currentStock = 0;
        }
      }
      return {
        ...m,
        id: m._id.toString(),
        currentStock
      };
    });

    // Save to high-speed in-memory cache
    cachedMenuResponse = enriched;
    cachedMenuTime = Date.now();

    res.json(enriched);
  } catch (error) {
    console.error('Menu query error:', error.message);
    res.status(500).json({ message: 'Could not retrieve menu items' });
  }
});

// Get one menu item
app.get('/api/menu/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid menu item ID' });
    }
    const item = await MenuItem.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ message: 'Menu item not found' });
    }
    invalidateMenuCache();
    res.json(item);
  } catch (error) {
    console.error('Menu item query error:', error.message);
    res.status(500).json({ message: 'Could not retrieve menu item' });
  }
});

function validateMenuItem(body, isUpdate = false) {
  const {
    name,
    category,
    sellingPrice,
    costPrice,
    code,
    stockTracking,
    isActive,
    description
  } = body;

  if (
    typeof name !== 'string' ||
    !name.trim() ||
    typeof code !== 'string' ||
    !code.trim() ||
    !VALID_CATEGORIES.includes(category) ||
    typeof sellingPrice !== 'number' ||
    !Number.isFinite(sellingPrice) ||
    sellingPrice < 0 ||
    typeof costPrice !== 'number' ||
    !Number.isFinite(costPrice) ||
    costPrice < 0 ||
    (stockTracking !== undefined && typeof stockTracking !== 'boolean') ||
    (isActive !== undefined && typeof isActive !== 'boolean') ||
    (description !== undefined && typeof description !== 'string')
  ) {
    return 'Please provide valid menu item details';
  }

  return null;
}

// Create a menu item
app.post('/api/menu', async (req, res) => {
  try {
    const validationError = validateMenuItem(req.body);
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const {
      name,
      category,
      sellingPrice,
      costPrice,
      code,
      stockTracking,
      isActive,
      description
    } = req.body;

    const trimmedName = name.trim();
    const cleanCode = code.trim().toUpperCase();

    // Prevent duplicate product names within the same category
    const existingName = await MenuItem.findOne({
      category,
      name: { $regex: new RegExp(`^${trimmedName}$`, 'i') }
    });
    if (existingName) {
      return res.status(409).json({
        message: `A menu item named "${trimmedName}" already exists in the ${category} category (Code: ${existingName.code})`
      });
    }

    const item = await MenuItem.create({
      name: trimmedName,
      category,
      sellingPrice,
      costPrice,
      code: cleanCode,
      stockTracking: stockTracking ?? false,
      isActive: isActive ?? true,
      description: description?.trim() ?? ''
    });

    // If stockTracking is true, link to existing InventoryItem or create one
    if (item.stockTracking) {
      let existingInv = await InventoryItem.findOne({
        $or: [
          { code: cleanCode },
          { legacyCodes: cleanCode },
          { productName: { $regex: new RegExp(`^${trimmedName}$`, 'i') } }
        ]
      });

      if (!existingInv) {
        existingInv = await InventoryItem.create({
          productName: item.name,
          category: item.category,
          code: cleanCode,
          currentQuantity: 0,
          reorderThreshold: 5,
          unit: 'Units',
          unitCost: item.costPrice,
          sellingPrice: item.sellingPrice,
          isActive: item.isActive,
          isArchived: false
        });
      } else {
        existingInv.productName = item.name;
        existingInv.category = item.category;
        existingInv.sellingPrice = item.sellingPrice;
        existingInv.unitCost = item.costPrice;
        existingInv.isActive = item.isActive;
        if (existingInv.code !== cleanCode) {
          if (!existingInv.legacyCodes.includes(existingInv.code)) {
            existingInv.legacyCodes.push(existingInv.code);
          }
          existingInv.code = cleanCode;
        }
        await existingInv.save();
      }

      item.inventoryItemId = existingInv._id;
      await item.save();
    }

    invalidateMenuCache();
    res.status(201).json(item);
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: 'Menu item validation failed' });
    }
    if (error.code === 11000) {
      return res.status(409).json({ message: 'This menu item code already exists' });
    }
    console.error('Menu create error:', error.message);
    res.status(500).json({ message: 'Could not save menu item' });
  }
});

// Edit an existing menu item
app.put('/api/menu/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid menu item ID' });
    }

    const validationError = validateMenuItem(req.body, true);
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const {
      name,
      category,
      sellingPrice,
      costPrice,
      code,
      stockTracking,
      isActive,
      description
    } = req.body;

    const existingItem = await MenuItem.findById(req.params.id);
    if (!existingItem) {
      return res.status(404).json({ message: 'Menu item not found' });
    }

    const trimmedName = name.trim();
    const oldCode = existingItem.code;
    const newCode = code.trim().toUpperCase();

    // Prevent duplicate product names within the same category (excluding current item)
    const existingName = await MenuItem.findOne({
      _id: { $ne: req.params.id },
      category,
      name: { $regex: new RegExp(`^${trimmedName}$`, 'i') }
    });
    if (existingName) {
      return res.status(409).json({
        message: `Another menu item named "${trimmedName}" already exists in the ${category} category (Code: ${existingName.code})`
      });
    }

    let linkedInvId = existingItem.inventoryItemId;

    // Synchronize or link inventory item
    if (stockTracking) {
      let invItem = null;
      if (linkedInvId) {
        invItem = await InventoryItem.findById(linkedInvId);
      }
      if (!invItem) {
        invItem = await InventoryItem.findOne({
          $or: [
            { code: newCode },
            { code: oldCode },
            { legacyCodes: { $in: [newCode, oldCode] } },
            { productName: { $regex: new RegExp(`^${trimmedName}$`, 'i') } }
          ]
        });
      }

      if (invItem) {
        if (oldCode !== newCode && invItem.code !== newCode) {
          if (!invItem.legacyCodes.includes(invItem.code)) {
            invItem.legacyCodes.push(invItem.code);
          }
          invItem.code = newCode;
        }
        invItem.productName = trimmedName;
        invItem.category = category;
        invItem.unitCost = Number(costPrice) || 0;
        invItem.sellingPrice = Number(sellingPrice) || 0;
        invItem.isActive = isActive ?? true;
        await invItem.save();
        linkedInvId = invItem._id;
      } else {
        const newInv = await InventoryItem.create({
          productName: trimmedName,
          category,
          code: newCode,
          currentQuantity: 0,
          reorderThreshold: 5,
          unit: 'Units',
          unitCost: Number(costPrice) || 0,
          sellingPrice: Number(sellingPrice) || 0,
          isActive: isActive ?? true,
          isArchived: false
        });
        linkedInvId = newInv._id;
      }
    }

    const item = await MenuItem.findByIdAndUpdate(
      req.params.id,
      {
        name: trimmedName,
        category,
        sellingPrice,
        costPrice,
        code: newCode,
        stockTracking: stockTracking ?? false,
        isActive: isActive ?? true,
        description: description?.trim() ?? '',
        inventoryItemId: linkedInvId || null
      },
      {
        returnDocument: 'after',
        runValidators: true
      }
    );

    invalidateMenuCache();
    res.json(item);
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: 'Menu item validation failed' });
    }
    if (error.code === 11000) {
      return res.status(409).json({ message: 'This menu item code already exists' });
    }
    console.error('Menu update error:', error.message);
    res.status(500).json({ message: 'Could not update menu item' });
  }
});

// Change active/inactive status
app.patch('/api/menu/:id/status', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid menu item ID' });
    }

    const { isActive } = req.body;
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ message: 'isActive must be true or false' });
    }

    const item = await MenuItem.findByIdAndUpdate(
      req.params.id,
      { isActive },
      { returnDocument: 'after', runValidators: true }
    );

    if (!item) {
      return res.status(404).json({ message: 'Menu item not found' });
    }

    invalidateMenuCache();
    res.json(item);
  } catch (error) {
    console.error('Menu status update error:', error.message);
    res.status(500).json({ message: 'Could not update menu item status' });
  }
});

// ============================================================
// BILLS & POS SALES API
// ============================================================
// Helper to recalculate live elapsed time and charge for any open bill with an active rental
async function syncLiveRentalTimeOnBill(bill) {
  if (!bill || bill.status !== 'Open') return bill;

  try {
    let rental = null;
    // 1. Direct rentalId link
    if (bill.rentalId) {
      rental = await Rental.findById(bill.rentalId);
    }
    // 2. Link by billId on Rental model
    if (!rental) {
      rental = await Rental.findOne({ billId: bill._id, status: 'Active' });
      if (rental) {
        bill.rentalId = rental._id;
      }
    }
    // 3. Case-insensitive link by customerName
    if (!rental && bill.customerName) {
      rental = await Rental.findOne({
        customerName: { $regex: new RegExp('^' + bill.customerName.trim() + '$', 'i') },
        status: 'Active'
      });
      if (rental) {
        bill.rentalId = rental._id;
      }
    }
    // 4. Link by boardName mentioned in rental line item
    if (!rental && bill.items && Array.isArray(bill.items)) {
      const rLine = bill.items.find(
        (it) => it.code === 'RENTAL' || it.name.toLowerCase().includes('surfboard')
      );
      if (rLine) {
        const boardMatch = rLine.name.match(/Board\s*(\d+|[A-Za-z0-9]+)/i);
        if (boardMatch) {
          rental = await Rental.findOne({
            boardName: { $regex: new RegExp(boardMatch[0], 'i') },
            status: 'Active'
          });
          if (rental) {
            bill.rentalId = rental._id;
          }
        }
      }
    }

    if (rental && rental.status === 'Active') {
      const now = Date.now();
      const startMs = Number(rental.startTimestamp) || now;
      const elapsedMinutes = Math.max(1, Math.round((now - startMs) / (60 * 1000)));
      const hrs = Math.floor(elapsedMinutes / 60);
      const mins = elapsedMinutes % 60;
      const durationDisplay = hrs > 0 ? (hrs + ' hr ' + (mins > 0 ? mins + ' min' : '')).trim() : (mins + ' mins');

      const agreedRate = Number(rental.agreedHourlyRate) || Number(rental.hourlyRate) || 1000;

      // Minimum 1-hour charge applies. Beyond 60 minutes prorated:
      let liveCharge = agreedRate;
      if (elapsedMinutes > 60) {
        liveCharge = agreedRate + Math.round(((elapsedMinutes - 60) / 60) * agreedRate);
      }

      const rentalItemName = 'Surfboard Rental - ' + rental.boardName + ' (' + durationDisplay + ' · Started: ' + rental.startTime + ')';
      const rentalItemIdx = bill.items.findIndex(
        (it) => it.code === 'RENTAL' || it.name.toLowerCase().includes('surfboard')
      );

      if (rentalItemIdx >= 0) {
        const item = bill.items[rentalItemIdx];
        const isCustom = Boolean(item.isCustomPrice);
        const customAmt =
          item.customPrice !== undefined && item.customPrice !== null
            ? Number(item.customPrice)
            : isCustom
            ? item.unitPrice
            : null;
        const finalPrice = isCustom && customAmt !== null ? customAmt : liveCharge;
        const customSuffix = isCustom && customAmt !== null ? ' [Custom Rate]' : '';

        item.name = 'Surfboard Rental - ' + rental.boardName + ' (' + durationDisplay + ' · Started: ' + rental.startTime + ')' + customSuffix;
        item.unitPrice = finalPrice;
        item.total = finalPrice;
        item.duration = durationDisplay;
        item.startTime = rental.startTime;
      } else {
        bill.items.unshift({
          name: rentalItemName,
          quantity: 1,
          unitPrice: liveCharge,
          total: liveCharge,
          code: 'RENTAL',
          duration: durationDisplay,
          startTime: rental.startTime,
          addedAt: new Date().toISOString()
        });
      }

      bill.subtotal = bill.items.reduce((sum, it) => sum + it.total, 0);
      bill.total = Math.max(0, bill.subtotal - (bill.discount || 0)) + (bill.serviceCharge || 0);
      bill.balanceDue = Math.max(0, bill.total - (bill.totalPaid || 0));

      await bill.save();
    } else {
      // Fallback: If no Rental doc exists but bill has a surfboard item with startTime / addedAt
      const rIdx = bill.items.findIndex(
        (it) => it.code === 'RENTAL' || it.name.toLowerCase().includes('surfboard')
      );
      if (rIdx >= 0) {
        const item = bill.items[rIdx];
        if (!item.isCustomPrice && (item.startTime || item.addedAt)) {
          let startMs = item.addedAt ? new Date(item.addedAt).getTime() : null;
          if (!startMs && item.startTime) {
            const todayStr = bill.date || new Date().toISOString().split('T')[0];
            const parsed = Date.parse(todayStr + ' ' + item.startTime);
            if (!isNaN(parsed)) startMs = parsed;
          }
          if (startMs && !isNaN(startMs)) {
            const now = Date.now();
            const elapsedMinutes = Math.max(1, Math.round((now - startMs) / (60 * 1000)));
            const hrs = Math.floor(elapsedMinutes / 60);
            const mins = elapsedMinutes % 60;
            const durationDisplay = hrs > 0 ? (hrs + ' hr ' + (mins > 0 ? mins + ' min' : '')).trim() : (mins + ' mins');
            const baseRate = item.unitPrice || 1000;
            let liveCharge = baseRate;
            if (elapsedMinutes > 60) {
              liveCharge = baseRate + Math.round(((elapsedMinutes - 60) / 60) * baseRate);
            }
            item.duration = durationDisplay;
            item.unitPrice = liveCharge;
            item.total = liveCharge;
            bill.subtotal = bill.items.reduce((sum, it) => sum + it.total, 0);
            bill.total = Math.max(0, bill.subtotal - (bill.discount || 0)) + (bill.serviceCharge || 0);
            bill.balanceDue = Math.max(0, bill.total - (bill.totalPaid || 0));
            await bill.save();
          }
        }
      }
    }
  } catch (err) {
    console.warn('syncLiveRentalTimeOnBill warning:', err.message);
  }

  return bill;
}

// Get all bills with optional date and status filters (with live rental time calculation)
app.get('/api/bills', async (req, res) => {
  try {
    const { startDate, endDate, status } = req.query;
    const dateErr = validateDateRange(startDate, endDate);
    if (dateErr) {
      return res.status(400).json({ message: dateErr });
    }

    const filter = {};
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = startDate;
      if (endDate) filter.date.$lte = endDate;
    }
    if (status) {
      filter.status = status;
    }

    const bills = await Bill.find(filter).sort({ createdAt: -1 });
    const syncedBills = await Promise.all(bills.map((b) => syncLiveRentalTimeOnBill(b)));
    res.json(syncedBills);
  } catch (error) {
    console.error('Bills query error:', error.message);
    res.status(500).json({ message: 'Could not retrieve bills' });
  }
});

// Get single bill by ID (with live rental time calculation)
app.get('/api/bills/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid bill ID' });
    }
    let bill = await Bill.findById(req.params.id);
    if (!bill) {
      return res.status(404).json({ message: 'Bill not found' });
    }
    bill = await syncLiveRentalTimeOnBill(bill);
    res.json(bill);
  } catch (error) {
    console.error('Single bill query error:', error.message);
    res.status(500).json({ message: 'Could not retrieve bill' });
  }
});

let isReplicaSet = false;

async function checkReplicaSetSupport() {
  try {
    const admin = mongoose.connection.db.admin();
    const serverStatus = await admin.serverStatus();
    isReplicaSet = !!(serverStatus.repl && serverStatus.repl.setName);
  } catch {
    isReplicaSet = false;
  }

  if (!isReplicaSet) {
    // 1. Monkey-patch startSession to return a clean no-op dummy session that never contacts the server
    mongoose.startSession = async function () {
      return {
        _isDummy: true,
        startTransaction: () => {},
        commitTransaction: async () => {},
        abortTransaction: async () => {},
        endSession: async () => {},
        withTransaction: async function (fn) {
          return await fn();
        },
        inTransaction: () => false
      };
    };

    // 2. Monkey-patch Query.prototype.session so any .session(s) gracefully drops session in standalone mode
    const origQuerySession = mongoose.Query.prototype.session;
    mongoose.Query.prototype.session = function (sess) {
      if (!isReplicaSet || !sess || sess._isDummy) {
        return origQuerySession.call(this, null);
      }
      return origQuerySession.call(this, sess);
    };
  }

  console.log(
    `MongoDB mode: ${isReplicaSet ? 'Replica Set (Transactions Enabled)' : 'Standalone (Transactions Disabled, Direct Atomic Operations Enabled)'}`
  );
}

// Helper to run operations within a MongoDB transaction if available, with standalone fallback and transient conflict retry
async function executeInTransaction(workFn, maxRetries = 5) {
  // If we already detected standalone MongoDB (no replica set), run directly without any session overhead
  if (!isReplicaSet) {
    return await workFn({});
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    let session = null;
    let inTransaction = false;
    try {
      session = await mongoose.startSession();
      if (session && !session._isDummy) {
        try {
          session.startTransaction();
          inTransaction = true;
        } catch {
          inTransaction = false;
        }
      }

      const sessionOpt = inTransaction && session && !session._isDummy ? { session } : {};
      const result = await workFn(sessionOpt);

      if (inTransaction && session && !session._isDummy) {
        await session.commitTransaction();
      }
      return result;
    } catch (err) {
      if (inTransaction && session && !session._isDummy) {
        try {
          await session.abortTransaction();
        } catch {
          // ignore abort error
        }
      }

      const isStandaloneError =
        err &&
        err.message &&
        (err.message.includes('Transaction numbers are only allowed on a replica set member or mongos') ||
          err.message.includes('standalone') ||
          err.message.includes('retryable writes') ||
          err.message.includes('replica set'));

      if (isStandaloneError) {
        isReplicaSet = false;
        console.warn('MongoDB running in standalone mode (no replica set). Falling back to direct execution.');
        return await workFn({});
      }

      const isTransient =
        err &&
        (err.code === 112 || // WriteConflict
          (typeof err.hasErrorLabel === 'function' &&
            (err.hasErrorLabel('TransientTransactionError') ||
              err.hasErrorLabel('UnknownTransactionCommitResult'))) ||
          (err.errorLabels &&
            (err.errorLabels.includes('TransientTransactionError') ||
              err.errorLabels.includes('UnknownTransactionCommitResult'))) ||
          (err.message && err.message.includes('Please retry your operation or multi-document transaction')));

      if (isTransient && attempt < maxRetries) {
        const delay = Math.min(500, Math.pow(2, attempt) * 25 + Math.floor(Math.random() * 30));
        await new Promise((res) => setTimeout(res, delay));
        continue;
      }

      throw err;
    } finally {
      if (session && !session._isDummy) {
        try {
          await session.endSession();
        } catch {
          // ignore
        }
      }
    }
  }
}

// Create new bill with authoritative stock validation
app.post('/api/bills', async (req, res) => {
  try {
    const {
      billNumber: customBillNumber,
      customerName,
      customerReference,
      date,
      time,
      orderType,
      saleType,
      paymentMethod,
      items,
      subtotal,
      discount,
      serviceCharge,
      total,
      status: requestedStatus,
      cashier,
      notes,
      amountTendered,
      changeDue,
      splitCashAmount,
      splitCardAmount
    } = req.body;

    const targetStatus = requestedStatus === 'Open' ? 'Open' : 'Settled';
    const finalCustomerName = (customerName || customerReference || '').trim();
    const safeItems = Array.isArray(items) ? items : [];

    if (targetStatus === 'Settled' && safeItems.length === 0) {
      return res.status(400).json({ message: 'Bill must contain at least one item' });
    }

    // 1. Validate line items and quantity rules
    const fractionalUnits = ['kg', 'g', 'gram', 'grams', 'liter', 'liters', 'l', 'ml', 'meter', 'meters', 'm'];
    const codeQuantities = new Map();

    for (let idx = 0; idx < safeItems.length; idx++) {
      const line = safeItems[idx];
      if (!line || typeof line !== 'object') {
        return res.status(400).json({ message: `Item at index ${idx} is invalid` });
      }
      if (!line.name || typeof line.name !== 'string' || !line.name.trim()) {
        return res.status(400).json({ message: `Item at index ${idx} must have a valid name` });
      }
      if (typeof line.quantity !== 'number' || !Number.isFinite(line.quantity) || line.quantity <= 0) {
        return res.status(400).json({
          message: `Invalid quantity for "${line.name}". Quantity must be a positive number.`
        });
      }
      if (typeof line.unitPrice !== 'number' || !Number.isFinite(line.unitPrice) || line.unitPrice < 0) {
        return res.status(400).json({
          message: `Invalid unit price for "${line.name}". Unit price must be 0 or greater.`
        });
      }

      const code = line.code ? String(line.code).trim().toUpperCase() : '';
      if (code) {
        codeQuantities.set(code, (codeQuantities.get(code) || 0) + line.quantity);
      }
    }

    // Determine final bill number with concurrent collision avoidance
    const year = new Date().getFullYear();
    let finalBillNumber = customBillNumber ? String(customBillNumber).trim() : '';
    if (!finalBillNumber || finalBillNumber.includes('TEMP')) {
      const count = await Bill.countDocuments();
      finalBillNumber = `BILL-${year}-${String(count + 1).padStart(4, '0')}`;
    }

    const currentDate = date || new Date().toISOString().split('T')[0];
    const currentTime =
      time ||
      new Date().toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });

    // 2. Perform stock validation, atomic deduction, and bill creation within transaction
    const bill = await executeInTransaction(async (sessionOpt) => {
      // Prevent duplicate bill number submission / handle concurrent increments
      if (!customBillNumber || customBillNumber.includes('TEMP')) {
        let attempts = 0;
        while (attempts < 20) {
          const existing = await Bill.findOne({ billNumber: finalBillNumber }, { _id: 1 }, sessionOpt);
          if (!existing) break;
          const match = finalBillNumber.match(/BILL-\d+-(\d+)/);
          const curSeq = match ? parseInt(match[1], 10) : 1;
          finalBillNumber = `BILL-${year}-${String(curSeq + 1).padStart(4, '0')}`;
          attempts++;
        }
      } else {
        const existingBill = await Bill.findOne({ billNumber: finalBillNumber }, null, sessionOpt);
        if (existingBill) {
          const err = new Error(`Bill #${finalBillNumber} already exists`);
          err.statusCode = 409;
          throw err;
        }
      }

      // Pre-check stock & units for all tracked items
      const trackedItemsToDeduct = [];
      for (const [code, requestedQty] of codeQuantities.entries()) {
        const invItem = await InventoryItem.findOne(
          { $or: [{ code }, { legacyCodes: code }] },
          null,
          sessionOpt
        );
        if (invItem) {
          const unitLower = String(invItem.unit || '').trim().toLowerCase();
          const allowsFraction = fractionalUnits.includes(unitLower);
          if (!allowsFraction && !Number.isInteger(requestedQty)) {
            const err = new Error(
              `Invalid fractional quantity (${requestedQty}) for "${invItem.productName}". Product unit "${invItem.unit}" requires whole numbers.`
            );
            err.statusCode = 400;
            throw err;
          }

          if (invItem.currentQuantity < requestedQty) {
            const err = new Error(
              `Insufficient stock for "${invItem.productName}" (${invItem.code}). Requested: ${requestedQty}, Available: ${invItem.currentQuantity}.`
            );
            err.statusCode = 400;
            throw err;
          }

          trackedItemsToDeduct.push({ invItem, requestedQty });
        }
      }

      // Atomically deduct stock using conditional update
      const movementsToCreate = [];
      const rollbackDeductions = [];

      try {
        for (const { invItem, requestedQty } of trackedItemsToDeduct) {
          const updatedInv = await InventoryItem.findOneAndUpdate(
            { _id: invItem._id, currentQuantity: { $gte: requestedQty } },
            { $inc: { currentQuantity: -requestedQty } },
            { returnDocument: 'after', ...sessionOpt }
          );

          if (!updatedInv) {
            const err = new Error(
              `Stock conflict for "${invItem.productName}" (${invItem.code}). Insufficient stock remaining due to concurrent purchase.`
            );
            err.statusCode = 409;
            throw err;
          }

          rollbackDeductions.push({ id: invItem._id, qty: requestedQty });

          movementsToCreate.push({
            itemId: invItem._id,
            productName: invItem.productName,
            productCode: invItem.code,
            type: 'Sale',
            quantityChange: -requestedQty,
            balanceAfter: updatedInv.currentQuantity,
            unitCost: invItem.unitCost,
            totalCost: invItem.unitCost * requestedQty,
            reason: targetStatus === 'Open' ? `POS Open Order #${finalBillNumber}` : `POS Sale #${finalBillNumber}`,
            performedBy: cashier || 'POS Terminal',
            timestamp: new Date().toISOString()
          });
        }

        // Create stock movement audit records
        if (movementsToCreate.length > 0) {
          await StockMovement.insertMany(movementsToCreate, sessionOpt);
        }

        // Authoritative server-side financial calculations
        const computedSubtotal = safeItems.reduce(
          (sum, it) => sum + Number(it.unitPrice) * Number(it.quantity),
          0
        );
        const cleanDiscount = Math.max(0, Number(discount) || 0);
        const taxableBase = Math.max(0, computedSubtotal - cleanDiscount);
        const cleanServiceCharge = Number(serviceCharge) >= 0 ? Number(serviceCharge) : 0;
        const computedTotal = Math.max(0, taxableBase + cleanServiceCharge);

        let billPaymentStatus = 'Paid';
        let billTotalPaid = computedTotal;
        let billBalanceDue = 0;

        if (targetStatus === 'Open') {
          billPaymentStatus = 'Unpaid';
          billTotalPaid = 0;
          billBalanceDue = computedTotal;
        } else if (
          paymentMethod === 'Customer Credit' ||
          req.body.isCredit === true ||
          req.body.paymentStatus === 'Unpaid' ||
          req.body.paymentStatus === 'Partially Paid'
        ) {
          const reqPaid = Number(req.body.paidAmount) || 0;
          billTotalPaid = Math.min(computedTotal, Math.max(0, reqPaid));
          billBalanceDue = Math.max(0, computedTotal - billTotalPaid);
          billPaymentStatus = billBalanceDue === 0 ? 'Paid' : (billTotalPaid > 0 ? 'Partially Paid' : 'Unpaid');
        }

        const nowIso = new Date().toISOString();
        const slDate = getSriLankaDateTime();
        const billData = {
          billNumber: finalBillNumber,
          customerName: finalCustomerName,
          date: currentDate || slDate.dateStr,
          time: currentTime || slDate.timeStr,
          orderType: orderType || 'Dine-in',
          saleType: saleType || 'Restaurant & Cafe',
          paymentMethod: paymentMethod || 'Cash',
          items: safeItems.map((it) => ({
            name: it.name,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            total: it.unitPrice * it.quantity,
            code: it.code ? String(it.code).trim().toUpperCase() : '',
            duration: it.duration || '',
            startTime: it.startTime || '',
            endTime: it.endTime || '',
            isCustomPrice: Boolean(it.isCustomPrice),
            customPrice:
              it.customPrice !== undefined && it.customPrice !== null
                ? Number(it.customPrice)
                : it.isCustomPrice
                ? it.unitPrice
                : undefined,
            addedAt: it.addedAt || nowIso
          })),
          subtotal: computedSubtotal,
          discount: cleanDiscount,
          serviceCharge: cleanServiceCharge,
          total: computedTotal,
          status: targetStatus,
          paymentStatus: billPaymentStatus,
          totalPaid: billTotalPaid,
          balanceDue: billBalanceDue,
          cashier: cashier || 'Kasun P.',
          amountTendered: Number(amountTendered) || 0,
          changeDue: Number(changeDue) || 0,
          splitCashAmount: Number(splitCashAmount) || 0,
          splitCardAmount: Number(splitCardAmount) || 0,
          closedAt: targetStatus === 'Settled' ? nowIso : '',
          notes: notes ? String(notes).trim() : ''
        };

        let newBill;
        if (sessionOpt.session) {
          const created = await Bill.create([billData], sessionOpt);
          newBill = created[0];
        } else {
          newBill = await Bill.create(billData);
        }

        if (targetStatus === 'Settled' && billTotalPaid > 0) {
          const payMethod = paymentMethod === 'Customer Credit' ? (req.body.initialPaymentMethod || 'Cash') : (paymentMethod || 'Cash');
          await Payment.create(
            [
              {
                sourceType: 'Bill',
                sourceId: newBill._id,
                sourceReference: newBill.billNumber,
                customerName: newBill.customerName || 'Walk-in Guest',
                customerContact: req.body.customerContact || '',
                amount: billTotalPaid,
                paymentMethod: payMethod,
                paymentDate: slDate.dateStr,
                paymentTime: slDate.timeStr,
                paymentTimestamp: slDate.timestamp,
                cashier: cashier || 'Kasun P.',
                notes: notes ? String(notes).trim() : 'Bill settlement payment'
              }
            ],
            sessionOpt
          );
        }

        return newBill;
      } catch (err) {
        // If not in a replica set transaction, roll back any already applied deductions
        if (!sessionOpt.session && rollbackDeductions.length > 0) {
          for (const itemToRestore of rollbackDeductions) {
            await InventoryItem.findByIdAndUpdate(itemToRestore.id, {
              $inc: { currentQuantity: itemToRestore.qty }
            });
          }
        }
        throw err;
      }
    });

    res.status(201).json(bill);
  } catch (error) {
    console.error('Bill create error:', error.message);
    let status = error.statusCode;
    let message = error.message;
    if (!status) {
      if (
        error.code === 112 ||
        (error.errorLabels && error.errorLabels.includes('TransientTransactionError')) ||
        (typeof error.hasErrorLabel === 'function' && error.hasErrorLabel('TransientTransactionError'))
      ) {
        status = 409;
        message = 'Concurrent transaction conflict on inventory. Please retry checkout.';
      } else {
        status = 500;
      }
    }
    res.status(status).json({ message: message || 'Could not create bill' });
  }
});

// Add items to an existing Open Bill
app.post('/api/bills/:id/items', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid bill ID' });
    }

    const { items: newItems, cashier, customerName } = req.body;
    if (!newItems || !Array.isArray(newItems) || newItems.length === 0) {
      return res.status(400).json({ message: 'Must provide at least one item to add' });
    }

    const fractionalUnits = ['kg', 'g', 'gram', 'grams', 'liter', 'liters', 'l', 'ml', 'meter', 'meters', 'm'];
    const codeQuantities = new Map();

    for (let idx = 0; idx < newItems.length; idx++) {
      const line = newItems[idx];
      if (!line || typeof line !== 'object') {
        return res.status(400).json({ message: `Item at index ${idx} is invalid` });
      }
      if (!line.name || typeof line.name !== 'string' || !line.name.trim()) {
        return res.status(400).json({ message: `Item at index ${idx} must have a valid name` });
      }
      if (typeof line.quantity !== 'number' || !Number.isFinite(line.quantity) || line.quantity <= 0) {
        return res.status(400).json({
          message: `Invalid quantity for "${line.name}". Quantity must be a positive number.`
        });
      }
      if (typeof line.unitPrice !== 'number' || !Number.isFinite(line.unitPrice) || line.unitPrice < 0) {
        return res.status(400).json({
          message: `Invalid unit price for "${line.name}". Unit price must be 0 or greater.`
        });
      }
      const code = line.code ? String(line.code).trim().toUpperCase() : '';
      if (code) {
        codeQuantities.set(code, (codeQuantities.get(code) || 0) + line.quantity);
      }
    }

    const updatedBill = await executeInTransaction(async (sessionOpt) => {
      const bill = await Bill.findById(req.params.id, null, sessionOpt);
      if (!bill) {
        const err = new Error('Bill not found');
        err.statusCode = 404;
        throw err;
      }
      if (bill.status !== 'Open') {
        const err = new Error(
          `Cannot add items to Bill #${bill.billNumber} because it is already ${bill.status}`
        );
        err.statusCode = 400;
        throw err;
      }

      // Pre-check stock for all tracked items in newItems
      const trackedItemsToDeduct = [];
      for (const [code, requestedQty] of codeQuantities.entries()) {
        const invItem = await InventoryItem.findOne(
          { $or: [{ code }, { legacyCodes: code }] },
          null,
          sessionOpt
        );
        if (invItem) {
          const unitLower = String(invItem.unit || '').trim().toLowerCase();
          const allowsFraction = fractionalUnits.includes(unitLower);
          if (!allowsFraction && !Number.isInteger(requestedQty)) {
            const err = new Error(
              `Invalid fractional quantity (${requestedQty}) for "${invItem.productName}". Product unit "${invItem.unit}" requires whole numbers.`
            );
            err.statusCode = 400;
            throw err;
          }

          if (invItem.currentQuantity < requestedQty) {
            const err = new Error(
              `Insufficient stock for "${invItem.productName}" (${invItem.code}). Requested: ${requestedQty}, Available: ${invItem.currentQuantity}.`
            );
            err.statusCode = 400;
            throw err;
          }

          trackedItemsToDeduct.push({ invItem, requestedQty });
        }
      }

      const movementsToCreate = [];
      const rollbackDeductions = [];

      try {
        for (const { invItem, requestedQty } of trackedItemsToDeduct) {
          const updatedInv = await InventoryItem.findOneAndUpdate(
            { _id: invItem._id, currentQuantity: { $gte: requestedQty } },
            { $inc: { currentQuantity: -requestedQty } },
            { returnDocument: 'after', ...sessionOpt }
          );

          if (!updatedInv) {
            const err = new Error(
              `Stock conflict for "${invItem.productName}" (${invItem.code}). Insufficient stock remaining due to concurrent purchase.`
            );
            err.statusCode = 409;
            throw err;
          }

          rollbackDeductions.push({ id: invItem._id, qty: requestedQty });

          movementsToCreate.push({
            itemId: invItem._id,
            productName: invItem.productName,
            productCode: invItem.code,
            type: 'Sale',
            quantityChange: -requestedQty,
            balanceAfter: updatedInv.currentQuantity,
            unitCost: invItem.unitCost,
            totalCost: invItem.unitCost * requestedQty,
            reason: `Added to Bill #${bill.billNumber}`,
            performedBy: cashier || 'POS Terminal',
            timestamp: new Date().toISOString()
          });
        }

        if (movementsToCreate.length > 0) {
          await StockMovement.insertMany(movementsToCreate, sessionOpt);
        }

        // Append new items
        const nowIso = new Date().toISOString();
        const formattedNewItems = newItems.map((line) => ({
          name: line.name,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          total: line.quantity * line.unitPrice,
          code: line.code ? String(line.code).trim().toUpperCase() : '',
          addedAt: nowIso
        }));

        bill.items.push(...formattedNewItems);
        if (customerName) {
          bill.customerName = String(customerName).trim();
        }

        // Authoritative server totals recalculation
        bill.subtotal = bill.items.reduce((acc, it) => acc + it.unitPrice * it.quantity, 0);
        if (req.body.discount !== undefined) {
          bill.discount = Math.max(0, Number(req.body.discount) || 0);
        }
        if (req.body.serviceCharge !== undefined) {
          bill.serviceCharge = Math.max(0, Number(req.body.serviceCharge) || 0);
        } else if (bill.serviceCharge > 0 && bill.subtotal > 0) {
          // If service charge was active, adjust proportionally (10%)
          const taxableBase = Math.max(0, bill.subtotal - bill.discount);
          bill.serviceCharge = Math.round(taxableBase * 0.1);
        }
        bill.total = Math.max(0, bill.subtotal - bill.discount) + bill.serviceCharge;

        await bill.save(sessionOpt);
        return bill;
      } catch (err) {
        if (!sessionOpt.session && rollbackDeductions.length > 0) {
          for (const itemToRestore of rollbackDeductions) {
            await InventoryItem.findByIdAndUpdate(itemToRestore.id, {
              $inc: { currentQuantity: itemToRestore.qty }
            });
          }
        }
        throw err;
      }
    });

    res.status(200).json(updatedBill);
  } catch (error) {
    console.error('Add items to bill error:', error.message);
    let status = error.statusCode;
    let message = error.message;
    if (!status) {
      if (
        error.code === 112 ||
        (error.errorLabels && error.errorLabels.includes('TransientTransactionError')) ||
        (typeof error.hasErrorLabel === 'function' && error.hasErrorLabel('TransientTransactionError'))
      ) {
        status = 409;
        message = 'Concurrent transaction conflict on inventory. Please retry.';
      } else {
        status = 500;
      }
    }
    res.status(status).json({ message: message || 'Could not add items to bill' });
  }
});

// Update items/quantities on an Open Bill (replaces items array with delta stock adjustments)
app.patch('/api/bills/:id/items', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid bill ID' });
    }

    const { items: updatedItems, customerName, discount, serviceCharge, cashier } = req.body;
    if (!updatedItems || !Array.isArray(updatedItems)) {
      return res.status(400).json({ message: 'Invalid items array' });
    }

    const fractionalUnits = ['kg', 'g', 'gram', 'grams', 'liter', 'liters', 'l', 'ml', 'meter', 'meters', 'm'];

    for (let idx = 0; idx < updatedItems.length; idx++) {
      const line = updatedItems[idx];
      if (!line || typeof line !== 'object') {
        return res.status(400).json({ message: `Item at index ${idx} is invalid` });
      }
      if (!line.name || typeof line.name !== 'string' || !line.name.trim()) {
        return res.status(400).json({ message: `Item at index ${idx} must have a valid name` });
      }
      if (typeof line.quantity !== 'number' || !Number.isFinite(line.quantity) || line.quantity <= 0) {
        return res.status(400).json({
          message: `Invalid quantity for "${line.name}". Quantity must be a positive number.`
        });
      }
      if (typeof line.unitPrice !== 'number' || !Number.isFinite(line.unitPrice) || line.unitPrice < 0) {
        return res.status(400).json({
          message: `Invalid unit price for "${line.name}". Unit price must be 0 or greater.`
        });
      }
    }

    const updatedBill = await executeInTransaction(async (sessionOpt) => {
      const bill = await Bill.findById(req.params.id, null, sessionOpt);
      if (!bill) {
        const err = new Error('Bill not found');
        err.statusCode = 404;
        throw err;
      }
      if (bill.status !== 'Open') {
        const err = new Error(
          `Cannot modify items on Bill #${bill.billNumber} because it is already ${bill.status}`
        );
        err.statusCode = 400;
        throw err;
      }

      // Compute delta quantities for tracked item codes
      const oldQtyMap = new Map();
      bill.items.forEach((it) => {
        const code = it.code ? String(it.code).trim().toUpperCase() : '';
        if (code) {
          oldQtyMap.set(code, (oldQtyMap.get(code) || 0) + it.quantity);
        }
      });

      const newQtyMap = new Map();
      updatedItems.forEach((it) => {
        const code = it.code ? String(it.code).trim().toUpperCase() : '';
        if (code) {
          newQtyMap.set(code, (newQtyMap.get(code) || 0) + it.quantity);
        }
      });

      const allCodes = new Set([...oldQtyMap.keys(), ...newQtyMap.keys()]);
      const movementsToCreate = [];

      for (const code of allCodes) {
        const oldQty = oldQtyMap.get(code) || 0;
        const newQty = newQtyMap.get(code) || 0;
        const delta = newQty - oldQty; // >0 means deduct more, <0 means restore

        if (delta === 0) continue;

        const invItem = await InventoryItem.findOne(
          { $or: [{ code }, { legacyCodes: code }] },
          null,
          sessionOpt
        );

        if (invItem) {
          const unitLower = String(invItem.unit || '').trim().toLowerCase();
          const allowsFraction = fractionalUnits.includes(unitLower);
          if (!allowsFraction && !Number.isInteger(Math.abs(delta))) {
            const err = new Error(
              `Invalid fractional quantity delta (${delta}) for "${invItem.productName}".`
            );
            err.statusCode = 400;
            throw err;
          }

          if (delta > 0) {
            // Need to deduct delta
            if (invItem.currentQuantity < delta) {
              const err = new Error(
                `Insufficient stock for "${invItem.productName}" (${invItem.code}). Requested increase: ${delta}, Available: ${invItem.currentQuantity}.`
              );
              err.statusCode = 400;
              throw err;
            }

            const updatedInv = await InventoryItem.findOneAndUpdate(
              { _id: invItem._id, currentQuantity: { $gte: delta } },
              { $inc: { currentQuantity: -delta } },
              { returnDocument: 'after', ...sessionOpt }
            );

            if (!updatedInv) {
              const err = new Error(
                `Stock conflict for "${invItem.productName}". Insufficient stock.`
              );
              err.statusCode = 409;
              throw err;
            }

            movementsToCreate.push({
              itemId: invItem._id,
              productName: invItem.productName,
              productCode: invItem.code,
              type: 'Sale',
              quantityChange: -delta,
              balanceAfter: updatedInv.currentQuantity,
              unitCost: invItem.unitCost,
              totalCost: invItem.unitCost * delta,
              reason: `Quantity increased on Bill #${bill.billNumber}`,
              performedBy: cashier || 'POS Terminal',
              timestamp: new Date().toISOString()
            });
          } else {
            // delta < 0: Restore stock
            const restoreQty = Math.abs(delta);
            const updatedInv = await InventoryItem.findByIdAndUpdate(
              invItem._id,
              { $inc: { currentQuantity: restoreQty } },
              { returnDocument: 'after', ...sessionOpt }
            );

            movementsToCreate.push({
              itemId: invItem._id,
              productName: invItem.productName,
              productCode: invItem.code,
              type: 'Adjustment',
              quantityChange: restoreQty,
              balanceAfter: updatedInv.currentQuantity,
              unitCost: invItem.unitCost,
              totalCost: invItem.unitCost * restoreQty,
              reason: `Item removed/quantity decreased on Bill #${bill.billNumber}`,
              performedBy: cashier || 'POS Terminal',
              timestamp: new Date().toISOString()
            });
          }
        }
      }

      if (movementsToCreate.length > 0) {
        await StockMovement.insertMany(movementsToCreate, sessionOpt);
      }

      // Update bill items
      bill.items = updatedItems.map((line) => ({
        name: line.name,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        total: line.quantity * line.unitPrice,
        code: line.code ? String(line.code).trim().toUpperCase() : '',
        duration: line.duration || '',
        startTime: line.startTime || '',
        endTime: line.endTime || '',
        isCustomPrice: Boolean(line.isCustomPrice),
        customPrice:
          line.customPrice !== undefined && line.customPrice !== null
            ? Number(line.customPrice)
            : line.isCustomPrice
            ? line.unitPrice
            : undefined,
        addedAt: line.addedAt || new Date().toISOString()
      }));

      if (customerName !== undefined) {
        bill.customerName = String(customerName).trim();
      }

      bill.subtotal = bill.items.reduce((acc, it) => acc + it.unitPrice * it.quantity, 0);
      if (discount !== undefined) bill.discount = Math.max(0, Number(discount) || 0);
      if (serviceCharge !== undefined) bill.serviceCharge = Math.max(0, Number(serviceCharge) || 0);
      bill.total = Math.max(0, bill.subtotal - bill.discount) + bill.serviceCharge;

      await bill.save(sessionOpt);
      return bill;
    });

    res.status(200).json(updatedBill);
  } catch (error) {
    console.error('Update bill items error:', error.message);
    const status = error.statusCode || 500;
    res.status(status).json({ message: error.message || 'Could not update bill items' });
  }
});

// Pay & Close an Open Bill
app.post('/api/bills/:id/pay', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid bill ID' });
    }

    const {
      paymentMethod,
      discount,
      serviceCharge,
      cashier,
      orderType,
      amountTendered,
      changeDue,
      splitCashAmount,
      splitCardAmount
    } = req.body;

    const paidBill = await executeInTransaction(async (sessionOpt) => {
      const bill = await Bill.findById(req.params.id, null, sessionOpt);
      if (!bill) {
        const err = new Error('Bill not found');
        err.statusCode = 404;
        throw err;
      }

      if (bill.status === 'Settled') {
        const err = new Error(`Bill #${bill.billNumber} is already settled`);
        err.statusCode = 400;
        throw err;
      }

      if (bill.status !== 'Open') {
        const err = new Error(`Cannot pay a bill that is ${bill.status}`);
        err.statusCode = 400;
        throw err;
      }

      if (!bill.items || bill.items.length === 0) {
        const err = new Error('Cannot settle a bill with no items');
        err.statusCode = 400;
        throw err;
      }

      // Update payment information
      bill.paymentMethod = paymentMethod || bill.paymentMethod || 'Cash';
      if (splitCashAmount !== undefined) bill.splitCashAmount = Number(splitCashAmount) || 0;
      if (splitCardAmount !== undefined) bill.splitCardAmount = Number(splitCardAmount) || 0;
      if (cashier) bill.cashier = cashier;
      if (orderType) bill.orderType = orderType;

      // Authoritative recalculation of totals
      bill.subtotal = bill.items.reduce((acc, it) => acc + it.unitPrice * it.quantity, 0);
      if (discount !== undefined) {
        bill.discount = Math.max(0, Number(discount) || 0);
      }
      if (serviceCharge !== undefined) {
        bill.serviceCharge = Math.max(0, Number(serviceCharge) || 0);
      }
      bill.total = Math.max(0, bill.subtotal - bill.discount) + bill.serviceCharge;

      const slDate = getSriLankaDateTime();
      let billPaymentStatus = 'Paid';
      let billTotalPaid = bill.total;
      let billBalanceDue = 0;

      if (
        paymentMethod === 'Customer Credit' ||
        req.body.isCredit === true ||
        req.body.paymentStatus === 'Unpaid' ||
        req.body.paymentStatus === 'Partially Paid'
      ) {
        const reqPaid = Number(req.body.paidAmount) || 0;
        billTotalPaid = Math.min(bill.total, Math.max(0, reqPaid));
        billBalanceDue = Math.max(0, bill.total - billTotalPaid);
        billPaymentStatus = billBalanceDue === 0 ? 'Paid' : (billTotalPaid > 0 ? 'Partially Paid' : 'Unpaid');
      }

      bill.status = 'Settled';
      if (amountTendered !== undefined) bill.amountTendered = Number(amountTendered) || 0;
      if (changeDue !== undefined) bill.changeDue = Number(changeDue) || 0;
      bill.paymentStatus = billPaymentStatus;
      bill.totalPaid = billTotalPaid;
      bill.balanceDue = billBalanceDue;
      bill.closedAt = new Date().toISOString();

      await bill.save(sessionOpt);

      if (billTotalPaid > 0) {
        const payMethod = paymentMethod === 'Customer Credit' ? (req.body.initialPaymentMethod || 'Cash') : (paymentMethod || 'Cash');
        await Payment.create(
          [
            {
              sourceType: 'Bill',
              sourceId: bill._id,
              sourceReference: bill.billNumber,
              customerName: bill.customerName || 'Walk-in Guest',
              customerContact: req.body.customerContact || '',
              amount: billTotalPaid,
              paymentMethod: payMethod,
              paymentDate: slDate.dateStr,
              paymentTime: slDate.timeStr,
              paymentTimestamp: slDate.timestamp,
              cashier: cashier || bill.cashier || 'Kasun P.',
              notes: req.body.notes || 'Open bill settlement payment'
            }
          ],
          sessionOpt
        );
      }

      // If bill was linked to a Rental, finalize rental return if active and sync payment status
      if (bill.rentalId) {
        const rental = await Rental.findById(bill.rentalId, null, sessionOpt);
        if (rental) {
          if (rental.status === 'Active') {
            const slNow = getSriLankaDateTime();
            const now = Date.now();
            const startMs = Number(rental.startTimestamp) || now;
            const elapsedMinutes = Math.max(1, Math.round((now - startMs) / (60 * 1000)));
            const hrs = Math.floor(elapsedMinutes / 60);
            const mins = elapsedMinutes % 60;
            const durationDisplay = hrs > 0 ? `${hrs} hr ${mins > 0 ? mins + ' min' : ''}`.trim() : `${mins} mins`;

            rental.status = 'Completed';
            rental.returnDate = slNow.dateStr;
            rental.returnTime = slNow.timeStr;
            rental.returnTimestamp = slNow.timestamp;
            rental.durationMinutes = elapsedMinutes;
            rental.durationDisplay = durationDisplay;
            rental.returnedAt = slNow.isoStr;

            // Release board back to Available fleet
            await Surfboard.findByIdAndUpdate(
              rental.boardId,
              {
                status: 'Available',
                currentRentalId: '',
                currentCustomer: '',
                rentalStartTime: '',
                lastReturnedTime: `${rental.returnDate} ${rental.returnTime}`
              },
              sessionOpt
            );

            // Update rental line item on bill with exact calculated time
            const rentalItem = bill.items.find((it) => it.code === 'RENTAL');
            if (rentalItem) {
              const customSuffix = rentalItem.isCustomPrice ? ' [Custom Rate]' : '';
              rentalItem.name = `Surfboard Rental - ${rental.boardName} (${durationDisplay} | ${rental.startTime} - ${slNow.timeStr})${customSuffix}`;
              rentalItem.duration = durationDisplay;
              rentalItem.startTime = rental.startTime;
              rentalItem.endTime = slNow.timeStr;
              rental.totalFee = rentalItem.total;
              await bill.save(sessionOpt);
            }
          }

          rental.paymentStatus = billPaymentStatus;
          rental.totalPaid = billTotalPaid;
          rental.balanceDue = billBalanceDue;
          rental.paymentMethod = bill.paymentMethod;
          await rental.save(sessionOpt);
        }
      
      } else if (bill.customerName && bill.items.some((it) => it.code === 'RENTAL')) {
        await Rental.updateMany(
          { customerName: bill.customerName, status: { $in: ['Active', 'Completed'] } },
          {
            paymentStatus: billPaymentStatus,
            totalPaid: billTotalPaid,
            balanceDue: billBalanceDue,
            paymentMethod: bill.paymentMethod
          },
          sessionOpt
        );
      }

      // If bill was linked to a Lesson, sync Lesson payment status
      if (bill.lessonId) {
        await Lesson.findByIdAndUpdate(
          bill.lessonId,
          {
            paymentStatus: billPaymentStatus,
            totalPaid: billTotalPaid,
            balanceDue: billBalanceDue,
            paymentMethod: bill.paymentMethod
          },
          sessionOpt
        );
      } else if (bill.customerName && bill.items.some((it) => it.code === 'LESSON')) {
        await Lesson.updateMany(
          { customerName: bill.customerName, status: { $in: ['In Progress', 'Completed'] } },
          {
            paymentStatus: billPaymentStatus,
            totalPaid: billTotalPaid,
            balanceDue: billBalanceDue,
            paymentMethod: bill.paymentMethod
          },
          sessionOpt
        );
      }

      return bill;
    });

    res.status(200).json(paidBill);
  } catch (error) {
    console.error('Pay bill error:', error.message);
    const status = error.statusCode || 500;
    res.status(status).json({ message: error.message || 'Could not pay bill' });
  }
});

// Record payment for an outstanding credit bill
app.post('/api/bills/:id/payment', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid bill ID' });
    }

    const { amount, paymentMethod, cashier, notes, idempotencyKey } = req.body;
    const paymentAmount = Number(amount);
    if (!paymentAmount || paymentAmount <= 0) {
      return res.status(400).json({ message: 'Payment amount must be greater than zero' });
    }

    const result = await executeInTransaction(async (sessionOpt) => {
      const bill = await Bill.findById(req.params.id, null, sessionOpt);
      if (!bill) {
        const err = new Error('Bill not found');
        err.statusCode = 404;
        throw err;
      }

      if (bill.status !== 'Settled') {
        const err = new Error('Can only record payments on settled bills');
        err.statusCode = 400;
        throw err;
      }

      const currentPaid = bill.totalPaid !== undefined ? bill.totalPaid : (bill.paymentStatus === 'Paid' ? bill.total : 0);
      const currentBalance = Math.max(0, bill.total - currentPaid);

      if (currentBalance <= 0) {
        const err = new Error(`Bill #${bill.billNumber} is already fully paid`);
        err.statusCode = 400;
        throw err;
      }

      if (paymentAmount > currentBalance) {
        const err = new Error(`Payment amount (Rs. ${paymentAmount}) exceeds outstanding balance (Rs. ${currentBalance})`);
        err.statusCode = 400;
        throw err;
      }

      // Idempotency check
      if (idempotencyKey) {
        const existingPay = await Payment.findOne({ idempotencyKey }, null, sessionOpt);
        if (existingPay) {
          return { bill, payment: existingPay, alreadyProcessed: true };
        }
      }

      const slDate = getSriLankaDateTime();
      const newTotalPaid = currentPaid + paymentAmount;
      const newBalanceDue = Math.max(0, bill.total - newTotalPaid);

      bill.totalPaid = newTotalPaid;
      bill.balanceDue = newBalanceDue;
      bill.paymentStatus = newBalanceDue === 0 ? 'Paid' : 'Partially Paid';

      await bill.save(sessionOpt);

      const [paymentDoc] = await Payment.create(
        [
          {
            sourceType: 'Bill',
            sourceId: bill._id,
            sourceReference: bill.billNumber,
            customerName: bill.customerName || 'Walk-in Guest',
            customerContact: req.body.customerContact || '',
            amount: paymentAmount,
            paymentMethod: paymentMethod || 'Cash',
            paymentDate: slDate.dateStr,
            paymentTime: slDate.timeStr,
            paymentTimestamp: slDate.timestamp,
            cashier: cashier || 'Staff',
            notes: notes || 'Customer credit settlement payment',
            ...(idempotencyKey ? { idempotencyKey } : {})
          }
        ],
        sessionOpt
      );

      return { bill, payment: paymentDoc };
    });

    res.status(200).json(result);
  } catch (error) {
    console.error('Bill payment error:', error.message);
    res.status(error.statusCode || 500).json({ message: error.message || 'Could not record bill payment' });
  }
});

// Update bill status (Refund / Cancel) with atomic stock restoration
app.patch('/api/bills/:id/status', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid bill ID' });
    }

    const { status, refundReason } = req.body;
    if (!['Settled', 'Refunded', 'Cancelled'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const updatedBill = await executeInTransaction(async (sessionOpt) => {
      const bill = await Bill.findById(req.params.id, null, sessionOpt);
      if (!bill) {
        const err = new Error('Bill not found');
        err.statusCode = 404;
        throw err;
      }

      // If bill is already in the target status, reject duplicate request
      if (bill.status === status) {
        const err = new Error(`Bill #${bill.billNumber} is already ${status}`);
        err.statusCode = 400;
        throw err;
      }

      // Allowed transitions:
      // - Settled -> Refunded or Cancelled
      // - Open -> Cancelled
      const isAllowedTransition =
        (bill.status === 'Settled' && (status === 'Refunded' || status === 'Cancelled')) ||
        (bill.status === 'Open' && status === 'Cancelled');

      if (!isAllowedTransition) {
        const err = new Error(`Cannot change status of a bill that is already ${bill.status}`);
        err.statusCode = 400;
        throw err;
      }

      // Restore stock for tracked items exactly once
      const movementsToCreate = [];
      for (const line of bill.items) {
        if (line.code && line.quantity > 0) {
          const invItem = await InventoryItem.findOne(
            { $or: [{ code: line.code }, { legacyCodes: line.code }] },
            null,
            sessionOpt
          );
          if (invItem) {
            const updatedInv = await InventoryItem.findByIdAndUpdate(
              invItem._id,
              { $inc: { currentQuantity: line.quantity } },
              { returnDocument: 'after', ...sessionOpt }
            );

            movementsToCreate.push({
              itemId: invItem._id,
              productName: invItem.productName,
              productCode: invItem.code,
              type: 'Adjustment',
              quantityChange: line.quantity,
              balanceAfter: updatedInv.currentQuantity,
              unitCost: invItem.unitCost,
              totalCost: invItem.unitCost * line.quantity,
              reason: `${status} for ${bill.status === 'Open' ? 'Open ' : ''}Bill #${bill.billNumber}${refundReason ? ': ' + refundReason : ''}`,
              performedBy: req.body.performedBy || 'Cashier',
              timestamp: new Date().toISOString()
            });
          }
        }
      }

      if (movementsToCreate.length > 0) {
        await StockMovement.insertMany(movementsToCreate, sessionOpt);
      }

      bill.status = status;
      bill.refundReason = refundReason || '';
      bill.refundedAt = status === 'Refunded' ? new Date().toISOString() : '';

      await bill.save(sessionOpt);
      return bill;
    });

    res.json(updatedBill);
  } catch (error) {
    console.error('Bill status update error:', error.message);
    let status = error.statusCode;
    let message = error.message;
    if (!status) {
      if (
        error.code === 112 ||
        (error.errorLabels && error.errorLabels.includes('TransientTransactionError')) ||
        (typeof error.hasErrorLabel === 'function' && error.hasErrorLabel('TransientTransactionError'))
      ) {
        status = 409;
        message = 'Concurrent update conflict. Please retry the status update.';
      } else {
        status = 500;
      }
    }
    res.status(status).json({ message: message || 'Could not update bill status' });
  }
});

// ============================================================
// SURFBOARDS FLEET API
// ============================================================
// Get all surfboards
app.get('/api/surfboards', async (req, res) => {
  try {
    const boards = await Surfboard.find().sort({ createdAt: 1 });
    res.json(boards);
  } catch (error) {
    console.error('Surfboards query error:', error.message);
    res.status(500).json({ message: 'Could not retrieve surfboards' });
  }
});

// Add a new surfboard to fleet
app.post('/api/surfboards', async (req, res) => {
  try {
    const { name, category, length, finSetup, condition, acquiredDate, damageNotes } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Board name is required' });
    }

    const validCategories = [
      'Soft-top Foamies',
      'Epoxy Funboards',
      'Performance Shortboards',
      'Classic Longboards'
    ];
    if (!validCategories.includes(category)) {
      return res.status(400).json({ message: 'Valid board category is required' });
    }

    const board = await Surfboard.create({
      name: name.trim(),
      category,
      length: length || '8\'0"',
      finSetup: finSetup || 'Thruster (3-fin)',
      condition: condition || 'Excellent',
      status: 'Available',
      acquiredDate: acquiredDate || new Date().toISOString().split('T')[0],
      damageNotes: damageNotes || ''
    });

    res.status(201).json(board);
  } catch (error) {
    console.error('Surfboard create error:', error.message);
    res.status(500).json({ message: 'Could not add surfboard' });
  }
});

// Update a surfboard
app.put('/api/surfboards/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid surfboard ID' });
    }

    const board = await Surfboard.findByIdAndUpdate(req.params.id, req.body, {
      returnDocument: 'after',
      runValidators: true
    });

    if (!board) {
      return res.status(404).json({ message: 'Surfboard not found' });
    }

    res.json(board);
  } catch (error) {
    console.error('Surfboard update error:', error.message);
    res.status(500).json({ message: 'Could not update surfboard' });
  }
});

// Delete a surfboard
app.delete('/api/surfboards/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid surfboard ID' });
    }

    const board = await Surfboard.findByIdAndDelete(req.params.id);
    if (!board) {
      return res.status(404).json({ message: 'Surfboard not found' });
    }

    res.json({ message: 'Board deleted successfully' });
  } catch (error) {
    console.error('Surfboard delete error:', error.message);
    res.status(500).json({ message: 'Could not delete surfboard' });
  }
});

// ============================================================
// SURFBOARD RENTALS API
// ============================================================
// Get all rentals (active and completed) with optional date & status filters
app.get('/api/rentals', async (req, res) => {
  try {
    const { startDate, endDate, status } = req.query;
    const dateErr = validateDateRange(startDate, endDate);
    if (dateErr) {
      return res.status(400).json({ message: dateErr });
    }

    const filter = {};

    if (status === 'Completed') {
      filter.status = 'Completed';
      if (startDate || endDate) {
        filter.returnDate = {};
        if (startDate) filter.returnDate.$gte = startDate;
        if (endDate) filter.returnDate.$lte = endDate;
      }
    } else if (status === 'Active') {
      filter.status = 'Active';
      if (endDate) {
        filter.startDate = { $lte: endDate };
      }
    } else if (startDate || endDate) {
      // Both active and completed matching the window:
      // Completed: returnDate falls within [startDate, endDate]
      // Active: started on or before endDate
      filter.$or = [
        {
          status: 'Completed',
          returnDate: {
            ...(startDate ? { $gte: startDate } : {}),
            ...(endDate ? { $lte: endDate } : {})
          }
        },
        {
          status: 'Active',
          ...(endDate ? { startDate: { $lte: endDate } } : {})
        }
      ];
    }

    const rentals = await Rental.find(filter).sort({ createdAt: -1 });
    res.json(rentals);
  } catch (error) {
    console.error('Rentals query error:', error.message);
    res.status(500).json({ message: 'Could not retrieve rentals' });
  }
});

// Start a rental & automatically create Open Tab in Open Bills
app.post('/api/rentals/start', async (req, res) => {
  try {
    const {
      boardId,
      boardName,
      boardCategory,
      customerName,
      customerContact,
      customerPassportOrId,
      startDate,
      startTime,
      startTimestamp,
      hourlyRate,
      agreedHourlyRate,
      notes,
      cashier
    } = req.body;

    if (!boardId || !customerName) {
      return res.status(400).json({ message: 'Board and Customer Name are required' });
    }

    const trimmedCustomer = customerName.trim();
    const finalStartDate = startDate || new Date().toISOString().split('T')[0];
    const finalStartTime =
      startTime ||
      new Date().toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    const finalStartTimestamp = Number(startTimestamp) || Date.now();
    const finalHourlyRate = Number(hourlyRate) || 1000;
    const finalAgreedRate = Number(agreedHourlyRate) || 1000;

    // Generate sequential bill number
    const year = new Date().getFullYear();
    const count = await Bill.countDocuments();
    let finalBillNumber = `BILL-${year}-${String(count + 1).padStart(4, '0')}`;
    let attempts = 0;
    while (attempts < 20) {
      const existing = await Bill.findOne({ billNumber: finalBillNumber }, { _id: 1 });
      if (!existing) break;
      attempts++;
      finalBillNumber = `BILL-${year}-${String(count + 1 + attempts).padStart(4, '0')}`;
    }

    const newRentalId = new mongoose.Types.ObjectId();

    // Automatically create Open Bill in Open Bills so cafe food/drinks can be billed together
    const openBill = await Bill.create({
      billNumber: finalBillNumber,
      customerName: trimmedCustomer,
      date: finalStartDate,
      time: finalStartTime,
      orderType: 'Dine-in',
      saleType: 'Surfboard Rental',
      paymentMethod: 'Cash',
      items: [
        {
          name: `Surfboard Rental - ${boardName} (Started: ${finalStartTime})`,
          quantity: 1,
          unitPrice: finalAgreedRate,
          total: finalAgreedRate,
          code: 'RENTAL',
          duration: '1 hr (Initial)',
          startTime: finalStartTime,
          addedAt: new Date().toISOString()
        }
      ],
      subtotal: finalAgreedRate,
      discount: 0,
      serviceCharge: 0,
      total: finalAgreedRate,
      status: 'Open',
      paymentStatus: 'Unpaid',
      totalPaid: 0,
      balanceDue: finalAgreedRate,
      cashier: cashier || 'Kasun P.',
      rentalId: newRentalId,
      notes: `Rental: ${boardName} (Started: ${finalStartTime})${customerContact ? ' | Tel: ' + customerContact : ''}`
    });

    const rental = await Rental.create({
      _id: newRentalId,
      boardId,
      boardName,
      boardCategory: boardCategory || 'Soft-top Foamies',
      customerName: trimmedCustomer,
      customerContact: customerContact || '',
      customerPassportOrId: customerPassportOrId || '',
      startDate: finalStartDate,
      startTime: finalStartTime,
      startTimestamp: finalStartTimestamp,
      hourlyRate: finalHourlyRate,
      agreedHourlyRate: finalAgreedRate,
      notes: notes || '',
      status: 'Active',
      billId: openBill._id,
      billNumber: openBill.billNumber
    });

    // Update board status to 'Rented'
    await Surfboard.findByIdAndUpdate(boardId, {
      status: 'Rented',
      currentRentalId: rental._id.toString(),
      currentCustomer: trimmedCustomer,
      rentalStartTime: rental.startTime
    });

    res.status(201).json(rental);
  } catch (error) {
    console.error('Start rental error:', error.message);
    res.status(500).json({ message: 'Could not start rental: ' + error.message });
  }
});

// Return / Complete a rental (separates physical return from payment lifecycle)
app.post('/api/rentals/return/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid rental ID' });
    }

    const {
      receiptNumber: customReceipt,
      returnDate,
      returnTime,
      returnTimestamp,
      durationMinutes,
      durationDisplay,
      actualRentalCharge,
      calculatedReferenceCharge,
      discountAmount,
      roundingPolicyUsed,
      damageFee,
      totalCharged,
      conditionOnReturn,
      paymentMethod,
      paymentStatus: requestedPaymentStatus,
      paidAmount,
      cashier,
      notes
    } = req.body;

    const rentalResult = await executeInTransaction(async (sessionOpt) => {
      const rental = await Rental.findById(req.params.id, null, sessionOpt);
      if (!rental) {
        const err = new Error('Rental not found');
        err.statusCode = 404;
        throw err;
      }

      if (rental.status === 'Completed') {
        const err = new Error(`Rental ${rental.receiptNumber || rental._id} is already returned/completed`);
        err.statusCode = 400;
        throw err;
      }

      if (rental.status === 'Cancelled') {
        const err = new Error('Cannot return a cancelled rental');
        err.statusCode = 400;
        throw err;
      }

      // Generate receipt number if not provided
      let finalReceipt = customReceipt;
      if (!finalReceipt || finalReceipt.includes('TEMP')) {
        const year = new Date().getFullYear();
        const count = await Rental.countDocuments({ status: 'Completed' }, sessionOpt);
        finalReceipt = `SRR-${year}-${String(count + 1).padStart(3, '0')}`;
      }

      const slNow = getSriLankaDateTime();
      const finalCharged = Math.max(0, Number(totalCharged) || 0);

      let finalPaymentStatus = 'Paid';
      let totalPaid = finalCharged;
      let balanceDue = 0;

      if (requestedPaymentStatus === 'Unpaid') {
        finalPaymentStatus = 'Unpaid';
        totalPaid = 0;
        balanceDue = finalCharged;
      } else if (requestedPaymentStatus === 'Partially Paid') {
        const pAmt = Number(paidAmount) || 0;
        totalPaid = Math.min(finalCharged, Math.max(0, pAmt));
        balanceDue = Math.max(0, finalCharged - totalPaid);
        finalPaymentStatus = balanceDue === 0 ? 'Paid' : (totalPaid > 0 ? 'Partially Paid' : 'Unpaid');
      } else {
        // Paid
        const pAmt = paidAmount !== undefined ? Number(paidAmount) : finalCharged;
        totalPaid = Math.min(finalCharged, Math.max(0, pAmt));
        balanceDue = Math.max(0, finalCharged - totalPaid);
        finalPaymentStatus = balanceDue === 0 ? 'Paid' : (totalPaid > 0 ? 'Partially Paid' : 'Unpaid');
      }

      rental.status = 'Completed';
      rental.receiptNumber = finalReceipt;
      rental.returnDate = returnDate || slNow.dateStr;
      rental.returnTime = returnTime || slNow.timeStr;
      rental.returnTimestamp = Number(returnTimestamp) || slNow.timestamp;
      rental.durationMinutes = Number(durationMinutes) || 0;
      rental.durationDisplay = durationDisplay || '';
      rental.actualRentalCharge = Number(actualRentalCharge) || 0;
      rental.calculatedReferenceCharge = Number(calculatedReferenceCharge) || 0;
      rental.discountAmount = Number(discountAmount) || 0;
      rental.roundingPolicyUsed = roundingPolicyUsed || 'prorated';
      rental.damageFee = Number(damageFee) || 0;
      rental.totalCharged = finalCharged;
      rental.conditionOnReturn = conditionOnReturn || 'Available';
      rental.paymentMethod = paymentMethod || 'Cash';
      rental.paymentStatus = finalPaymentStatus;
      rental.totalPaid = totalPaid;
      rental.balanceDue = balanceDue;
      rental.returnedAt = slNow.isoStr;
      rental.paymentRecordedAt = totalPaid > 0 ? slNow.isoStr : '';
      rental.notes = notes || '';

      await rental.save(sessionOpt);

      // Safe release board back to fleet
      const newBoardStatus =
        conditionOnReturn === 'Damaged'
          ? 'Damaged'
          : conditionOnReturn === 'Under Repair'
            ? 'Under Repair'
            : 'Available';

      await Surfboard.findByIdAndUpdate(
        rental.boardId,
        {
          status: newBoardStatus,
          currentRentalId: '',
          currentCustomer: '',
          rentalStartTime: '',
          lastReturnedTime: `${rental.returnDate} ${rental.returnTime}`,
          damageNotes: conditionOnReturn !== 'Available' ? notes || 'Damaged during rental' : ''
        },
        sessionOpt
      );

      // If money collected upon return, record in Payment collection
      if (totalPaid > 0) {
        await Payment.create(
          [
            {
              sourceType: 'Rental',
              sourceId: rental._id,
              sourceReference: finalReceipt,
              customerName: rental.customerName,
              customerContact: rental.customerContact || '',
              amount: totalPaid,
              paymentMethod: paymentMethod || 'Cash',
              paymentDate: slNow.dateStr,
              paymentTime: slNow.timeStr,
              paymentTimestamp: slNow.timestamp,
              cashier: cashier || 'Staff',
              notes: notes || 'Rental return payment'
            }
          ],
          sessionOpt
        );
      }

      // Update or sync the linked Open Bill in Open Bills
      try {
        let linkedBill = null;
        if (rental.billId) {
          linkedBill = await Bill.findById(rental.billId, null, sessionOpt);
        }
        if (!linkedBill) {
          linkedBill = await Bill.findOne({ rentalId: rental._id }, null, sessionOpt);
        }
        if (!linkedBill) {
          linkedBill = await Bill.findOne(
            {
              status: 'Open',
              customerName: rental.customerName,
              'items.code': 'RENTAL'
            },
            null,
            sessionOpt
          );
        }

        const timeRange = (rental.startTime && rental.returnTime) ? ` | ${rental.startTime} - ${rental.returnTime}` : (rental.startTime ? ` | Start: ${rental.startTime}` : '');
        const rentalItemName = `Surfboard Rental - ${rental.boardName} (${rental.durationDisplay || 'Rental'}${timeRange})`;
        const rentalItemPrice = rental.actualRentalCharge || finalCharged;

        if (linkedBill) {
          // Update existing bill (preserving any cafe food/drinks already added!)
          const existingRentalIdx = linkedBill.items.findIndex((it) => it.code === 'RENTAL');
          if (existingRentalIdx >= 0) {
            linkedBill.items[existingRentalIdx].name = rentalItemName;
            linkedBill.items[existingRentalIdx].unitPrice = rentalItemPrice;
            linkedBill.items[existingRentalIdx].total = rentalItemPrice;
            linkedBill.items[existingRentalIdx].duration = rental.durationDisplay || '';
            linkedBill.items[existingRentalIdx].startTime = rental.startTime || '';
            linkedBill.items[existingRentalIdx].endTime = rental.returnTime || '';
          } else {
            linkedBill.items.unshift({
              name: rentalItemName,
              quantity: 1,
              unitPrice: rentalItemPrice,
              total: rentalItemPrice,
              code: 'RENTAL',
              duration: rental.durationDisplay || '',
              startTime: rental.startTime || '',
              endTime: rental.returnTime || '',
              addedAt: new Date().toISOString()
            });
          }

          // Damage fee
          const existingDamageIdx = linkedBill.items.findIndex((it) => it.code === 'DAMAGE-FEE');
          if (rental.damageFee > 0) {
            if (existingDamageIdx >= 0) {
              linkedBill.items[existingDamageIdx].unitPrice = rental.damageFee;
              linkedBill.items[existingDamageIdx].total = rental.damageFee;
            } else {
              linkedBill.items.push({
                name: `Damage Fee - ${rental.boardName}`,
                quantity: 1,
                unitPrice: rental.damageFee,
                total: rental.damageFee,
                code: 'DAMAGE-FEE',
                addedAt: new Date().toISOString()
              });
            }
          } else if (existingDamageIdx >= 0) {
            linkedBill.items.splice(existingDamageIdx, 1);
          }

          // Recalculate bill subtotal & total
          linkedBill.subtotal = linkedBill.items.reduce((s, it) => s + it.total, 0);
          linkedBill.total = Math.max(0, linkedBill.subtotal - (linkedBill.discount || 0)) + (linkedBill.serviceCharge || 0);

          if (finalPaymentStatus === 'Paid') {
            linkedBill.status = 'Settled';
            linkedBill.paymentStatus = 'Paid';
            linkedBill.paymentMethod = paymentMethod || linkedBill.paymentMethod || 'Cash';
            linkedBill.totalPaid = linkedBill.total;
            linkedBill.balanceDue = 0;
            linkedBill.closedAt = slNow.isoStr;
          } else {
            linkedBill.status = 'Open';
            linkedBill.paymentStatus = 'Unpaid';
            linkedBill.balanceDue = linkedBill.total;
          }
          await linkedBill.save(sessionOpt);
          rental.billId = linkedBill._id;
          rental.billNumber = linkedBill.billNumber;
          await rental.save(sessionOpt);
        } else {
          // If no existing bill was found (e.g. legacy rental), create one
          const year = new Date().getFullYear();
          const billNumber = `BILL-RNT-${year}-${String(rental._id).slice(-4).toUpperCase()}`;
          const billItems = [
            {
              name: rentalItemName,
              quantity: 1,
              unitPrice: rentalItemPrice,
              total: rentalItemPrice,
              code: 'RENTAL',
              duration: rental.durationDisplay || '',
              startTime: rental.startTime || '',
              endTime: rental.returnTime || ''
            }
          ];
          if (rental.damageFee > 0) {
            billItems.push({
              name: `Damage Fee - ${rental.boardName}`,
              quantity: 1,
              unitPrice: rental.damageFee,
              total: rental.damageFee,
              code: 'DAMAGE-FEE'
            });
          }
          const createdBill = await Bill.create(
            [
              {
                billNumber,
                customerName: rental.customerName,
                date: rental.returnDate,
                time: rental.returnTime,
                orderType: 'Dine-in',
                saleType: 'Surfboard Rental',
                paymentMethod: paymentMethod || 'Cash',
                items: billItems,
                subtotal: finalCharged,
                discount: rental.discountAmount || 0,
                serviceCharge: 0,
                total: finalCharged,
                status: finalPaymentStatus === 'Paid' ? 'Settled' : 'Open',
                paymentStatus: finalPaymentStatus,
                totalPaid: finalPaymentStatus === 'Paid' ? finalCharged : 0,
                balanceDue: finalPaymentStatus === 'Paid' ? 0 : finalCharged,
                cashier: cashier || 'Staff',
                rentalId: rental._id,
                notes: `Rental Ref: ${finalReceipt}. Board: ${rental.boardName}. Returned: ${rental.returnDate} ${rental.returnTime}`
              }
            ],
            sessionOpt
          );
          rental.billId = createdBill[0]._id;
          rental.billNumber = createdBill[0].billNumber;
          await rental.save(sessionOpt);
        }
      } catch (billSyncErr) {
        console.warn('Bill sync for rental notice:', billSyncErr.message);
      }

      return rental;
    });

    res.json(rentalResult);
  } catch (error) {
    console.error('Return rental error:', error.message);
    res.status(error.statusCode || 500).json({ message: error.message || 'Could not complete rental' });
  }
});

// Record subsequent payment on a returned rental
app.post('/api/rentals/:id/payment', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid rental ID' });
    }

    const { amount, paymentMethod, cashier, notes, idempotencyKey } = req.body;
    const paymentAmount = Number(amount);
    if (!paymentAmount || paymentAmount <= 0) {
      return res.status(400).json({ message: 'Payment amount must be greater than zero' });
    }

    const result = await executeInTransaction(async (sessionOpt) => {
      const rental = await Rental.findById(req.params.id, null, sessionOpt);
      if (!rental) {
        const err = new Error('Rental not found');
        err.statusCode = 404;
        throw err;
      }

      if (rental.status !== 'Completed') {
        const err = new Error('Can only record payment for completed/returned rentals');
        err.statusCode = 400;
        throw err;
      }

      const currentTotal = rental.totalCharged || 0;
      const currentPaid = rental.totalPaid !== undefined ? rental.totalPaid : (rental.paymentStatus === 'Paid' ? currentTotal : 0);
      const currentBalance = Math.max(0, currentTotal - currentPaid);

      if (currentBalance <= 0) {
        const err = new Error(`Rental ${rental.receiptNumber} is already fully paid`);
        err.statusCode = 400;
        throw err;
      }

      if (paymentAmount > currentBalance) {
        const err = new Error(`Payment amount (Rs. ${paymentAmount}) exceeds outstanding balance (Rs. ${currentBalance})`);
        err.statusCode = 400;
        throw err;
      }

      // Idempotency check
      if (idempotencyKey) {
        const existingPay = await Payment.findOne({ idempotencyKey }, null, sessionOpt);
        if (existingPay) {
          return { rental, payment: existingPay, alreadyProcessed: true };
        }
      }

      const slNow = getSriLankaDateTime();
      const newTotalPaid = currentPaid + paymentAmount;
      const newBalanceDue = Math.max(0, currentTotal - newTotalPaid);

      rental.totalPaid = newTotalPaid;
      rental.balanceDue = newBalanceDue;
      rental.paymentStatus = newBalanceDue === 0 ? 'Paid' : 'Partially Paid';
      rental.paymentRecordedAt = slNow.isoStr;

      await rental.save(sessionOpt);

      const [paymentDoc] = await Payment.create(
        [
          {
            sourceType: 'Rental',
            sourceId: rental._id,
            sourceReference: rental.receiptNumber,
            customerName: rental.customerName,
            customerContact: rental.customerContact || '',
            amount: paymentAmount,
            paymentMethod: paymentMethod || 'Cash',
            paymentDate: slNow.dateStr,
            paymentTime: slNow.timeStr,
            paymentTimestamp: slNow.timestamp,
            cashier: cashier || 'Staff',
            notes: notes || 'Rental deferred payment',
            ...(idempotencyKey ? { idempotencyKey } : {})
          }
        ],
        sessionOpt
      );

      return { rental, payment: paymentDoc };
    });

    res.status(200).json(result);
  } catch (error) {
    console.error('Rental payment error:', error.message);
    res.status(error.statusCode || 500).json({ message: error.message || 'Could not record rental payment' });
  }
});

// ============================================================
// INVENTORY API
// ============================================================
// Get inventory items with optional status filter
app.get('/api/inventory', async (req, res) => {
  try {
    const { status, includeArchived } = req.query;
    const filter = {};

    if (status === 'active') {
      filter.isActive = { $ne: false };
      filter.isArchived = { $ne: true };
    } else if (status === 'archived') {
      filter.$or = [{ isArchived: true }, { isActive: false }];
    } else if (includeArchived !== 'true' && status !== 'all') {
      // Default to active items only unless all or archived explicitly requested
      filter.isArchived = { $ne: true };
      filter.isActive = { $ne: false };
    }

    const items = await InventoryItem.find(filter).sort({ productName: 1 });
    res.json(items);
  } catch (error) {
    console.error('Inventory query error:', error.message);
    res.status(500).json({ message: 'Could not retrieve inventory items' });
  }
});

// Add an inventory item
app.post('/api/inventory', async (req, res) => {
  try {
    const {
      productName,
      category,
      code,
      currentQuantity,
      reorderThreshold,
      unit,
      unitCost,
      sellingPrice,
      supplier
    } = req.body;

    if (!productName || !code) {
      return res.status(400).json({ message: 'Product name and code are required' });
    }

    const item = await InventoryItem.create({
      productName: productName.trim(),
      category: category || 'Other Services',
      code: code.trim().toUpperCase(),
      currentQuantity: Number(currentQuantity) || 0,
      reorderThreshold: Number(reorderThreshold) || 5,
      unit: unit || 'Units',
      unitCost: Number(unitCost) || 0,
      sellingPrice: Number(sellingPrice) || 0,
      supplier: supplier || '',
      lastRestockedAt: new Date().toISOString().split('T')[0],
      isActive: true,
      isArchived: false
    });

    invalidateMenuCache();
    res.status(201).json(item);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'This item code already exists in inventory' });
    }
    console.error('Inventory create error:', error.message);
    res.status(500).json({ message: 'Could not create inventory item' });
  }
});

// Update an inventory item
app.put('/api/inventory/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid inventory ID' });
    }

    const item = await InventoryItem.findByIdAndUpdate(req.params.id, req.body, {
      returnDocument: 'after',
      runValidators: true
    });

    if (!item) {
      return res.status(404).json({ message: 'Inventory item not found' });
    }

    invalidateMenuCache();
    res.json(item);
  } catch (error) {
    console.error('Inventory update error:', error.message);
    res.status(500).json({ message: 'Could not update inventory item' });
  }
});

// Update inventory active / archive status
app.patch('/api/inventory/:id/status', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid inventory ID' });
    }

    const { isActive, isArchived } = req.body;
    const updates = {};
    if (typeof isActive === 'boolean') {
      updates.isActive = isActive;
      if (isActive) updates.isArchived = false;
    }
    if (typeof isArchived === 'boolean') {
      updates.isArchived = isArchived;
      if (isArchived) updates.isActive = false;
    }

    const item = await InventoryItem.findByIdAndUpdate(req.params.id, updates, {
      returnDocument: 'after',
      runValidators: true
    });

    if (!item) {
      return res.status(404).json({ message: 'Inventory item not found' });
    }

    invalidateMenuCache();
    res.json(item);
  } catch (error) {
    console.error('Inventory status update error:', error.message);
    res.status(500).json({ message: 'Could not update inventory status' });
  }
});

// Safely delete an inventory item if no historical dependencies exist
app.delete('/api/inventory/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid inventory ID' });
    }

    const item = await InventoryItem.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ message: 'Inventory item not found' });
    }

    // Protect special King Coconut canonical product
    const isKingCoconut =
      item.code === 'F01' ||
      item.code === 'D03' ||
      (Array.isArray(item.legacyCodes) && (item.legacyCodes.includes('F01') || item.legacyCodes.includes('D03'))) ||
      /King Coconut/i.test(item.productName);

    if (isKingCoconut && (item.currentQuantity > 0 || (Array.isArray(item.legacyCodes) && item.legacyCodes.length > 0))) {
      return res.status(403).json({
        message:
          'Canonical King Coconut inventory item is reserved for unified Menu sales and Surf Lesson complimentary coconut issuance and cannot be deleted.'
      });
    }

    // Check for historical dependencies
    const codesToCheck = [item.code, ...(item.legacyCodes || [])];
    const [movementCount, billCount, menuItemCount] = await Promise.all([
      StockMovement.countDocuments({
        $or: [{ itemId: item._id }, { productCode: { $in: codesToCheck } }]
      }),
      Bill.countDocuments({ 'items.code': { $in: codesToCheck } }),
      MenuItem.countDocuments({
        $or: [{ code: { $in: codesToCheck } }, { inventoryItemId: item._id }]
      })
    ]);

    const dependencies = [];
    if (movementCount > 0) dependencies.push(`${movementCount} stock movement audit record(s)`);
    if (billCount > 0) dependencies.push(`${billCount} sales bill(s)`);
    if (menuItemCount > 0) dependencies.push(`${menuItemCount} menu item(s)`);

    if (dependencies.length > 0) {
      return res.status(409).json({
        message: `Cannot permanently delete "${item.productName}" (${item.code}) because it has historical dependencies: ${dependencies.join(', ')}. Please deactivate or archive this item instead to preserve historical records.`,
        hasDependencies: true,
        dependencies: {
          stockMovements: movementCount,
          bills: billCount,
          menuItems: menuItemCount
        }
      });
    }

    // Item has no dependencies: safe to hard-delete
    await InventoryItem.findByIdAndDelete(item._id);

    res.json({
      message: `Inventory item "${item.productName}" (${item.code}) was permanently deleted.`,
      deleted: true,
      id: item._id
    });
  } catch (error) {
    console.error('Inventory delete error:', error.message);
    res.status(500).json({ message: 'Could not delete inventory item: ' + error.message });
  }
});

// Get stock movements with bounded limit and optional date range filter
app.get('/api/inventory/movements', async (req, res) => {
  try {
    const { startDate, endDate, type, limit } = req.query;
    const dateErr = validateDateRange(startDate, endDate);
    if (dateErr) {
      return res.status(400).json({ message: dateErr });
    }

    const filter = {};
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(`${startDate}T00:00:00.000Z`);
      if (endDate) filter.createdAt.$lte = new Date(`${endDate}T23:59:59.999Z`);
    }
    if (type) {
      filter.type = type;
    }

    // Bounded limit: default to 500 when filtering by date, or 200 without date filter, max 1000
    const defaultLimit = startDate || endDate ? 500 : 200;
    const boundedLimit = Math.min(Math.max(Number(limit) || defaultLimit, 1), 1000);

    const movements = await StockMovement.find(filter).sort({ createdAt: -1 }).limit(boundedLimit);
    res.json(movements);
  } catch (error) {
    console.error('Stock movements query error:', error.message);
    res.status(500).json({ message: 'Could not retrieve stock movements' });
  }
});

// Record a stock movement (Purchase, Adjustment, Wastage)
app.post('/api/inventory/movements', async (req, res) => {
  try {
    const { itemId, type, quantityChange, unitCost, reason, performedBy, notes } = req.body;

    if (!itemId || !type || quantityChange === undefined) {
      return res.status(400).json({ message: 'Item, movement type, and quantity are required' });
    }

    const item = await InventoryItem.findById(itemId);
    if (!item) {
      return res.status(404).json({ message: 'Inventory item not found' });
    }

    const delta = Number(quantityChange);
    if (!Number.isFinite(delta)) {
      return res.status(400).json({ message: 'Quantity change must be a valid number' });
    }

    if (delta < 0 && Math.abs(delta) > item.currentQuantity) {
      return res.status(400).json({
        message: `Cannot decrease stock by ${Math.abs(delta)}. Current stock is only ${item.currentQuantity}.`
      });
    }

    const newQuantity = Math.max(0, item.currentQuantity + delta);

    item.currentQuantity = newQuantity;
    if (delta > 0) {
      item.lastRestockedAt = new Date().toISOString().split('T')[0];
    }
    await item.save();

    const movement = await StockMovement.create({
      itemId: item._id,
      productName: item.productName,
      productCode: item.code,
      type,
      quantityChange: delta,
      balanceAfter: newQuantity,
      unitCost: Number(unitCost) || item.unitCost,
      totalCost: (Number(unitCost) || item.unitCost) * Math.abs(delta),
      reason: reason || '',
      performedBy: performedBy || 'Store Manager',
      notes: notes || '',
      timestamp: new Date().toISOString()
    });

    res.status(201).json({ item, movement });
  } catch (error) {
    console.error('Stock movement error:', error.message);
    res.status(500).json({ message: 'Could not record stock movement: ' + error.message });
  }
});


/* ============================================================
   EXPENSES API
============================================================ */

// Get expenses with optional date/category filters
app.get('/api/expenses', async (req, res) => {
  try {
    const { startDate, endDate, category, status } = req.query;
    const dateErr = validateDateRange(startDate, endDate);
    if (dateErr) {
      return res.status(400).json({ message: dateErr });
    }

    const filter = {};

    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = startDate;
      if (endDate) filter.date.$lte = endDate;
    }

    if (category) filter.category = category;
    filter.status = status === 'Cancelled' ? 'Cancelled' : 'Recorded';

    const expenses = await Expense.find(filter).sort({
      date: -1,
      createdAt: -1
    });

    res.json(expenses);
  } catch (error) {
    console.error('Expenses query error:', error.message);
    res.status(500).json({ message: 'Could not retrieve expenses' });
  }
});

// Add a new expense
app.post('/api/expenses', async (req, res) => {
  try {
    const {
      description,
      category,
      amount,
      date,
      paymentMethod,
      notes,
      recordedBy
    } = req.body;

    const validCategories = [
      'Electricity',
      'Water',
      'Internet & Phone',
      'Rent',
      'Salaries & Wages',
      'Cleaning',
      'Repairs & Maintenance',
      'Transport',
      'Office Supplies',
      'Marketing',
      'Bank & Payment Fees',
      'Other'
    ];

    const validPaymentMethods = [
      'Cash',
      'Card',
      'Bank Transfer',
      'Other'
    ];

    if (
      typeof description !== 'string' ||
      !description.trim() ||
      description.trim().length > 200 ||
      !validCategories.includes(category) ||
      typeof amount !== 'number' ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      typeof date !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !validPaymentMethods.includes(paymentMethod) ||
      (notes !== undefined &&
        (typeof notes !== 'string' || notes.length > 500)) ||
      (recordedBy !== undefined && typeof recordedBy !== 'string')
    ) {
      return res.status(400).json({
        message: 'Please provide valid expense details'
      });
    }

    const expense = await Expense.create({
      description: description.trim(),
      category,
      amount,
      date,
      paymentMethod,
      notes: notes?.trim() || '',
      recordedBy: recordedBy?.trim() || 'Store Manager'
    });

    res.status(201).json(expense);
  } catch (error) {
    console.error('Expense create error:', error.message);
    res.status(500).json({ message: 'Could not save expense' });
  }
});

// Cancel an expense without permanently deleting its record
app.patch('/api/expenses/:id/cancel', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid expense ID' });
    }

    const expense = await Expense.findOneAndUpdate(
      { _id: req.params.id, status: 'Recorded' },
      { status: 'Cancelled' },
      { returnDocument: 'after', runValidators: true }
    );

    if (!expense) {
      return res.status(404).json({
        message: 'Active expense not found'
      });
    }

    res.json(expense);
  } catch (error) {
    console.error('Expense cancel error:', error.message);
    res.status(500).json({ message: 'Could not cancel expense' });
  }
});


// ============================================================
// DASHBOARD METRICS API
// ============================================================
// DASHBOARD METRICS & REVENUE TREND APIS
// ============================================================

// Daily Revenue Trend Line Chart API
app.get('/api/dashboard/revenue-trend', async (req, res) => {
  try {
    const { period = '7days', startDate: customStart, endDate: customEnd } = req.query;

    const slNow = getSriLankaDateTime();
    const todayStr = slNow.dateStr;

    let startDateStr = '';
    let endDateStr = todayStr;

    if (period === '7days') {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      startDateStr = getSriLankaDateTime(d).dateStr;
    } else if (period === '30days') {
      const d = new Date();
      d.setDate(d.getDate() - 29);
      startDateStr = getSriLankaDateTime(d).dateStr;
    } else if (period === 'month') {
      const now = new Date();
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      startDateStr = getSriLankaDateTime(firstOfMonth).dateStr;
    } else if (period === 'custom') {
      startDateStr = customStart || todayStr;
      endDateStr = customEnd || todayStr;
    } else {
      startDateStr = customStart || todayStr;
      endDateStr = customEnd || todayStr;
    }

    // Handle empty range or inverted dates gracefully
    if (startDateStr && endDateStr && startDateStr > endDateStr) {
      return res.json({
        period,
        startDate: startDateStr,
        endDate: endDateStr,
        summary: {
          totalSales: 0,
          totalCollections: 0,
          totalOutstandingCredit: 0,
          billSalesTotal: 0,
          rentalSalesTotal: 0,
          lessonSalesTotal: 0,
          cashTotal: 0,
          cardTotal: 0
        },
        trend: []
      });
    }

    // Validation
    const dateRangeError = validateDateRange(startDateStr, endDateStr);
    if (dateRangeError) {
      return res.status(400).json({ message: dateRangeError });
    }

    // Generate date sequence in Sri Lanka timezone
    const dates = [];
    const cur = new Date(startDateStr + 'T00:00:00+05:30');
    const end = new Date(endDateStr + 'T23:59:59+05:30');
    while (cur <= end) {
      const ds = getSriLankaDateTime(cur).dateStr;
      if (!dates.includes(ds)) dates.push(ds);
      cur.setDate(cur.getDate() + 1);
    }

    // Query datasets for the date range
    // 1. Bills (Settled and Refunded) on transaction dates
    const bills = await Bill.find({
      date: { $gte: startDateStr, $lte: endDateStr }
    }).lean();

    // 2. Completed Rentals returned on returnDate
    const rentals = await Rental.find({
      status: 'Completed',
      returnDate: { $gte: startDateStr, $lte: endDateStr }
    }).lean();

    // 3. Completed Lessons conducted on startDate
    const lessons = await Lesson.find({
      status: 'Completed',
      startDate: { $gte: startDateStr, $lte: endDateStr }
    }).lean();

    // 4. Actual Payments received on paymentDate
    const payments = await Payment.find({
      paymentDate: { $gte: startDateStr, $lte: endDateStr }
    }).lean();

    // Build day map
    const dayMap = new Map();
    dates.forEach((d) => {
      const parts = d.split('-');
      const label = `${Number(parts[2])} ${new Date(d + 'T00:00:00+05:30').toLocaleString('en-US', { month: 'short' })}`;
      dayMap.set(d, {
        date: d,
        label,
        salesAmount: 0,
        cashCollected: 0,
        outstandingCredit: 0,
        billSales: 0,
        rentalSales: 0,
        lessonSales: 0,
        cashAmount: 0,
        cardAmount: 0,
        otherAmount: 0,
        txCount: 0
      });
    });

    // Populate Sales (Earned revenue)
    bills.forEach((b) => {
      const entry = dayMap.get(b.date);
      if (entry) {
        if (b.status === 'Settled') {
          entry.salesAmount += b.total || 0;
          entry.billSales += b.total || 0;
          entry.txCount += 1;
        } else if (b.status === 'Refunded') {
          entry.salesAmount -= b.total || 0;
          entry.billSales -= b.total || 0;
        }
      }
    });

    rentals.forEach((r) => {
      const rDate = r.returnDate || r.startDate;
      const entry = dayMap.get(rDate);
      if (entry) {
        const charged = r.totalCharged || 0;
        entry.salesAmount += charged;
        entry.rentalSales += charged;
        entry.txCount += 1;
      }
    });

    lessons.forEach((l) => {
      const entry = dayMap.get(l.startDate);
      if (entry) {
        const lTotal = l.total || 0;
        entry.salesAmount += lTotal;
        entry.lessonSales += lTotal;
        entry.txCount += 1;
      }
    });

    // Track modern Payment entries
    const modernPaidSources = new Set(payments.map((p) => `${p.sourceType}_${p.sourceId.toString()}`));

    // Populate Cash Collected from modern Payment collection
    payments.forEach((p) => {
      const entry = dayMap.get(p.paymentDate);
      if (entry) {
        const amt = p.amount || 0;
        entry.cashCollected += amt;
        const method = (p.paymentMethod || 'Cash').toLowerCase();
        if (method.includes('cash')) {
          entry.cashAmount += amt;
        } else if (method.includes('card')) {
          entry.cardAmount += amt;
        } else {
          entry.otherAmount += amt;
        }
      }
    });

    // Handle historical records that have no entries in Payment collection
    bills.forEach((b) => {
      if (b.status === 'Settled' && !modernPaidSources.has(`Bill_${b._id.toString()}`)) {
        const entry = dayMap.get(b.date);
        if (entry && b.paymentStatus !== 'Unpaid') {
          const amt = b.totalPaid !== undefined && b.totalPaid > 0 ? b.totalPaid : b.total;
          entry.cashCollected += amt;
          const method = (b.paymentMethod || 'Cash').toLowerCase();
          if (method.includes('cash')) entry.cashAmount += amt;
          else if (method.includes('card')) entry.cardAmount += amt;
          else entry.otherAmount += amt;
        }
      }
    });

    rentals.forEach((r) => {
      if (!modernPaidSources.has(`Rental_${r._id.toString()}`)) {
        const rDate = r.returnDate || r.startDate;
        const entry = dayMap.get(rDate);
        if (entry && r.paymentStatus === 'Paid') {
          const amt = r.totalPaid !== undefined && r.totalPaid > 0 ? r.totalPaid : r.totalCharged;
          entry.cashCollected += amt;
          const method = (r.paymentMethod || 'Cash').toLowerCase();
          if (method.includes('cash')) entry.cashAmount += amt;
          else if (method.includes('card')) entry.cardAmount += amt;
          else entry.otherAmount += amt;
        }
      }
    });

    lessons.forEach((l) => {
      if (!modernPaidSources.has(`Lesson_${l._id.toString()}`)) {
        const entry = dayMap.get(l.startDate);
        if (entry && l.paymentStatus === 'Paid') {
          const amt = l.totalPaid !== undefined && l.totalPaid > 0 ? l.totalPaid : l.total;
          entry.cashCollected += amt;
          const method = (l.paymentMethod || 'Cash').toLowerCase();
          if (method.includes('cash')) entry.cashAmount += amt;
          else if (method.includes('card')) entry.cardAmount += amt;
          else entry.otherAmount += amt;
        }
      }
    });

    // Outstanding credit per date
    dayMap.forEach((entry) => {
      let dayOutstanding = 0;
      bills.filter((b) => b.date === entry.date && b.status === 'Settled').forEach((b) => {
        const bal = b.balanceDue !== undefined ? b.balanceDue : (b.paymentStatus === 'Unpaid' ? b.total : 0);
        dayOutstanding += bal;
      });
      rentals.filter((r) => (r.returnDate || r.startDate) === entry.date).forEach((r) => {
        const bal = r.balanceDue !== undefined ? r.balanceDue : (r.paymentStatus === 'Unpaid' ? r.totalCharged : 0);
        dayOutstanding += bal;
      });
      lessons.filter((l) => l.startDate === entry.date).forEach((l) => {
        const bal = l.balanceDue !== undefined ? l.balanceDue : (l.paymentStatus === 'Unpaid' ? l.total : 0);
        dayOutstanding += bal;
      });
      entry.outstandingCredit = dayOutstanding;
    });

    const trend = Array.from(dayMap.values());

    const summary = {
      totalSales: trend.reduce((s, it) => s + it.salesAmount, 0),
      totalCollections: trend.reduce((s, it) => s + it.cashCollected, 0),
      totalOutstandingCredit: trend.reduce((s, it) => s + it.outstandingCredit, 0),
      billSalesTotal: trend.reduce((s, it) => s + it.billSales, 0),
      rentalSalesTotal: trend.reduce((s, it) => s + it.rentalSales, 0),
      lessonSalesTotal: trend.reduce((s, it) => s + it.lessonSales, 0),
      cashTotal: trend.reduce((s, it) => s + it.cashAmount, 0),
      cardTotal: trend.reduce((s, it) => s + it.cardAmount, 0)
    };

    res.json({
      period,
      startDate: startDateStr,
      endDate: endDateStr,
      summary,
      trend
    });
  } catch (error) {
    console.error('Revenue trend error:', error.message);
    res.status(500).json({ message: 'Could not compute revenue trend: ' + error.message });
  }
});

// Dashboard metrics API
app.get('/api/dashboard/metrics', async (req, res) => {
  try {
    const slNow = getSriLankaDateTime();
    const todayStr = slNow.dateStr;

    // Bills settled today
    const todayBills = await Bill.find({ date: todayStr, status: 'Settled' });
    const allOpenBillsCount = await Bill.countDocuments({ status: 'Open' });

    // Completed rentals returned today
    const todayRentals = await Rental.find({ returnDate: todayStr, status: 'Completed' });

    // Completed lessons today
    const todayLessons = await Lesson.find({ startDate: todayStr, status: 'Completed' });

    // Active rentals & lessons right now
    const activeRentalsCount = await Rental.countDocuments({ status: 'Active' });
    const activeLessonsCount = await Lesson.countDocuments({ status: 'In Progress' });

    // Fleet summary
    const totalBoards = await Surfboard.countDocuments();
    const availableBoards = await Surfboard.countDocuments({ status: 'Available' });
    const rentedBoards = await Surfboard.countDocuments({ status: 'Rented' });
    const inLessonBoards = await Surfboard.countDocuments({ status: 'In Lesson' });
    const damagedBoards = await Surfboard.countDocuments({ status: { $in: ['Damaged', 'Under Repair'] } });

    // Low stock items (active only)
    const lowStockItems = await InventoryItem.find({
      isActive: { $ne: false },
      isArchived: { $ne: true },
      $expr: { $lte: ['$currentQuantity', '$reorderThreshold'] }
    });

    // Sales sums (Earned revenue today)
    const billSalesToday = todayBills.reduce((acc, b) => acc + (b.total || 0), 0);
    const rentalSalesToday = todayRentals.reduce((acc, r) => acc + (r.totalCharged || 0), 0);
    const lessonSalesToday = todayLessons.reduce((acc, l) => acc + (l.total || 0), 0);
    const totalTodaySales = billSalesToday + rentalSalesToday + lessonSalesToday;

    // Actual Collections today (from Payment collection or today's paid transactions)
    const todayPayments = await Payment.find({ paymentDate: todayStr });
    const paymentSourceIds = new Set(todayPayments.map((p) => `${p.sourceType}_${p.sourceId.toString()}`));

    let cashReceived = 0;
    let cardReceived = 0;
    let otherReceived = 0;
    let cashCount = 0;
    let cardCount = 0;

    todayPayments.forEach((p) => {
      const method = (p.paymentMethod || 'Cash').toLowerCase();
      if (method.includes('cash')) {
        cashReceived += p.amount;
        cashCount++;
      } else if (method.includes('card')) {
        cardReceived += p.amount;
        cardCount++;
      } else {
        otherReceived += p.amount;
      }
    });

    // Also include historical or direct settlements today where no Payment doc was written
    todayBills.forEach((b) => {
      if (!paymentSourceIds.has(`Bill_${b._id.toString()}`) && b.paymentStatus !== 'Unpaid') {
        const amt = b.totalPaid !== undefined && b.totalPaid > 0 ? b.totalPaid : b.total;
        const method = (b.paymentMethod || 'Cash').toLowerCase();
        if (method.includes('cash')) {
          cashReceived += amt;
          cashCount++;
        } else if (method.includes('card')) {
          cardReceived += amt;
          cardCount++;
        } else {
          otherReceived += amt;
        }
      }
    });

    todayRentals.forEach((r) => {
      if (!paymentSourceIds.has(`Rental_${r._id.toString()}`) && r.paymentStatus === 'Paid') {
        const amt = r.totalPaid !== undefined && r.totalPaid > 0 ? r.totalPaid : r.totalCharged;
        const method = (r.paymentMethod || 'Cash').toLowerCase();
        if (method.includes('cash')) {
          cashReceived += amt;
          cashCount++;
        } else if (method.includes('card')) {
          cardReceived += amt;
          cardCount++;
        } else {
          otherReceived += amt;
        }
      }
    });

    todayLessons.forEach((l) => {
      if (!paymentSourceIds.has(`Lesson_${l._id.toString()}`) && l.paymentStatus === 'Paid') {
        const amt = l.totalPaid !== undefined && l.totalPaid > 0 ? l.totalPaid : l.total;
        const method = (l.paymentMethod || 'Cash').toLowerCase();
        if (method.includes('cash')) {
          cashReceived += amt;
          cashCount++;
        } else if (method.includes('card')) {
          cardReceived += amt;
          cardCount++;
        } else {
          otherReceived += amt;
        }
      }
    });

    const totalCollectionsToday = cashReceived + cardReceived + otherReceived;

    // Calculate total active outstanding customer credit across all records
    const unpaidBills = await Bill.find({
      status: 'Settled',
      paymentStatus: { $in: ['Unpaid', 'Partially Paid'] }
    });
    const unpaidRentals = await Rental.find({
      status: 'Completed',
      paymentStatus: { $in: ['Unpaid', 'Partially Paid'] }
    });
    const unpaidLessons = await Lesson.find({
      status: { $in: ['Completed', 'In Progress'] },
      paymentStatus: { $in: ['Unpaid', 'Partially Paid'] }
    });

    const outstandingCreditBills = unpaidBills.reduce((s, b) => s + (b.balanceDue !== undefined ? b.balanceDue : (b.total - (b.totalPaid || 0))), 0);
    const outstandingCreditRentals = unpaidRentals.reduce((s, r) => s + (r.balanceDue !== undefined ? r.balanceDue : (r.totalCharged - (r.totalPaid || 0))), 0);
    const outstandingCreditLessons = unpaidLessons.reduce((s, l) => s + (l.balanceDue !== undefined ? l.balanceDue : (l.total - (l.totalPaid || 0))), 0);

    const totalOutstandingCredit = outstandingCreditBills + outstandingCreditRentals + outstandingCreditLessons;
    const unpaidItemsCount = unpaidBills.length + unpaidRentals.length + unpaidLessons.length;

    const totalTxCount = todayBills.length + todayRentals.length + todayLessons.length;

    res.json({
      todaySales: totalTodaySales,
      billSalesToday,
      rentalSalesToday,
      lessonSalesToday,
      transactionCount: totalTxCount,
      cashReceived,
      cashCount,
      cardReceived,
      cardCount,
      otherReceived,
      todayCollections: totalCollectionsToday,
      outstandingCredit: totalOutstandingCredit,
      unpaidItemsCount,
      unpaidBillsCount: unpaidBills.length,
      unpaidRentalsCount: unpaidRentals.length,
      unpaidLessonsCount: unpaidLessons.length,
      openBillsCount: allOpenBillsCount,
      activeRentalsCount,
      activeLessonsCount,
      totalBoards,
      availableBoards,
      rentedBoards,
      inLessonBoards,
      damagedBoards,
      lowStockCount: lowStockItems.length,
      lowStockItems
    });
  } catch (error) {
    console.error('Dashboard metrics error:', error.message);
    res.status(500).json({ message: 'Could not compute dashboard metrics' });
  }
});

// ============================================================
// CUSTOMER CREDIT & RECEIVABLES API
// ============================================================

// Get unified list of all outstanding balances from Bills, Rentals, and Lessons
app.get('/api/credit/outstanding', async (req, res) => {
  try {
    const { sourceType, paymentStatus, search, startDate, endDate } = req.query;

    const items = [];

    // 1. Bills (Settled bills where paymentStatus is Unpaid or Partially Paid)
    if (!sourceType || sourceType === 'All' || sourceType === 'Bill') {
      const billFilter = {
        status: 'Settled',
        paymentStatus: { $in: ['Unpaid', 'Partially Paid'] }
      };
      if (paymentStatus && paymentStatus !== 'All') {
        billFilter.paymentStatus = paymentStatus;
      }
      if (startDate || endDate) {
        billFilter.date = {};
        if (startDate) billFilter.date.$gte = startDate;
        if (endDate) billFilter.date.$lte = endDate;
      }

      const bills = await Bill.find(billFilter).sort({ date: -1, createdAt: -1 }).lean();
      for (const b of bills) {
        const total = b.total || 0;
        const totalPaid = b.totalPaid || 0;
        const balanceDue = b.balanceDue !== undefined ? b.balanceDue : Math.max(0, total - totalPaid);
        if (balanceDue > 0) {
          items.push({
            id: `bill_${b._id}`,
            sourceId: b._id.toString(),
            sourceType: 'Bill',
            sourceReference: b.billNumber,
            customerName: b.customerName || 'Walk-in Guest',
            customerContact: '',
            transactionDate: b.date,
            transactionTime: b.time,
            originalAmount: total,
            totalPaid,
            balanceDue,
            paymentStatus: b.paymentStatus || (totalPaid > 0 ? 'Partially Paid' : 'Unpaid'),
            status: b.status,
            paymentMethod: b.paymentMethod,
            notes: b.notes || '',
            createdAt: b.createdAt
          });
        }
      }
    }

    // 2. Completed Rentals where paymentStatus is Unpaid or Partially Paid
    if (!sourceType || sourceType === 'All' || sourceType === 'Rental') {
      const rentalFilter = {
        status: 'Completed',
        paymentStatus: { $in: ['Unpaid', 'Partially Paid'] }
      };
      if (paymentStatus && paymentStatus !== 'All') {
        rentalFilter.paymentStatus = paymentStatus;
      }
      if (startDate || endDate) {
        rentalFilter.returnDate = {};
        if (startDate) rentalFilter.returnDate.$gte = startDate;
        if (endDate) rentalFilter.returnDate.$lte = endDate;
      }

      const rentals = await Rental.find(rentalFilter).sort({ returnDate: -1, createdAt: -1 }).lean();
      for (const r of rentals) {
        const total = r.totalCharged || 0;
        const totalPaid = r.totalPaid || 0;
        const balanceDue = r.balanceDue !== undefined ? r.balanceDue : Math.max(0, total - totalPaid);
        if (balanceDue > 0) {
          items.push({
            id: `rental_${r._id}`,
            sourceId: r._id.toString(),
            sourceType: 'Rental',
            sourceReference: r.receiptNumber || `RENT-${r._id}`,
            customerName: r.customerName,
            customerContact: r.customerContact || '',
            transactionDate: r.returnDate || r.startDate,
            transactionTime: r.returnTime || r.startTime,
            originalAmount: total,
            totalPaid,
            balanceDue,
            paymentStatus: r.paymentStatus,
            status: r.status,
            paymentMethod: r.paymentMethod,
            notes: r.notes || '',
            createdAt: r.createdAt
          });
        }
      }
    }

    // 3. Surf Lessons (Completed or In Progress) where paymentStatus is Unpaid or Partially Paid
    if (!sourceType || sourceType === 'All' || sourceType === 'Lesson') {
      const lessonFilter = {
        status: { $in: ['Completed', 'In Progress'] },
        paymentStatus: { $in: ['Unpaid', 'Partially Paid'] }
      };
      if (paymentStatus && paymentStatus !== 'All') {
        lessonFilter.paymentStatus = paymentStatus;
      }
      if (startDate || endDate) {
        lessonFilter.startDate = {};
        if (startDate) lessonFilter.startDate.$gte = startDate;
        if (endDate) lessonFilter.startDate.$lte = endDate;
      }

      const lessons = await Lesson.find(lessonFilter).sort({ startDate: -1, createdAt: -1 }).lean();
      for (const l of lessons) {
        const total = l.total || 0;
        const totalPaid = l.totalPaid || 0;
        const balanceDue = l.balanceDue !== undefined ? l.balanceDue : Math.max(0, total - totalPaid);
        if (balanceDue > 0) {
          items.push({
            id: `lesson_${l._id}`,
            sourceId: l._id.toString(),
            sourceType: 'Lesson',
            sourceReference: l.lessonNumber,
            customerName: l.customerName,
            customerContact: l.customerContact || '',
            transactionDate: l.startDate,
            transactionTime: l.startTime,
            originalAmount: total,
            totalPaid,
            balanceDue,
            paymentStatus: l.paymentStatus,
            status: l.status,
            paymentMethod: l.paymentMethod,
            notes: l.notes || '',
            createdAt: l.createdAt
          });
        }
      }
    }

    // Filter by search term if provided
    let filteredItems = items;
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      filteredItems = items.filter(
        (it) =>
          it.customerName.toLowerCase().includes(q) ||
          it.sourceReference.toLowerCase().includes(q) ||
          it.customerContact.toLowerCase().includes(q) ||
          it.notes.toLowerCase().includes(q)
      );
    }

    // Sort by transactionDate desc, then createdAt desc
    filteredItems.sort((a, b) => {
      if (a.transactionDate !== b.transactionDate) {
        return b.transactionDate.localeCompare(a.transactionDate);
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    const totalOutstanding = filteredItems.reduce((sum, it) => sum + it.balanceDue, 0);
    const totalUnpaidCount = filteredItems.filter((it) => it.paymentStatus === 'Unpaid').length;
    const totalPartiallyPaidCount = filteredItems.filter((it) => it.paymentStatus === 'Partially Paid').length;

    const billsCount = filteredItems.filter((it) => it.sourceType === 'Bill').length;
    const billsAmount = filteredItems.filter((it) => it.sourceType === 'Bill').reduce((s, it) => s + it.balanceDue, 0);
    const rentalsCount = filteredItems.filter((it) => it.sourceType === 'Rental').length;
    const rentalsAmount = filteredItems.filter((it) => it.sourceType === 'Rental').reduce((s, it) => s + it.balanceDue, 0);
    const lessonsCount = filteredItems.filter((it) => it.sourceType === 'Lesson').length;
    const lessonsAmount = filteredItems.filter((it) => it.sourceType === 'Lesson').reduce((s, it) => s + it.balanceDue, 0);

    res.json({
      items: filteredItems,
      summary: {
        totalOutstanding,
        totalTransactions: filteredItems.length,
        totalUnpaidCount,
        totalPartiallyPaidCount,
        bySource: {
          bills: { count: billsCount, amount: billsAmount },
          rentals: { count: rentalsCount, amount: rentalsAmount },
          lessons: { count: lessonsCount, amount: lessonsAmount }
        }
      }
    });
  } catch (error) {
    console.error('Get outstanding credit error:', error.message);
    res.status(500).json({ message: 'Could not fetch outstanding credit records' });
  }
});

// Unified payment router for credit transactions
app.post('/api/credit/:sourceType/:sourceId/pay', async (req, res) => {
  try {
    const { sourceType, sourceId } = req.params;
    if (!['Bill', 'Rental', 'Lesson'].includes(sourceType)) {
      return res.status(400).json({ message: 'Invalid sourceType. Expected Bill, Rental, or Lesson.' });
    }
    if (!mongoose.isValidObjectId(sourceId)) {
      return res.status(400).json({ message: 'Invalid sourceId' });
    }

    req.params.id = sourceId;
    if (sourceType === 'Bill') {
      const bill = await Bill.findById(sourceId);
      if (!bill) return res.status(404).json({ message: 'Bill not found' });
      const currentPaid = bill.totalPaid !== undefined ? bill.totalPaid : (bill.paymentStatus === 'Paid' ? bill.total : 0);
      const currentBalance = Math.max(0, bill.total - currentPaid);
      const pAmt = Number(req.body.amount);
      if (!pAmt || pAmt <= 0) return res.status(400).json({ message: 'Payment amount must be greater than zero' });
      if (pAmt > currentBalance) return res.status(400).json({ message: `Payment amount exceeds balance (Rs. ${currentBalance})` });

      if (req.body.idempotencyKey) {
        const existingPay = await Payment.findOne({ idempotencyKey: req.body.idempotencyKey });
        if (existingPay) return res.json({ bill, payment: existingPay, alreadyProcessed: true });
      }

      const slDate = getSriLankaDateTime();
      const newPaid = currentPaid + pAmt;
      const newBalance = Math.max(0, bill.total - newPaid);
      bill.totalPaid = newPaid;
      bill.balanceDue = newBalance;
      bill.paymentStatus = newBalance === 0 ? 'Paid' : 'Partially Paid';
      await bill.save();

      const paymentDoc = await Payment.create({
        sourceType: 'Bill',
        sourceId: bill._id,
        sourceReference: bill.billNumber,
        customerName: bill.customerName || 'Walk-in Guest',
        customerContact: req.body.customerContact || '',
        amount: pAmt,
        paymentMethod: req.body.paymentMethod || 'Cash',
        paymentDate: slDate.dateStr,
        paymentTime: slDate.timeStr,
        paymentTimestamp: slDate.timestamp,
        cashier: req.body.cashier || 'Staff',
        notes: req.body.notes || 'Credit settlement payment',
        ...(req.body.idempotencyKey ? { idempotencyKey: req.body.idempotencyKey } : {})
      });

      return res.json({ bill, payment: paymentDoc });
    } else if (sourceType === 'Rental') {
      const rental = await Rental.findById(sourceId);
      if (!rental) return res.status(404).json({ message: 'Rental not found' });
      if (rental.status !== 'Completed') return res.status(400).json({ message: 'Can only record payment for completed rentals' });
      const currentTotal = rental.totalCharged || 0;
      const currentPaid = rental.totalPaid !== undefined ? rental.totalPaid : (rental.paymentStatus === 'Paid' ? currentTotal : 0);
      const currentBalance = Math.max(0, currentTotal - currentPaid);
      const pAmt = Number(req.body.amount);
      if (!pAmt || pAmt <= 0) return res.status(400).json({ message: 'Payment amount must be greater than zero' });
      if (pAmt > currentBalance) return res.status(400).json({ message: `Payment amount exceeds balance (Rs. ${currentBalance})` });

      if (req.body.idempotencyKey) {
        const existingPay = await Payment.findOne({ idempotencyKey: req.body.idempotencyKey });
        if (existingPay) return res.json({ rental, payment: existingPay, alreadyProcessed: true });
      }

      const slDate = getSriLankaDateTime();
      const newPaid = currentPaid + pAmt;
      const newBalance = Math.max(0, currentTotal - newPaid);
      rental.totalPaid = newPaid;
      rental.balanceDue = newBalance;
      rental.paymentStatus = newBalance === 0 ? 'Paid' : 'Partially Paid';
      rental.paymentRecordedAt = slDate.isoStr;
      await rental.save();

      const paymentDoc = await Payment.create({
        sourceType: 'Rental',
        sourceId: rental._id,
        sourceReference: rental.receiptNumber,
        customerName: rental.customerName,
        customerContact: rental.customerContact || '',
        amount: pAmt,
        paymentMethod: req.body.paymentMethod || 'Cash',
        paymentDate: slDate.dateStr,
        paymentTime: slDate.timeStr,
        paymentTimestamp: slDate.timestamp,
        cashier: req.body.cashier || 'Staff',
        notes: req.body.notes || 'Rental credit payment',
        ...(req.body.idempotencyKey ? { idempotencyKey: req.body.idempotencyKey } : {})
      });

      return res.json({ rental, payment: paymentDoc });
    } else if (sourceType === 'Lesson') {
      return handleLessonPayment(req, res);
    }
  } catch (error) {
    console.error('Credit pay error:', error.message);
    res.status(500).json({ message: error.message || 'Payment processing failed' });
  }
});

// Get payment history for any source (Bill, Rental, Lesson)
app.get('/api/credit/:sourceType/:sourceId/history', async (req, res) => {
  try {
    const { sourceType, sourceId } = req.params;
    if (!mongoose.isValidObjectId(sourceId)) {
      return res.status(400).json({ message: 'Invalid sourceId' });
    }

    const payments = await Payment.find({ sourceType, sourceId }).sort({ paymentTimestamp: 1 }).lean();
    res.json(payments);
  } catch (error) {
    console.error('Credit history error:', error.message);
    res.status(500).json({ message: 'Could not fetch payment history' });
  }
});

// ============================================================
// INSTRUCTORS API
// ============================================================

// Get all instructors
app.get('/api/instructors', async (req, res) => {
  try {
    const { active } = req.query;
    const filter = {};
    if (active === 'true') filter.isActive = true;
    if (active === 'false') filter.isActive = false;

    const instructors = await Instructor.find(filter).sort({ name: 1 });
    res.json(instructors);
  } catch (error) {
    console.error('Instructors query error:', error.message);
    res.status(500).json({ message: 'Could not retrieve instructors' });
  }
});

// Create instructor
app.post('/api/instructors', async (req, res) => {
  try {
    const { name, phone, email, specialties, isActive, notes } = req.body;
    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ message: 'Instructor name is required' });
    }

    const instructor = await Instructor.create({
      name: name.trim(),
      phone: phone?.trim() || '',
      email: email?.trim() || '',
      specialties: specialties?.trim() || 'All Levels (Beginner to Advanced)',
      isActive: typeof isActive === 'boolean' ? isActive : true,
      notes: notes?.trim() || ''
    });

    res.status(201).json(instructor);
  } catch (error) {
    console.error('Instructor create error:', error.message);
    res.status(500).json({ message: 'Could not create instructor: ' + error.message });
  }
});

// Update instructor
app.put('/api/instructors/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid instructor ID' });
    }

    const { name, phone, email, specialties, isActive, notes } = req.body;
    const updates = {};
    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ message: 'Instructor name cannot be empty' });
      }
      updates.name = name.trim();
    }
    if (phone !== undefined) updates.phone = phone.trim();
    if (email !== undefined) updates.email = email.trim();
    if (specialties !== undefined) updates.specialties = specialties.trim();
    if (isActive !== undefined) updates.isActive = Boolean(isActive);
    if (notes !== undefined) updates.notes = notes.trim();

    const instructor = await Instructor.findByIdAndUpdate(req.params.id, updates, {
      returnDocument: 'after',
      runValidators: true
    });

    if (!instructor) {
      return res.status(404).json({ message: 'Instructor not found' });
    }

    res.json(instructor);
  } catch (error) {
    console.error('Instructor update error:', error.message);
    res.status(500).json({ message: 'Could not update instructor: ' + error.message });
  }
});

// Toggle / set instructor status
app.patch('/api/instructors/:id/status', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid instructor ID' });
    }

    const { isActive } = req.body;
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ message: 'isActive must be a boolean' });
    }

    const instructor = await Instructor.findByIdAndUpdate(
      req.params.id,
      { isActive },
      { returnDocument: 'after' }
    );

    if (!instructor) {
      return res.status(404).json({ message: 'Instructor not found' });
    }

    res.json(instructor);
  } catch (error) {
    console.error('Instructor status update error:', error.message);
    res.status(500).json({ message: 'Could not update instructor status' });
  }
});

// ============================================================
// SURF LESSONS API
// ============================================================

function validateWalkinLesson(body) {
  const {
    customerName,
    studentCount,
    lessonType,
    pricingMode,
    unitPrice,
    sessionPrice,
    durationMinutes,
    discount,
    paymentMethod,
    paymentStatus
  } = body;

  if (typeof customerName !== 'string' || !customerName.trim()) {
    return 'Customer name is required';
  }

  const validStudentCount = Number(studentCount);
  if (!Number.isInteger(validStudentCount) || validStudentCount < 1) {
    return 'Student count must be an integer of at least 1';
  }

  const validLessonTypes = ['Private', 'Group'];
  if (lessonType && !validLessonTypes.includes(lessonType)) {
    return 'Lesson type must be either Private or Group';
  }

  const validPricingModes = ['Per Person', 'Fixed Session'];
  if (!validPricingModes.includes(pricingMode)) {
    return 'Pricing mode must be either Per Person or Fixed Session';
  }

  const dur = Number(durationMinutes);
  if (!Number.isFinite(dur) || dur < 15) {
    return 'Duration must be at least 15 minutes';
  }

  if (pricingMode === 'Per Person') {
    const uPrice = Number(unitPrice);
    if (!Number.isFinite(uPrice) || uPrice < 0) {
      return 'Unit price per person must be a non-negative number';
    }
  } else {
    const sPrice = Number(sessionPrice);
    if (!Number.isFinite(sPrice) || sPrice < 0) {
      return 'Session price must be a non-negative number';
    }
  }

  const disc = Number(discount) || 0;
  if (!Number.isFinite(disc) || disc < 0) {
    return 'Discount must be a non-negative number';
  }

  const validMethods = ['Cash', 'Card', 'Online / QR', 'Room Charge', 'Other'];
  if (paymentMethod && !validMethods.includes(paymentMethod)) {
    return 'Invalid payment method';
  }

  const validPaymentStatuses = ['Paid', 'Unpaid'];
  if (paymentStatus && !validPaymentStatuses.includes(paymentStatus)) {
    return 'Invalid payment status (must be Paid or Unpaid)';
  }

  return null;
}

// Get lessons with optional date, status, and instructor filters
app.get('/api/lessons', async (req, res) => {
  try {
    const { startDate, endDate, status, instructorId, paymentStatus } = req.query;
    const dateErr = validateDateRange(startDate, endDate);
    if (dateErr) {
      return res.status(400).json({ message: dateErr });
    }

    const filter = {};
    if (startDate || endDate) {
      filter.startDate = {};
      if (startDate) filter.startDate.$gte = startDate;
      if (endDate) filter.startDate.$lte = endDate;
    }
    if (status) {
      filter.status = status;
    }
    if (paymentStatus) {
      filter.paymentStatus = paymentStatus;
    }
    if (instructorId) {
      if (!mongoose.isValidObjectId(instructorId)) {
        return res.status(400).json({ message: 'Invalid instructorId query filter' });
      }
      filter.instructorId = instructorId;
    }

    const lessons = await Lesson.find(filter).sort({ createdAt: -1 });
    res.json(lessons);
  } catch (error) {
    console.error('Lessons query error:', error.message);
    res.status(500).json({ message: 'Could not retrieve lessons' });
  }
});

// Get a single lesson
app.get('/api/lessons/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid lesson ID' });
    }

    const lesson = await Lesson.findById(req.params.id);
    if (!lesson) {
      return res.status(404).json({ message: 'Lesson not found' });
    }

    res.json(lesson);
  } catch (error) {
    console.error('Lesson query error:', error.message);
    res.status(500).json({ message: 'Could not retrieve lesson' });
  }
});

// Register Walk-in Lesson with concurrency-safe board allocation & overlap checks
app.post('/api/lessons/walkin', async (req, res) => {
  const valError = validateWalkinLesson(req.body);
  if (valError) {
    return res.status(400).json({ message: valError });
  }

  const {
    lessonNumber: customLessonNumber,
    customerName,
    customerContact,
    customerPassportOrId,
    studentCount,
    lessonType,
    pricingMode,
    unitPrice,
    sessionPrice,
    durationMinutes,
    discount,
    paymentMethod,
    paymentStatus,
    startDate,
    startTime,
    startTimestamp,
    instructorId,
    assignedBoardIds,
    notes,
    cashier
  } = req.body;

  const validStudentCount = Number(studentCount);
  const durMinutes = Number(durationMinutes) || 60;
  const newStartTimestamp = Number(startTimestamp) || Date.now();
  const newEndTimestamp = newStartTimestamp + durMinutes * 60 * 1000;

  const finalStartDate = startDate || new Date(newStartTimestamp).toISOString().split('T')[0];
  const finalStartTime =
    startTime ||
    new Date(newStartTimestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  const finalEndTime = new Date(newEndTimestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  const calcSubtotal =
    pricingMode === 'Per Person'
      ? Number(unitPrice) * validStudentCount
      : Number(sessionPrice);
  const calcDiscount = Math.min(calcSubtotal, Number(discount) || 0);
  const calcTotal = Math.max(0, calcSubtotal - calcDiscount);

  // Validate board IDs array
  const rawBoardIds = Array.isArray(assignedBoardIds) ? assignedBoardIds : [];
  const uniqueBoardIds = [...new Set(rawBoardIds.map(String))];
  if (uniqueBoardIds.length !== rawBoardIds.length) {
    return res.status(400).json({ message: 'Duplicate surfboards specified in assignment' });
  }

  for (const bId of uniqueBoardIds) {
    if (!mongoose.isValidObjectId(bId)) {
      return res.status(400).json({ message: `Invalid surfboard ID: ${bId}` });
    }
  }

  if (instructorId && !mongoose.isValidObjectId(instructorId)) {
    return res.status(400).json({ message: 'Invalid instructor ID' });
  }

  const session = await mongoose.startSession();
  try {
    let createdLesson = null;
    await session.withTransaction(async () => {
      // 1. Validate Instructor & Overlap
      let instructorDoc = null;
      if (instructorId) {
        instructorDoc = await Instructor.findById(instructorId).session(session);
        if (!instructorDoc) {
          const err = new Error('Selected instructor does not exist');
          err.statusCode = 404;
          throw err;
        }
        if (!instructorDoc.isActive) {
          const err = new Error(`Instructor "${instructorDoc.name}" is currently inactive`);
          err.statusCode = 400;
          throw err;
        }

        // Active lesson overlap check for instructor
        const conflictLesson = await Lesson.findOne({
          instructorId: instructorDoc._id,
          status: 'In Progress',
          startTimestamp: { $lt: newEndTimestamp },
          endTimestamp: { $gt: newStartTimestamp }
        }).session(session);

        if (conflictLesson) {
          const err = new Error(
            `Instructor "${instructorDoc.name}" is already assigned to active lesson #${conflictLesson.lessonNumber} during this time`
          );
          err.statusCode = 409;
          throw err;
        }
      }

      // 2. Validate Boards Availability & Overlap
      const newLessonId = new mongoose.Types.ObjectId();
      const boardsToAssign = [];

      for (const bId of uniqueBoardIds) {
        const board = await Surfboard.findById(bId).session(session);
        if (!board) {
          const err = new Error(`Surfboard not found: ${bId}`);
          err.statusCode = 404;
          throw err;
        }

        if (board.status !== 'Available') {
          const err = new Error(
            `Surfboard "${board.name}" is not available (current status: ${board.status})`
          );
          err.statusCode = 409;
          throw err;
        }

        // Overlap check on active lessons for this board
        const boardConflict = await Lesson.findOne({
          status: 'In Progress',
          'assignedBoards.boardId': board._id,
          startTimestamp: { $lt: newEndTimestamp },
          endTimestamp: { $gt: newStartTimestamp }
        }).session(session);

        if (boardConflict) {
          const err = new Error(
            `Surfboard "${board.name}" is already assigned to active lesson #${boardConflict.lessonNumber}`
          );
          err.statusCode = 409;
          throw err;
        }

        // Atomically assign board to this lesson
        await Surfboard.findByIdAndUpdate(
          board._id,
          {
            status: 'In Lesson',
            currentLessonId: newLessonId.toString(),
            currentCustomer: customerName.trim(),
            rentalStartTime: finalStartTime
          },
          { session }
        );

        boardsToAssign.push({
          boardId: board._id,
          boardName: board.name,
          boardCategory: board.category
        });
      }

      // 3. Generate sequential lesson number
      const year = new Date().getFullYear();
      const count = await Lesson.countDocuments().session(session);
      const finalLessonNumber =
        customLessonNumber && !customLessonNumber.includes('TEMP')
          ? customLessonNumber
          : `LES-${year}-${String(count + 1).padStart(4, '0')}`;

      let lessonTotalPaid = 0;
      let lessonBalanceDue = calcTotal;
      let finalPaymentStatus = 'Unpaid';

      if (paymentStatus === 'Paid') {
        const pAmt = req.body.paidAmount !== undefined ? Number(req.body.paidAmount) : calcTotal;
        lessonTotalPaid = Math.min(calcTotal, Math.max(0, pAmt));
        lessonBalanceDue = Math.max(0, calcTotal - lessonTotalPaid);
        finalPaymentStatus = lessonBalanceDue === 0 ? 'Paid' : (lessonTotalPaid > 0 ? 'Partially Paid' : 'Unpaid');
      } else if (paymentStatus === 'Partially Paid') {
        const pAmt = Number(req.body.paidAmount) || 0;
        lessonTotalPaid = Math.min(calcTotal, Math.max(0, pAmt));
        lessonBalanceDue = Math.max(0, calcTotal - lessonTotalPaid);
        finalPaymentStatus = lessonBalanceDue === 0 ? 'Paid' : (lessonTotalPaid > 0 ? 'Partially Paid' : 'Unpaid');
      }

      const slNow = getSriLankaDateTime();

      // 4. Create Lesson
      const [lesson] = await Lesson.create(
        [
          {
            _id: newLessonId,
            lessonNumber: finalLessonNumber,
            customerName: customerName.trim(),
            customerContact: customerContact?.trim() || '',
            customerPassportOrId: customerPassportOrId?.trim() || '',
            studentCount: validStudentCount,
            lessonType: lessonType || 'Private',
            pricingMode,
            unitPrice: pricingMode === 'Per Person' ? Number(unitPrice) : 0,
            sessionPrice: pricingMode === 'Fixed Session' ? Number(sessionPrice) : 0,
            durationMinutes: durMinutes,
            subtotal: calcSubtotal,
            discount: calcDiscount,
            total: calcTotal,
            paymentMethod: paymentMethod || 'Cash',
            paymentStatus: finalPaymentStatus,
            totalPaid: lessonTotalPaid,
            balanceDue: lessonBalanceDue,
            paymentRecordedAt: lessonTotalPaid > 0 ? slNow.isoStr : '',
            startDate: finalStartDate,
            startTime: finalStartTime,
            startTimestamp: newStartTimestamp,
            endTime: finalEndTime,
            endTimestamp: newEndTimestamp,
            instructorId: instructorDoc ? instructorDoc._id : null,
            instructorName: instructorDoc ? instructorDoc.name : 'Unassigned',
            assignedBoards: boardsToAssign,
            status: 'In Progress',
            coconutIssued: false,
            notes: notes?.trim() || '',
            cashier: cashier || 'Cashier'
          }
        ],
        { session }
      );

      if (lessonTotalPaid > 0) {
        await Payment.create(
          [
            {
              sourceType: 'Lesson',
              sourceId: lesson._id,
              sourceReference: lesson.lessonNumber,
              customerName: lesson.customerName,
              customerContact: lesson.customerContact || '',
              amount: lessonTotalPaid,
              paymentMethod: paymentMethod || 'Cash',
              paymentDate: slNow.dateStr,
              paymentTime: slNow.timeStr,
              paymentTimestamp: slNow.timestamp,
              cashier: cashier || 'Cashier',
              notes: notes?.trim() || 'Walk-in lesson payment'
            }
          ],
          { session }
        );
      }

      // Automatically create Open Tab in Open Bills so cafe food/drinks can be billed together
      try {
        const bCount = await Bill.countDocuments().session(session);
        let billNumberForLesson = `BILL-${year}-${String(bCount + 1).padStart(4, '0')}`;
        let bAttempts = 0;
        while (bAttempts < 20) {
          const bExisting = await Bill.findOne({ billNumber: billNumberForLesson }, { _id: 1 }).session(session);
          if (!bExisting) break;
          bAttempts++;
          billNumberForLesson = `BILL-${year}-${String(bCount + 1 + bAttempts).padStart(4, '0')}`;
        }

        const lessonItemName = `Surf Lesson - ${lessonType || 'Private'} (${validStudentCount} student${validStudentCount > 1 ? 's' : ''} · ${durMinutes} mins | ${finalStartTime} - ${finalEndTime})`;
        const [openBill] = await Bill.create(
          [
            {
              billNumber: billNumberForLesson,
              customerName: customerName.trim(),
              date: finalStartDate,
              time: finalStartTime,
              orderType: 'Dine-in',
              saleType: 'Surf Lesson',
              paymentMethod: paymentMethod || 'Cash',
              items: [
                {
                  name: lessonItemName,
                  quantity: 1,
                  unitPrice: calcTotal,
                  total: calcTotal,
                  code: 'LESSON',
                  duration: `${durMinutes} mins`,
                  startTime: finalStartTime,
                  endTime: finalEndTime,
                  addedAt: new Date().toISOString()
                }
              ],
              subtotal: calcTotal,
              discount: 0,
              serviceCharge: 0,
              total: calcTotal,
              status: 'Open',
              paymentStatus: finalPaymentStatus,
              totalPaid: lessonTotalPaid,
              balanceDue: lessonBalanceDue,
              cashier: cashier || 'Cashier',
              lessonId: newLessonId,
              notes: `Lesson #${finalLessonNumber} | Instructor: ${instructorDoc ? instructorDoc.name : 'Unassigned'}`
            }
          ],
          { session }
        );

        lesson.billId = openBill._id;
        lesson.billNumber = openBill.billNumber;
        await lesson.save({ session });
      } catch (billCreateErr) {
        console.warn('Could not create open bill for lesson:', billCreateErr.message);
      }

      createdLesson = lesson;
    });

    res.status(201).json(createdLesson);
  } catch (error) {
    console.error('Walk-in lesson create error:', error.message);
    res.status(error.statusCode || 500).json({ message: error.message || 'Could not register lesson' });
  } finally {
    await session.endSession();
  }
});

// Update lesson status (Completed or Cancelled) with safe conditional board release
app.patch('/api/lessons/:id/status', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid lesson ID' });
    }

    const { status, cancelReason, paymentStatus, paymentMethod } = req.body;
    if (!['Completed', 'Cancelled'].includes(status)) {
      return res.status(400).json({ message: 'Status must be either Completed or Cancelled' });
    }

    const session = await mongoose.startSession();
    try {
      let updatedLesson = null;
      await session.withTransaction(async () => {
        const lesson = await Lesson.findById(req.params.id).session(session);
        if (!lesson) {
          const err = new Error('Lesson not found');
          err.statusCode = 404;
          throw err;
        }

        if (lesson.status !== 'In Progress') {
          const err = new Error(`Lesson is already marked as ${lesson.status}`);
          err.statusCode = 400;
          throw err;
        }

        const now = new Date();
        const nowIso = now.toISOString();
        const dateStr = nowIso.split('T')[0];
        const timeStr = now.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        });

        if (status === 'Completed') {
          lesson.status = 'Completed';
          lesson.completedAt = nowIso;
          lesson.completedTimestamp = now.getTime();

          // Completing lesson does NOT automatically mark it as paid!
          if (paymentStatus || req.body.paidAmount !== undefined) {
            const pStatus = paymentStatus || (Number(req.body.paidAmount) > 0 ? 'Partially Paid' : 'Unpaid');
            if (!['Paid', 'Partially Paid', 'Unpaid'].includes(pStatus)) {
              const err = new Error('Invalid payment status');
              err.statusCode = 400;
              throw err;
            }

            const currentPaid = lesson.totalPaid || 0;
            const remaining = Math.max(0, lesson.total - currentPaid);

            if (pStatus === 'Paid') {
              const paying = req.body.paidAmount !== undefined ? Math.min(remaining, Number(req.body.paidAmount)) : remaining;
              lesson.totalPaid = currentPaid + paying;
              lesson.balanceDue = Math.max(0, lesson.total - lesson.totalPaid);
              lesson.paymentStatus = lesson.balanceDue === 0 ? 'Paid' : 'Partially Paid';
              if (paying > 0) {
                const slNow = getSriLankaDateTime();
                lesson.paymentRecordedAt = slNow.isoStr;
                await Payment.create(
                  [
                    {
                      sourceType: 'Lesson',
                      sourceId: lesson._id,
                      sourceReference: lesson.lessonNumber,
                      customerName: lesson.customerName,
                      customerContact: lesson.customerContact || '',
                      amount: paying,
                      paymentMethod: paymentMethod || lesson.paymentMethod || 'Cash',
                      paymentDate: slNow.dateStr,
                      paymentTime: slNow.timeStr,
                      paymentTimestamp: slNow.timestamp,
                      cashier: req.body.cashier || 'Cashier',
                      notes: req.body.notes || 'Lesson completion payment'
                    }
                  ],
                  { session }
                );
              }
            } else if (pStatus === 'Partially Paid') {
              const paying = Math.min(remaining, Math.max(0, Number(req.body.paidAmount) || 0));
              lesson.totalPaid = currentPaid + paying;
              lesson.balanceDue = Math.max(0, lesson.total - lesson.totalPaid);
              lesson.paymentStatus = lesson.balanceDue === 0 ? 'Paid' : (lesson.totalPaid > 0 ? 'Partially Paid' : 'Unpaid');
              if (paying > 0) {
                const slNow = getSriLankaDateTime();
                lesson.paymentRecordedAt = slNow.isoStr;
                await Payment.create(
                  [
                    {
                      sourceType: 'Lesson',
                      sourceId: lesson._id,
                      sourceReference: lesson.lessonNumber,
                      customerName: lesson.customerName,
                      customerContact: lesson.customerContact || '',
                      amount: paying,
                      paymentMethod: paymentMethod || lesson.paymentMethod || 'Cash',
                      paymentDate: slNow.dateStr,
                      paymentTime: slNow.timeStr,
                      paymentTimestamp: slNow.timestamp,
                      cashier: req.body.cashier || 'Cashier',
                      notes: req.body.notes || 'Lesson completion partial payment'
                    }
                  ],
                  { session }
                );
              }
            } else {
              // Unpaid
              lesson.paymentStatus = 'Unpaid';
              lesson.balanceDue = lesson.total - currentPaid;
            }
          } else {
            // Keep existing paymentStatus and calculate balanceDue if not set
            if (lesson.balanceDue === undefined) {
              const curPaid = lesson.totalPaid || (lesson.paymentStatus === 'Paid' ? lesson.total : 0);
              lesson.totalPaid = curPaid;
              lesson.balanceDue = Math.max(0, lesson.total - curPaid);
            }
          }
          if (paymentMethod) {
            lesson.paymentMethod = paymentMethod;
          }
        } else if (status === 'Cancelled') {
          lesson.status = 'Cancelled';
          lesson.cancelledAt = nowIso;
          lesson.cancelReason = cancelReason?.trim() || 'Cancelled by staff';
        }

        // Safe conditional release of assigned boards:
        // ONLY release boards that have status === 'In Lesson' AND currentLessonId === lesson._id.toString()
        if (Array.isArray(lesson.assignedBoards) && lesson.assignedBoards.length > 0) {
          const boardIds = lesson.assignedBoards.map((b) => b.boardId);
          await Surfboard.updateMany(
            {
              _id: { $in: boardIds },
              status: 'In Lesson',
              currentLessonId: lesson._id.toString()
            },
            {
              $set: {
                status: 'Available',
                currentLessonId: '',
                currentCustomer: '',
                rentalStartTime: '',
                lastReturnedTime: `${dateStr} ${timeStr}`
              }
            },
            { session }
          );
        }

        await lesson.save({ session });

        // Sync linked Open Bill
        try {
          const linkedBill = lesson.billId
            ? await Bill.findById(lesson.billId).session(session)
            : await Bill.findOne({ lessonId: lesson._id }).session(session);

          if (linkedBill && linkedBill.status === 'Open') {
            if (status === 'Completed') {
              if (lesson.paymentStatus === 'Paid') {
                linkedBill.status = 'Settled';
                linkedBill.paymentStatus = 'Paid';
                linkedBill.totalPaid = linkedBill.total;
                linkedBill.balanceDue = 0;
                linkedBill.closedAt = nowIso;
                await linkedBill.save({ session });
              }
            } else if (status === 'Cancelled') {
              linkedBill.status = 'Cancelled';
              linkedBill.notes = (linkedBill.notes || '') + ` [Lesson Cancelled: ${cancelReason || 'Cancelled'}]`;
              await linkedBill.save({ session });
            }
          }
        } catch (bErr) {
          console.warn('Lesson bill status sync notice:', bErr.message);
        }

        updatedLesson = lesson;
      });

      res.json(updatedLesson);
    } catch (error) {
      console.error('Update lesson status error:', error.message);
      res.status(error.statusCode || 500).json({ message: error.message || 'Could not update lesson status' });
    } finally {
      await session.endSession();
    }
  } catch (outerError) {
    console.error('Lesson status route error:', outerError.message);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Helper to resolve the single canonical King Coconut inventory item
async function getCanonicalKingCoconutItem(sessionOpt) {
  // 1. Try active item with canonical code 'D03'
  let item = await InventoryItem.findOne(
    { code: 'D03', isActive: { $ne: false }, isArchived: { $ne: true } },
    null,
    sessionOpt
  );
  if (item) return item;

  // 2. Try active item having code 'F01' or legacyCodes containing 'D03' or 'F01'
  item = await InventoryItem.findOne(
    {
      $or: [{ code: 'F01' }, { legacyCodes: { $in: ['D03', 'F01'] } }],
      isActive: { $ne: false },
      isArchived: { $ne: true }
    },
    null,
    sessionOpt
  );
  if (item) return item;

  // 3. Fallback to any active item named King Coconut
  item = await InventoryItem.findOne(
    {
      productName: { $regex: /King Coconut/i },
      isActive: { $ne: false },
      isArchived: { $ne: true }
    },
    null,
    sessionOpt
  );
  if (item) return item;

  // 4. Fallback to any item with code D03, F01, or legacyCodes
  return await InventoryItem.findOne(
    { $or: [{ code: 'D03' }, { code: 'F01' }, { legacyCodes: { $in: ['D03', 'F01'] } }] },
    null,
    sessionOpt
  );
}

// Issue complimentary King Coconut with atomic inventory deduction & StockMovement creation
app.post('/api/lessons/:id/issue-coconut', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid lesson ID' });
    }

    const session = await mongoose.startSession();
    try {
      let result = null;
      await session.withTransaction(async () => {
        const lesson = await Lesson.findById(req.params.id).session(session);
        if (!lesson) {
          const err = new Error('Lesson not found');
          err.statusCode = 404;
          throw err;
        }

        if (lesson.status === 'Cancelled') {
          const err = new Error('Cannot issue King Coconut for a cancelled lesson');
          err.statusCode = 400;
          throw err;
        }

        const students = Math.max(1, Number(lesson.studentCount) || 1);
        const reqQty = req.body.quantity !== undefined ? Number(req.body.quantity) : 1;

        if (!Number.isInteger(reqQty) || reqQty < 1) {
          const err = new Error('Issuance quantity must be a whole positive number (at least 1)');
          err.statusCode = 400;
          throw err;
        }

        const alreadyIssued = Number(lesson.coconutsIssuedCount) || (lesson.coconutIssued ? 1 : 0);
        if (alreadyIssued + reqQty > students) {
          const err = new Error(
            `Cannot issue ${reqQty} coconut(s). Lesson #${lesson.lessonNumber} has ${students} student(s) and ${alreadyIssued} already issued.`
          );
          err.statusCode = 409;
          throw err;
        }

        const coconutItem = await getCanonicalKingCoconutItem({ session });
        if (!coconutItem) {
          const err = new Error('Canonical King Coconut inventory item not found in database');
          err.statusCode = 404;
          throw err;
        }

        if (coconutItem.currentQuantity < reqQty) {
          const err = new Error(
            `Insufficient King Coconut stock in inventory (Requested: ${reqQty}, Available: ${coconutItem.currentQuantity})`
          );
          err.statusCode = 400;
          throw err;
        }

        // Atomic stock decrement
        const updatedItem = await InventoryItem.findOneAndUpdate(
          { _id: coconutItem._id, currentQuantity: { $gte: reqQty } },
          { $inc: { currentQuantity: -reqQty } },
          { session, returnDocument: 'after' }
        );

        if (!updatedItem) {
          const err = new Error('Concurrent stock deduction conflict. Insufficient King Coconut stock');
          err.statusCode = 409;
          throw err;
        }

        const nowIso = new Date().toISOString();
        const performedBy = req.body.cashier || 'Cashier';
        const unitCost = Number(coconutItem.unitCost) || 150;
        const totalCost = unitCost * reqQty;

        // Create StockMovement with type 'Adjustment'
        const [movement] = await StockMovement.create(
          [
            {
              itemId: coconutItem._id,
              productName: coconutItem.productName,
              productCode: coconutItem.code,
              type: 'Adjustment',
              quantityChange: -reqQty,
              balanceAfter: updatedItem.currentQuantity,
              unitCost,
              totalCost,
              reason: `Complimentary Lesson Coconut (Lesson #${lesson.lessonNumber}, ${reqQty} unit(s) for ${lesson.customerName})`,
              performedBy,
              notes: req.body.notes || `Issued to customer: ${lesson.customerName}`,
              timestamp: nowIso
            }
          ],
          { session }
        );

        // Record issuance on lesson
        lesson.coconutIssued = true;
        lesson.coconutsIssuedCount = alreadyIssued + reqQty;
        lesson.coconutDeclined = false;
        lesson.coconutIssuedAt = nowIso;
        lesson.coconutIssuedBy = performedBy;
        lesson.coconutMovementId = movement._id;

        await lesson.save({ session });

        result = {
          message: `${reqQty} King Coconut(s) issued successfully`,
          lesson,
          stockMovement: movement,
          newCoconutStock: updatedItem.currentQuantity,
          issuedCount: lesson.coconutsIssuedCount
        };
      });

      res.status(200).json(result);
    } catch (error) {
      console.error('Issue coconut error:', error.message);
      res.status(error.statusCode || 500).json({ message: error.message || 'Could not issue King Coconut' });
    } finally {
      await session.endSession();
    }
  } catch (outerError) {
    console.error('Issue coconut route error:', outerError.message);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Record customer declined complimentary King Coconut (0 stock deducted, 0 movement)
app.post('/api/lessons/:id/decline-coconut', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid lesson ID' });
    }

    const lesson = await Lesson.findById(req.params.id);
    if (!lesson) {
      return res.status(404).json({ message: 'Lesson not found' });
    }

    if (lesson.status === 'Cancelled') {
      return res.status(400).json({ message: 'Cannot update a cancelled lesson' });
    }

    if (lesson.coconutIssued) {
      return res.status(400).json({ message: 'King Coconut has already been issued for this lesson' });
    }

    lesson.coconutDeclined = true;
    lesson.coconutsIssuedCount = 0;
    lesson.coconutNotes = req.body.notes || 'Customer declined complimentary King Coconut';
    await lesson.save();

    res.json({ message: 'Customer marked as declined King Coconut', lesson });
  } catch (error) {
    console.error('Decline coconut error:', error.message);
    res.status(500).json({ message: 'Could not record coconut decline: ' + error.message });
  }
});

// Record payment for a lesson (partial or full)
async function handleLessonPayment(req, res) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid lesson ID' });
    }

    const { amount, paymentMethod, cashier, notes, idempotencyKey, paymentStatus } = req.body;

    const session = await mongoose.startSession();
    try {
      let result = null;
      await session.withTransaction(async () => {
        const lesson = await Lesson.findById(req.params.id).session(session);
        if (!lesson) {
          const err = new Error('Lesson not found');
          err.statusCode = 404;
          throw err;
        }

        if (lesson.status === 'Cancelled') {
          const err = new Error('Cannot record payment for a cancelled lesson');
          err.statusCode = 400;
          throw err;
        }

        const currentTotal = lesson.total || 0;
        const currentPaid = lesson.totalPaid !== undefined ? lesson.totalPaid : (lesson.paymentStatus === 'Paid' ? currentTotal : 0);
        const currentBalance = Math.max(0, currentTotal - currentPaid);

        let paymentAmount = Number(amount);
        // If amount was not explicitly passed but paymentStatus === 'Paid' was passed (legacy compatibility)
        if ((!paymentAmount || paymentAmount <= 0) && paymentStatus === 'Paid') {
          paymentAmount = currentBalance;
        }

        if (!paymentAmount || paymentAmount <= 0) {
          const err = new Error('Payment amount must be greater than zero');
          err.statusCode = 400;
          throw err;
        }

        if (currentBalance <= 0) {
          const err = new Error(`Lesson #${lesson.lessonNumber} is already fully paid`);
          err.statusCode = 400;
          throw err;
        }

        if (paymentAmount > currentBalance) {
          const err = new Error(`Payment amount (Rs. ${paymentAmount}) exceeds outstanding balance (Rs. ${currentBalance})`);
          err.statusCode = 400;
          throw err;
        }

        // Idempotency check
        if (idempotencyKey) {
          const existingPay = await Payment.findOne({ idempotencyKey }).session(session);
          if (existingPay) {
            result = { lesson, payment: existingPay, alreadyProcessed: true };
            return;
          }
        }

        const slNow = getSriLankaDateTime();
        const newTotalPaid = currentPaid + paymentAmount;
        const newBalanceDue = Math.max(0, currentTotal - newTotalPaid);

        lesson.totalPaid = newTotalPaid;
        lesson.balanceDue = newBalanceDue;
        lesson.paymentStatus = newBalanceDue === 0 ? 'Paid' : 'Partially Paid';
        lesson.paymentRecordedAt = slNow.isoStr;
        if (paymentMethod) {
          lesson.paymentMethod = paymentMethod;
        }

        await lesson.save({ session });

        const [paymentDoc] = await Payment.create(
          [
            {
              sourceType: 'Lesson',
              sourceId: lesson._id,
              sourceReference: lesson.lessonNumber,
              customerName: lesson.customerName,
              customerContact: lesson.customerContact || '',
              amount: paymentAmount,
              paymentMethod: paymentMethod || lesson.paymentMethod || 'Cash',
              paymentDate: slNow.dateStr,
              paymentTime: slNow.timeStr,
              paymentTimestamp: slNow.timestamp,
              cashier: cashier || 'Cashier',
              notes: notes || 'Lesson payment',
              ...(idempotencyKey ? { idempotencyKey } : {})
            }
          ],
          { session }
        );

        result = { lesson, payment: paymentDoc };
      });

      res.json(result.lesson || result);
    } catch (error) {
      console.error('Lesson payment error:', error.message);
      res.status(error.statusCode || 500).json({ message: error.message || 'Could not record lesson payment' });
    } finally {
      await session.endSession();
    }
  } catch (outerError) {
    console.error('Lesson payment outer error:', outerError.message);
    res.status(500).json({ message: 'Internal server error' });
  }
}

app.post('/api/lessons/:id/payment', handleLessonPayment);
app.patch('/api/lessons/:id/payment', handleLessonPayment);

// ============================================================
// SERVER INITIALIZATION
// ============================================================
const DEFAULT_MONGODB_URI =
  'mongodb+srv://catamaran_app_user:CatamaranPosSystem@cluster0.xopp0.mongodb.net/catamaran_pos?retryWrites=true&w=majority';

async function startServer() {
  try {
    const mongoUri = process.env.MONGODB_URI || DEFAULT_MONGODB_URI;

    try {
      await mongoose.connect(mongoUri, {
        serverSelectionTimeoutMS: 5000,
        retryWrites: false
      });
      console.log('MongoDB connected successfully to Atlas database');
    } catch (primaryErr) {
      console.warn(
        'Primary MongoDB connection failed (' +
          primaryErr.message +
          '). Attempting local MongoDB fallback (mongodb://127.0.0.1:27017/catamaran_pos)...'
      );
      await mongoose.connect('mongodb://127.0.0.1:27017/catamaran_pos', {
        serverSelectionTimeoutMS: 3000,
        retryWrites: false
      });
      console.log('Connected to Local MongoDB fallback successfully');
    }

    await checkReplicaSetSupport();
    console.log('MongoDB connection established');

    const server = app.listen(PORT, '127.0.0.1', () => {
      console.log(`Backend running at http://127.0.0.1:${PORT}`);
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`Port ${PORT} is already in use by another instance. POS terminal will connect to active backend.`);
      } else {
        console.error('Backend server error:', err);
      }
    });
  } catch (error) {
    console.error('Backend startup failed. Check MongoDB settings and Atlas access.');
    console.error(error.message);
  }
}

startServer();
