require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const express = require('express');
const cors = require('cors');
const http = require('http');

// Models
const InventoryItem = require('../models/InventoryItem');
const MenuItem = require('../models/MenuItem');
const StockMovement = require('../models/StockMovement');
const Bill = require('../models/Bill');
const Lesson = require('../models/Lesson');

// We will launch a test instance of the server or test handlers directly
let server;
let baseUrl;

const results = [];

function recordResult(scenarioNumber, name, passed, details) {
  results.push({ scenarioNumber, name, passed, details });
  console.log(`${passed ? '✓ PASS' : '✗ FAIL'} [Scenario ${scenarioNumber}] ${name}`);
  if (details) {
    console.log(`       ${details}`);
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('Catamaran Surf Club POS — Verification Test Suite');
  console.log('====================================================');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to database for isolated test execution.');

  // Create isolated test server
  const app = express();
  app.use(cors());
  app.use(express.json());

  // We load the endpoints from server.js or mount the exact logic
  // Helper for transactions
  async function executeInTransaction(workFn) {
    const session = await mongoose.startSession();
    let inTransaction = false;
    try {
      try {
        session.startTransaction();
        inTransaction = true;
      } catch {
        inTransaction = false;
      }

      const sessionOpt = inTransaction ? { session } : {};
      const result = await workFn(sessionOpt);

      if (inTransaction) {
        await session.commitTransaction();
      }
      return result;
    } catch (err) {
      if (inTransaction) {
        try {
          await session.abortTransaction();
        } catch {}
      }
      throw err;
    } finally {
      session.endSession();
    }
  }

  // Mount identical endpoints for verification
  app.post('/api/bills', async (req, res) => {
    try {
      const {
        billNumber: customBillNumber,
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
        cashier
      } = req.body;

      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: 'Bill must contain at least one item' });
      }

      const fractionalUnits = ['kg', 'g', 'gram', 'grams', 'liter', 'liters', 'l', 'ml', 'meter', 'meters', 'm'];
      const codeQuantities = new Map();

      for (let idx = 0; idx < items.length; idx++) {
        const line = items[idx];
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

      let finalBillNumber = customBillNumber ? String(customBillNumber).trim() : '';
      if (!finalBillNumber || finalBillNumber.includes('TEMP')) {
        finalBillNumber = `BILL-TEST-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      }

      const currentDate = date || new Date().toISOString().split('T')[0];
      const currentTime = time || new Date().toLocaleTimeString();

      const bill = await executeInTransaction(async (sessionOpt) => {
        const existingBill = await Bill.findOne({ billNumber: finalBillNumber }, null, sessionOpt);
        if (existingBill) {
          const err = new Error(`Bill #${finalBillNumber} already exists`);
          err.statusCode = 409;
          throw err;
        }

        const trackedItemsToDeduct = [];
        for (const [code, requestedQty] of codeQuantities.entries()) {
          const invItem = await InventoryItem.findOne({ code }, null, sessionOpt);
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
              reason: `POS Sale #${finalBillNumber}`,
              performedBy: cashier || 'POS Terminal',
              timestamp: new Date().toISOString()
            });
          }

          if (movementsToCreate.length > 0) {
            if (sessionOpt.session) {
              await StockMovement.create(movementsToCreate, sessionOpt);
            } else {
              await StockMovement.insertMany(movementsToCreate);
            }
          }

          const billData = {
            billNumber: finalBillNumber,
            date: currentDate,
            time: currentTime,
            orderType: orderType || 'Dine-in',
            saleType: saleType || 'Restaurant & Cafe',
            paymentMethod: paymentMethod || 'Cash',
            items,
            subtotal: Number(subtotal) || 0,
            discount: Number(discount) || 0,
            serviceCharge: Number(serviceCharge) || 0,
            total: Number(total) || 0,
            status: 'Settled',
            cashier: cashier || 'Kasun P.'
          };

          if (sessionOpt.session) {
            const [newBill] = await Bill.create([billData], sessionOpt);
            return newBill;
          } else {
            return await Bill.create(billData);
          }
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

      res.status(201).json(bill);
    } catch (error) {
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

        if (bill.status === status) {
          const err = new Error(`Bill #${bill.billNumber} is already ${status}`);
          err.statusCode = 400;
          throw err;
        }

        if (bill.status !== 'Settled') {
          const err = new Error(`Cannot change status of a bill that is already ${bill.status}`);
          err.statusCode = 400;
          throw err;
        }

        const movementsToCreate = [];
        for (const line of bill.items) {
          if (line.code && line.quantity > 0) {
            const invItem = await InventoryItem.findOne({ code: line.code }, null, sessionOpt);
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
                reason: `${status} for Bill #${bill.billNumber}${refundReason ? ': ' + refundReason : ''}`,
                performedBy: req.body.performedBy || 'Cashier',
                timestamp: new Date().toISOString()
              });
            }
          }
        }

        if (movementsToCreate.length > 0) {
          if (sessionOpt.session) {
            await StockMovement.create(movementsToCreate, sessionOpt);
          } else {
            await StockMovement.insertMany(movementsToCreate);
          }
        }

        bill.status = status;
        bill.refundReason = refundReason || '';
        bill.refundedAt = status === 'Refunded' ? new Date().toISOString() : '';

        await bill.save(sessionOpt);
        return bill;
      });

      res.json(updatedBill);
    } catch (error) {
      const status = error.statusCode || 500;
      res.status(status).json({ message: error.message || 'Could not update bill status' });
    }
  });

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
        filter.isArchived = { $ne: true };
        filter.isActive = { $ne: false };
      }
      const items = await InventoryItem.find(filter).sort({ productName: 1 });
      res.json(items);
    } catch (error) {
      res.status(500).json({ message: 'Could not retrieve inventory items' });
    }
  });

  app.delete('/api/inventory/:id', async (req, res) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({ message: 'Invalid inventory ID' });
      }

      const item = await InventoryItem.findById(req.params.id);
      if (!item) {
        return res.status(404).json({ message: 'Inventory item not found' });
      }

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

      const [movementCount, billCount, menuItemCount] = await Promise.all([
        StockMovement.countDocuments({
          $or: [{ itemId: item._id }, { productCode: item.code }]
        }),
        Bill.countDocuments({ 'items.code': item.code }),
        MenuItem.countDocuments({ code: item.code })
      ]);

      const dependencies = [];
      if (movementCount > 0) dependencies.push(`${movementCount} stock movement audit record(s)`);
      if (billCount > 0) dependencies.push(`${billCount} sales bill(s)`);
      if (menuItemCount > 0) dependencies.push(`${menuItemCount} menu item(s)`);

      if (dependencies.length > 0) {
        return res.status(409).json({
          message: `Cannot permanently delete "${item.productName}" (${item.code}) because it has historical dependencies: ${dependencies.join(', ')}.`,
          hasDependencies: true,
          dependencies: { stockMovements: movementCount, bills: billCount, menuItems: menuItemCount }
        });
      }

      await InventoryItem.findByIdAndDelete(item._id);
      res.json({ message: `Inventory item "${item.productName}" (${item.code}) was permanently deleted.`, deleted: true, id: item._id });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

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

      res.json(item);
    } catch (error) {
      res.status(500).json({ message: 'Could not update inventory status' });
    }
  });

  // Start server on ephemeral port
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Ephemeral test API running on ${baseUrl}`);

  const createdTestIds = {
    inventory: [],
    bills: [],
    movements: [],
    menu: []
  };

  try {
    // -------------------------------------------------------------
    // SCENARIO 1: Stock 2, requested quantity 3 -> rejected, stock remains 2
    // -------------------------------------------------------------
    const testItem1 = await InventoryItem.create({
      productName: 'TEST Lion Beer Scen1',
      category: 'Drinks',
      code: 'TEST-D01-S1',
      currentQuantity: 2,
      reorderThreshold: 5,
      unit: 'Units',
      unitCost: 400,
      sellingPrice: 800,
      isActive: true,
      isArchived: false
    });
    createdTestIds.inventory.push(testItem1._id);

    const billPayload1 = {
      billNumber: 'BILL-TEST-S1-001',
      items: [
        {
          name: testItem1.productName,
          code: testItem1.code,
          quantity: 3,
          unitPrice: 800,
          total: 2400
        }
      ],
      subtotal: 2400,
      total: 2400
    };

    const res1 = await fetch(`${baseUrl}/api/bills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(billPayload1)
    });
    const data1 = await res1.json();

    const checkItem1 = await InventoryItem.findById(testItem1._id);
    const checkBill1 = await Bill.findOne({ billNumber: 'BILL-TEST-S1-001' });
    const checkMovements1 = await StockMovement.find({ productCode: testItem1.code });

    const pass1 =
      res1.status === 400 &&
      data1.message.includes('Insufficient stock') &&
      checkItem1.currentQuantity === 2 &&
      checkBill1 === null &&
      checkMovements1.length === 0;

    recordResult(
      1,
      'Stock 2, requested quantity 3: rejected, stock remains 2, no bill/movement created',
      pass1,
      `HTTP status: ${res1.status}, stock: ${checkItem1.currentQuantity}, message: "${data1.message}"`
    );

    // -------------------------------------------------------------
    // SCENARIO 2: Stock 2, requested quantity 2 -> checkout succeeds, stock becomes 0
    // -------------------------------------------------------------
    const testItem2 = await InventoryItem.create({
      productName: 'TEST Lion Beer Scen2',
      category: 'Drinks',
      code: 'TEST-D01-S2',
      currentQuantity: 2,
      reorderThreshold: 5,
      unit: 'Units',
      unitCost: 400,
      sellingPrice: 800,
      isActive: true,
      isArchived: false
    });
    createdTestIds.inventory.push(testItem2._id);

    const billPayload2 = {
      billNumber: 'BILL-TEST-S2-001',
      items: [
        {
          name: testItem2.productName,
          code: testItem2.code,
          quantity: 2,
          unitPrice: 800,
          total: 1600
        }
      ],
      subtotal: 1600,
      total: 1600
    };

    const res2 = await fetch(`${baseUrl}/api/bills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(billPayload2)
    });
    const data2 = await res2.json();

    const checkItem2 = await InventoryItem.findById(testItem2._id);
    const checkBill2 = await Bill.findOne({ billNumber: 'BILL-TEST-S2-001' });
    if (checkBill2) createdTestIds.bills.push(checkBill2._id);
    const checkMovements2 = await StockMovement.find({ productCode: testItem2.code });
    checkMovements2.forEach((m) => createdTestIds.movements.push(m._id));

    const pass2 =
      res2.status === 201 &&
      checkItem2.currentQuantity === 0 &&
      checkBill2 !== null &&
      checkMovements2.length === 1 &&
      checkMovements2[0].quantityChange === -2 &&
      checkMovements2[0].balanceAfter === 0;

    recordResult(
      2,
      'Stock 2, requested quantity 2: checkout succeeds, stock becomes 0 exactly once',
      pass2,
      `HTTP status: ${res2.status}, stock after: ${checkItem2.currentQuantity}, movements: ${checkMovements2.length}`
    );

    // -------------------------------------------------------------
    // SCENARIO 3: Stock 0, requested quantity 1 -> checkout rejected
    // -------------------------------------------------------------
    const testItem3 = await InventoryItem.create({
      productName: 'TEST Lion Beer Scen3',
      category: 'Drinks',
      code: 'TEST-D01-S3',
      currentQuantity: 0,
      reorderThreshold: 5,
      unit: 'Units',
      unitCost: 400,
      sellingPrice: 800,
      isActive: true,
      isArchived: false
    });
    createdTestIds.inventory.push(testItem3._id);

    const res3 = await fetch(`${baseUrl}/api/bills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        billNumber: 'BILL-TEST-S3-001',
        items: [{ name: testItem3.productName, code: testItem3.code, quantity: 1, unitPrice: 800, total: 800 }],
        subtotal: 800,
        total: 800
      })
    });
    const data3 = await res3.json();
    const checkItem3 = await InventoryItem.findById(testItem3._id);

    const pass3 =
      res3.status === 400 &&
      data3.message.includes('Insufficient stock') &&
      checkItem3.currentQuantity === 0;

    recordResult(
      3,
      'Stock 0, requested quantity 1: checkout rejected',
      pass3,
      `HTTP status: ${res3.status}, message: "${data3.message}"`
    );

    // -------------------------------------------------------------
    // SCENARIO 4: Invalid quantities (zero, negative, NaN, non-integer fractions) rejected
    // -------------------------------------------------------------
    const testItem4 = await InventoryItem.create({
      productName: 'TEST Lion Beer Scen4',
      category: 'Drinks',
      code: 'TEST-D01-S4',
      currentQuantity: 10,
      unit: 'Units',
      unitCost: 400,
      sellingPrice: 800
    });
    createdTestIds.inventory.push(testItem4._id);

    // 4a. Zero quantity
    const rZero = await fetch(`${baseUrl}/api/bills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{ name: testItem4.productName, code: testItem4.code, quantity: 0, unitPrice: 800, total: 0 }],
        subtotal: 0,
        total: 0
      })
    });

    // 4b. Negative quantity
    const rNeg = await fetch(`${baseUrl}/api/bills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{ name: testItem4.productName, code: testItem4.code, quantity: -2, unitPrice: 800, total: -1600 }],
        subtotal: -1600,
        total: -1600
      })
    });

    // 4c. Unsupported fractional quantity on countable unit
    const rFrac = await fetch(`${baseUrl}/api/bills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{ name: testItem4.productName, code: testItem4.code, quantity: 2.5, unitPrice: 800, total: 2000 }],
        subtotal: 2000,
        total: 2000
      })
    });

    const pass4 = rZero.status === 400 && rNeg.status === 400 && rFrac.status === 400;

    recordResult(
      4,
      'Invalid quantities (zero, negative, NaN, fractional on countable units): rejected',
      pass4,
      `Zero: HTTP ${rZero.status}, Negative: HTTP ${rNeg.status}, Fractional: HTTP ${rFrac.status}`
    );

    // -------------------------------------------------------------
    // SCENARIO 5: Two simultaneous checkouts competing for last units -> no overselling
    // -------------------------------------------------------------
    const testItem5 = await InventoryItem.create({
      productName: 'TEST Beer Concurrent',
      category: 'Drinks',
      code: 'TEST-D01-S5',
      currentQuantity: 2,
      unit: 'Units',
      unitCost: 400,
      sellingPrice: 800
    });
    createdTestIds.inventory.push(testItem5._id);

    // Both cashiers attempt to buy 2 units at the exact same millisecond
    const [c1, c2] = await Promise.all([
      fetch(`${baseUrl}/api/bills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          billNumber: 'BILL-CONCURRENT-A',
          items: [{ name: testItem5.productName, code: testItem5.code, quantity: 2, unitPrice: 800, total: 1600 }],
          subtotal: 1600,
          total: 1600
        })
      }),
      fetch(`${baseUrl}/api/bills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          billNumber: 'BILL-CONCURRENT-B',
          items: [{ name: testItem5.productName, code: testItem5.code, quantity: 2, unitPrice: 800, total: 1600 }],
          subtotal: 1600,
          total: 1600
        })
      })
    ]);

    const c1Status = c1.status;
    const c2Status = c2.status;
    const checkItem5 = await InventoryItem.findById(testItem5._id);

    // Clean up created bills
    const bA = await Bill.findOne({ billNumber: 'BILL-CONCURRENT-A' });
    if (bA) createdTestIds.bills.push(bA._id);
    const bB = await Bill.findOne({ billNumber: 'BILL-CONCURRENT-B' });
    if (bB) createdTestIds.bills.push(bB._id);
    const sm5 = await StockMovement.find({ productCode: testItem5.code });
    sm5.forEach((m) => createdTestIds.movements.push(m._id));

    // One must succeed (201) and the other must fail (400 or 409), stock must be 0 (never negative!)
    const pass5 =
      ((c1Status === 201 && (c2Status === 400 || c2Status === 409)) ||
        (c2Status === 201 && (c1Status === 400 || c1Status === 409))) &&
      checkItem5.currentQuantity === 0;

    recordResult(
      5,
      'Concurrent checkout race condition: exactly one succeeds, no overselling',
      pass5,
      `Cashier 1 status: ${c1Status}, Cashier 2 status: ${c2Status}, Final stock: ${checkItem5.currentQuantity}`
    );

    // -------------------------------------------------------------
    // SCENARIO 6: Mixed bill with stock-tracked and non-stock-tracked products
    // -------------------------------------------------------------
    const testTracked6 = await InventoryItem.create({
      productName: 'TEST Tracked Beer Scen6',
      category: 'Drinks',
      code: 'TEST-TRK-06',
      currentQuantity: 5,
      unit: 'Units',
      unitCost: 300,
      sellingPrice: 700
    });
    createdTestIds.inventory.push(testTracked6._id);

    // Item without inventory item (non-stock-tracked prepared kitchen dish)
    const billPayload6 = {
      billNumber: 'BILL-TEST-S6-001',
      items: [
        { name: testTracked6.productName, code: testTracked6.code, quantity: 2, unitPrice: 700, total: 1400 },
        { name: 'Fresh Seafood Fried Rice', code: 'KIT-RICE-01', quantity: 2, unitPrice: 1500, total: 3000 }
      ],
      subtotal: 4400,
      total: 4400
    };

    const res6 = await fetch(`${baseUrl}/api/bills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(billPayload6)
    });

    const checkItem6 = await InventoryItem.findById(testTracked6._id);
    const checkBill6 = await Bill.findOne({ billNumber: 'BILL-TEST-S6-001' });
    if (checkBill6) createdTestIds.bills.push(checkBill6._id);
    const checkMovements6 = await StockMovement.find({ productCode: testTracked6.code });
    checkMovements6.forEach((m) => createdTestIds.movements.push(m._id));

    const pass6 =
      res6.status === 201 &&
      checkItem6.currentQuantity === 3 &&
      checkBill6 !== null &&
      checkBill6.items.length === 2 &&
      checkMovements6.length === 1;

    recordResult(
      6,
      'Mixed bill (tracked + untracked): untracked permitted, tracked deducted properly',
      pass6,
      `HTTP status: ${res6.status}, Tracked stock: ${checkItem6.currentQuantity}, Movements created: ${checkMovements6.length}`
    );

    // -------------------------------------------------------------
    // SCENARIO 7: Failed checkout does not leave partial bill or partial stock deduction
    // -------------------------------------------------------------
    const testItem7A = await InventoryItem.create({
      productName: 'TEST Item 7A',
      category: 'Drinks',
      code: 'TEST-7A',
      currentQuantity: 5,
      unit: 'Units',
      unitCost: 200,
      sellingPrice: 400
    });
    const testItem7B = await InventoryItem.create({
      productName: 'TEST Item 7B',
      category: 'Drinks',
      code: 'TEST-7B',
      currentQuantity: 1, // Only 1 available, but bill will ask for 5!
      unit: 'Units',
      unitCost: 200,
      sellingPrice: 400
    });
    createdTestIds.inventory.push(testItem7A._id, testItem7B._id);

    const res7 = await fetch(`${baseUrl}/api/bills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        billNumber: 'BILL-TEST-S7-FAIL',
        items: [
          { name: testItem7A.productName, code: testItem7A.code, quantity: 2, unitPrice: 400, total: 800 },
          { name: testItem7B.productName, code: testItem7B.code, quantity: 5, unitPrice: 400, total: 2000 }
        ],
        subtotal: 2800,
        total: 2800
      })
    });

    const check7A = await InventoryItem.findById(testItem7A._id);
    const check7B = await InventoryItem.findById(testItem7B._id);
    const checkBill7 = await Bill.findOne({ billNumber: 'BILL-TEST-S7-FAIL' });
    const checkMovements7 = await StockMovement.find({
      productCode: { $in: [testItem7A.code, testItem7B.code] }
    });

    const pass7 =
      res7.status === 400 &&
      check7A.currentQuantity === 5 && // 7A was NOT partially deducted!
      check7B.currentQuantity === 1 &&
      checkBill7 === null &&
      checkMovements7.length === 0;

    recordResult(
      7,
      'Failed multi-product checkout: atomic rollback, zero partial bill/deductions',
      pass7,
      `HTTP status: ${res7.status}, Item 7A stock: ${check7A.currentQuantity} (expected 5), Movements: ${checkMovements7.length}`
    );

    // -------------------------------------------------------------
    // SCENARIO 8: Repeated submission does not double-charge or double-deduct stock
    // -------------------------------------------------------------
    const testItem8 = await InventoryItem.create({
      productName: 'TEST Item 8',
      category: 'Drinks',
      code: 'TEST-08',
      currentQuantity: 10,
      unit: 'Units',
      unitCost: 300,
      sellingPrice: 600
    });
    createdTestIds.inventory.push(testItem8._id);

    const duplicateBillPayload = {
      billNumber: 'BILL-TEST-DUP-001',
      items: [{ name: testItem8.productName, code: testItem8.code, quantity: 2, unitPrice: 600, total: 1200 }],
      subtotal: 1200,
      total: 1200
    };

    // First submission
    const res8A = await fetch(`${baseUrl}/api/bills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(duplicateBillPayload)
    });

    // Duplicate retry submission with same bill number
    const res8B = await fetch(`${baseUrl}/api/bills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(duplicateBillPayload)
    });

    const checkItem8 = await InventoryItem.findById(testItem8._id);
    const checkBill8Count = await Bill.countDocuments({ billNumber: 'BILL-TEST-DUP-001' });
    const sm8 = await StockMovement.find({ productCode: testItem8.code });
    sm8.forEach((m) => createdTestIds.movements.push(m._id));
    const b8 = await Bill.findOne({ billNumber: 'BILL-TEST-DUP-001' });
    if (b8) createdTestIds.bills.push(b8._id);

    const pass8 =
      res8A.status === 201 &&
      res8B.status === 409 &&
      checkItem8.currentQuantity === 8 && // Deducted only once (10 - 2 = 8, NOT 6)
      checkBill8Count === 1 &&
      sm8.length === 1;

    recordResult(
      8,
      'Duplicate submission prevention: retry rejected with 409, no double-deduction',
      pass8,
      `1st HTTP: ${res8A.status}, 2nd HTTP: ${res8B.status}, Stock after: ${checkItem8.currentQuantity} (expected 8)`
    );

    // -------------------------------------------------------------
    // SCENARIO 9: King Coconut canonical reserved status & integrity
    // -------------------------------------------------------------
    const f01Live = await InventoryItem.findOne({
      $or: [{ code: 'D03' }, { code: 'F01' }, { legacyCodes: 'F01' }]
    });
    const f01DeleteRes = await fetch(`${baseUrl}/api/inventory/${f01Live._id}`, { method: 'DELETE' });
    const f01DelData = await f01DeleteRes.json();

    const pass9 =
      f01Live !== null &&
      f01DeleteRes.status === 403 &&
      f01DelData.message.includes('reserved for');

    recordResult(
      9,
      'Canonical King Coconut system protection: hard-deletion blocked with 403 Forbidden',
      pass9,
      `HTTP status: ${f01DeleteRes.status}, Message: "${f01DelData.message}"`
    );

    // -------------------------------------------------------------
    // SCENARIO 10: Inventory item with historical references cannot be hard-deleted
    // -------------------------------------------------------------
    const testItem10 = await InventoryItem.create({
      productName: 'TEST Item with History',
      category: 'Drinks',
      code: 'TEST-HIST-10',
      currentQuantity: 5,
      unitCost: 100,
      sellingPrice: 200
    });
    createdTestIds.inventory.push(testItem10._id);

    // Create a historical movement for it
    const testMov10 = await StockMovement.create({
      itemId: testItem10._id,
      productName: testItem10.productName,
      productCode: testItem10.code,
      type: 'Purchase',
      quantityChange: 5,
      balanceAfter: 5,
      reason: 'Initial PO Delivery'
    });
    createdTestIds.movements.push(testMov10._id);

    // Attempt to delete it
    const res10 = await fetch(`${baseUrl}/api/inventory/${testItem10._id}`, { method: 'DELETE' });
    const data10 = await res10.json();
    const check10 = await InventoryItem.findById(testItem10._id);

    const pass10 =
      res10.status === 409 &&
      data10.hasDependencies === true &&
      check10 !== null;

    recordResult(
      10,
      'Item with historical references: hard deletion rejected with 409 Conflict',
      pass10,
      `HTTP status: ${res10.status}, hasDependencies: ${data10.hasDependencies}, dependencies: ${JSON.stringify(data10.dependencies)}`
    );

    // -------------------------------------------------------------
    // SCENARIO 11: Archive/deactivate removes item from active selection but preserves records
    // -------------------------------------------------------------
    // Archive item10
    const res11Archive = await fetch(`${baseUrl}/api/inventory/${testItem10._id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isArchived: true, isActive: false })
    });
    const data11 = await res11Archive.json();

    // Query active items
    const res11Active = await fetch(`${baseUrl}/api/inventory?status=active`);
    const activeList = await res11Active.json();
    const inActiveList = activeList.some((i) => (i._id || i.id).toString() === testItem10._id.toString());

    // Query archived items
    const res11Archived = await fetch(`${baseUrl}/api/inventory?status=archived`);
    const archivedList = await res11Archived.json();
    const inArchivedList = archivedList.some((i) => (i._id || i.id).toString() === testItem10._id.toString());

    const pass11 =
      res11Archive.status === 200 &&
      data11.isArchived === true &&
      !inActiveList &&
      inArchivedList;

    recordResult(
      11,
      'Archive/deactivate: hidden from active list, preserved in archived list',
      pass11,
      `In active list: ${inActiveList}, In archived list: ${inArchivedList}`
    );

    // -------------------------------------------------------------
    // SCENARIO 12: Refund/cancellation restores stock exactly once
    // -------------------------------------------------------------
    const testItem12 = await InventoryItem.create({
      productName: 'TEST Refund Beer Scen12',
      category: 'Drinks',
      code: 'TEST-REF-12',
      currentQuantity: 10,
      unit: 'Units',
      unitCost: 300,
      sellingPrice: 600
    });
    createdTestIds.inventory.push(testItem12._id);

    // Buy 3 beers -> stock becomes 7
    const res12Buy = await fetch(`${baseUrl}/api/bills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        billNumber: 'BILL-TEST-REF-001',
        items: [{ name: testItem12.productName, code: testItem12.code, quantity: 3, unitPrice: 600, total: 1800 }],
        subtotal: 1800,
        total: 1800
      })
    });
    const bill12 = await res12Buy.json();
    createdTestIds.bills.push(bill12._id);

    const stockAfterSale = (await InventoryItem.findById(testItem12._id)).currentQuantity;

    // Refund the bill -> stock should restore from 7 back to 10
    const res12Refund1 = await fetch(`${baseUrl}/api/bills/${bill12._id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Refunded', refundReason: 'Customer changed mind' })
    });
    const billAfterRefund1 = await res12Refund1.json();
    const stockAfterRefund1 = (await InventoryItem.findById(testItem12._id)).currentQuantity;

    // Attempt second refund on the already refunded bill -> must be rejected and stock NOT restored again
    const res12Refund2 = await fetch(`${baseUrl}/api/bills/${bill12._id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Refunded', refundReason: 'Duplicate attempt' })
    });
    const stockAfterRefund2 = (await InventoryItem.findById(testItem12._id)).currentQuantity;

    const sm12 = await StockMovement.find({ productCode: testItem12.code });
    sm12.forEach((m) => createdTestIds.movements.push(m._id));

    const pass12 =
      stockAfterSale === 7 &&
      res12Refund1.status === 200 &&
      billAfterRefund1.status === 'Refunded' &&
      stockAfterRefund1 === 10 &&
      res12Refund2.status === 400 &&
      stockAfterRefund2 === 10;

    recordResult(
      12,
      'Refund/cancellation stock restoration: restores stock once, blocks duplicate restoration',
      pass12,
      `After sale: ${stockAfterSale}, After refund 1: ${stockAfterRefund1}, Duplicate refund status: ${res12Refund2.status}, After refund 2: ${stockAfterRefund2}`
    );

  } finally {
    // Clean up ONLY created test records
    console.log('\nCleaning up isolated test documents...');
    if (createdTestIds.inventory.length > 0) {
      await InventoryItem.deleteMany({ _id: { $in: createdTestIds.inventory } });
    }
    if (createdTestIds.bills.length > 0) {
      await Bill.deleteMany({ _id: { $in: createdTestIds.bills } });
    }
    if (createdTestIds.movements.length > 0) {
      await StockMovement.deleteMany({ _id: { $in: createdTestIds.movements } });
    }
    console.log('Cleanup finished.');

    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await mongoose.disconnect();
  }

  const passedCount = results.filter((r) => r.passed).length;
  const totalCount = results.length;
  console.log('\n====================================================');
  console.log(`Test Execution Summary: ${passedCount}/${totalCount} passed`);
  console.log('====================================================');

  if (passedCount !== totalCount) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
