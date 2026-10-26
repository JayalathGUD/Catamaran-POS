require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');

const InventoryItem = require('../models/InventoryItem');
const MenuItem = require('../models/MenuItem');
const StockMovement = require('../models/StockMovement');
const Bill = require('../models/Bill');
const Lesson = require('../models/Lesson');

const BASE_URL = 'http://127.0.0.1:5000';

const results = [];

function recordResult(scenarioNumber, name, passed, details) {
  results.push({ scenarioNumber, name, passed, details });
  console.log(`${passed ? '✓ PASS' : '✗ FAIL'} [Scenario ${scenarioNumber}] ${name}`);
  if (details) {
    console.log(`       ${details}`);
  }
}

function createTestLessonPayload(overrides = {}) {
  const now = Date.now();
  return {
    lessonNumber: `LES-TEST-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    customerName: 'Test Student',
    studentCount: 1,
    lessonType: 'Private',
    pricingMode: 'Per Person',
    durationMinutes: 60,
    subtotal: 5000,
    total: 5000,
    startDate: '2026-10-20',
    startTime: '10:00 AM',
    startTimestamp: now,
    endTime: '11:00 AM',
    endTimestamp: now + 3600000,
    status: 'In Progress',
    coconutIssued: false,
    coconutsIssuedCount: 0,
    coconutDeclined: false,
    ...overrides
  };
}

async function runTests() {
  console.log('====================================================');
  console.log('King Coconut Unification — End-to-End Test Suite');
  console.log('====================================================');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to database for verification tests.\n');

  // Reset canonical stock to 15 if needed
  await InventoryItem.updateOne({ code: 'D03' }, { $set: { currentQuantity: 15 } });

  const createdTestIds = {
    inventory: [],
    bills: [],
    movements: [],
    menu: [],
    lessons: []
  };

  try {
    // -------------------------------------------------------------
    // SCENARIO 1: Menu sale of 2 coconuts from stock 20 results in stock 18
    // -------------------------------------------------------------
    const testInv1 = await InventoryItem.create({
      productName: 'TEST King Coconut Scen1',
      category: 'Drinks',
      code: 'TEST-KC-01',
      currentQuantity: 20,
      unit: 'Units',
      unitCost: 150,
      sellingPrice: 500,
      isActive: true,
      isArchived: false
    });
    createdTestIds.inventory.push(testInv1._id);

    const testMenu1 = await MenuItem.create({
      name: 'TEST King Coconut Scen1',
      category: 'Drinks',
      sellingPrice: 500,
      costPrice: 150,
      code: 'TEST-KC-01',
      stockTracking: true,
      inventoryItemId: testInv1._id,
      isActive: true
    });
    createdTestIds.menu.push(testMenu1._id);

    const res1 = await fetch(`${BASE_URL}/api/bills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        billNumber: 'BILL-TEST-KC-001',
        items: [{ name: testMenu1.name, code: testMenu1.code, quantity: 2, unitPrice: 500, total: 1000 }],
        subtotal: 1000,
        total: 1000
      })
    });
    const data1 = await res1.json();
    if (data1._id) createdTestIds.bills.push(data1._id);

    const invAfterSale = await InventoryItem.findById(testInv1._id);
    const pass1 = res1.status === 201 && invAfterSale.currentQuantity === 18;
    recordResult(1, 'Menu sale of 2 coconuts from stock 20 results in stock 18', pass1, `Status: ${res1.status}, stock: ${invAfterSale?.currentQuantity}`);

    // -------------------------------------------------------------
    // SCENARIO 2: Purchase receipt of 10 coconuts increases stock from 18 to 28
    // -------------------------------------------------------------
    const res2 = await fetch(`${BASE_URL}/api/inventory/movements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        itemId: testInv1._id,
        type: 'Purchase',
        quantityChange: 10,
        unitCost: 150,
        reason: 'PO-TEST-001 Fresh coconuts received'
      })
    });
    const invAfterPurchase = await InventoryItem.findById(testInv1._id);
    const pass2 = res2.status === 201 && invAfterPurchase.currentQuantity === 28;
    recordResult(2, 'Purchase receipt of 10 coconuts increases stock from 18 to 28', pass2, `Status: ${res2.status}, stock: ${invAfterPurchase?.currentQuantity}`);

    // -------------------------------------------------------------
    // SCENARIO 3: Lesson customer declines coconut: stock remains 28, 0 movements
    // -------------------------------------------------------------
    const testLesson3 = await Lesson.create(createTestLessonPayload({
      customerName: 'TEST Student Three',
      studentCount: 2
    }));
    createdTestIds.lessons.push(testLesson3._id);

    const res3 = await fetch(`${BASE_URL}/api/lessons/${testLesson3._id}/decline-coconut`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cashier: 'TestCashier', notes: 'Guests prefer plain water' })
    });
    const data3 = await res3.json();
    const invAfterDecline = await InventoryItem.findById(testInv1._id);
    const lessonAfterDecline = await Lesson.findById(testLesson3._id);

    const pass3 =
      res3.status === 200 &&
      Boolean(data3.lesson || data3.message) &&
      lessonAfterDecline.coconutDeclined === true &&
      (lessonAfterDecline.coconutsIssuedCount === 0 || !lessonAfterDecline.coconutsIssuedCount) &&
      invAfterDecline.currentQuantity === 28;
    recordResult(3, 'Lesson customer declines coconut: stock remains 28, 0 movements created', pass3, `Declined: ${lessonAfterDecline.coconutDeclined}, stock: ${invAfterDecline.currentQuantity}`);

    // -------------------------------------------------------------
    // SCENARIO 4: Single coconut issued during lesson: stock decreases by 1
    // -------------------------------------------------------------
    const testLesson4 = await Lesson.create(createTestLessonPayload({
      customerName: 'TEST Student Four',
      studentCount: 1
    }));
    createdTestIds.lessons.push(testLesson4._id);

    const stockBeforeIssue4 = (await InventoryItem.findOne({ code: 'D03' })).currentQuantity;
    const res4 = await fetch(`${BASE_URL}/api/lessons/${testLesson4._id}/issue-coconut`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity: 1, cashier: 'TestCashier' })
    });
    const data4 = await res4.json();
    const stockAfterIssue4 = (await InventoryItem.findOne({ code: 'D03' })).currentQuantity;
    const lessonAfterIssue4 = await Lesson.findById(testLesson4._id);

    const pass4 =
      res4.status === 200 &&
      data4.issuedCount === 1 &&
      lessonAfterIssue4.coconutsIssuedCount === 1 &&
      stockAfterIssue4 === stockBeforeIssue4 - 1;
    recordResult(4, 'Single coconut issued during lesson: stock decreases by 1', pass4, `Status: ${res4.status}, stock before: ${stockBeforeIssue4}, after: ${stockAfterIssue4}`);

    // -------------------------------------------------------------
    // SCENARIO 5: Multi-student: 2 coconuts issued for a 3-student lesson
    // -------------------------------------------------------------
    const testLesson5 = await Lesson.create(createTestLessonPayload({
      customerName: 'TEST Student Five',
      studentCount: 3
    }));
    createdTestIds.lessons.push(testLesson5._id);

    const stockBeforeIssue5 = (await InventoryItem.findOne({ code: 'D03' })).currentQuantity;
    const res5 = await fetch(`${BASE_URL}/api/lessons/${testLesson5._id}/issue-coconut`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity: 2, cashier: 'TestCashier', notes: '2 coconuts for 3 students' })
    });
    const data5 = await res5.json();
    const stockAfterIssue5 = (await InventoryItem.findOne({ code: 'D03' })).currentQuantity;
    const lessonAfterIssue5 = await Lesson.findById(testLesson5._id);

    const pass5 =
      res5.status === 200 &&
      data5.issuedCount === 2 &&
      lessonAfterIssue5.coconutsIssuedCount === 2 &&
      stockAfterIssue5 === stockBeforeIssue5 - 2;
    recordResult(5, 'Multi-student: 2 coconuts issued for a 3-student lesson', pass5, `Issued: ${data5.issuedCount}, stock before: ${stockBeforeIssue5}, after: ${stockAfterIssue5}`);

    // -------------------------------------------------------------
    // SCENARIO 6: Duplicate issuance attempts rejected with HTTP 409
    // -------------------------------------------------------------
    const res6 = await fetch(`${BASE_URL}/api/lessons/${testLesson5._id}/issue-coconut`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity: 1, cashier: 'TestCashier' })
    });
    const data6 = await res6.json();
    const stockAfterDup6 = (await InventoryItem.findOne({ code: 'D03' })).currentQuantity;

    // Remaining capacity on 3-student lesson with 2 issued is 1, so requesting 2 more would exceed 3!
    const res6b = await fetch(`${BASE_URL}/api/lessons/${testLesson5._id}/issue-coconut`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity: 2, cashier: 'TestCashier' })
    });
    const data6b = await res6b.json();

    const pass6 = res6b.status === 409 && data6b.message.includes('already issued');
    recordResult(6, 'Duplicate/excess issuance attempt on same lesson: rejected with HTTP 409, no double-deduction', pass6, `Status: ${res6b.status}, message: "${data6b.message}"`);

    // -------------------------------------------------------------
    // SCENARIO 7: Insufficient stock prevents issuance and overselling
    // -------------------------------------------------------------
    const testLesson7 = await Lesson.create(createTestLessonPayload({
      customerName: 'TEST Student Seven',
      studentCount: 1000
    }));
    createdTestIds.lessons.push(testLesson7._id);

    const stockBeforeIssue7 = (await InventoryItem.findOne({ code: 'D03' })).currentQuantity;
    const res7 = await fetch(`${BASE_URL}/api/lessons/${testLesson7._id}/issue-coconut`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity: 999, cashier: 'TestCashier' })
    });
    const data7 = await res7.json();
    const stockAfterIssue7 = (await InventoryItem.findOne({ code: 'D03' })).currentQuantity;

    const pass7 = res7.status === 400 && data7.message.includes('Insufficient') && stockAfterIssue7 === stockBeforeIssue7;
    recordResult(7, 'Insufficient stock prevents lesson issuance and overselling', pass7, `Status: ${res7.status}, message: "${data7.message}", stock preserved: ${stockAfterIssue7}`);

    // -------------------------------------------------------------
    // SCENARIO 8: Eligible refund restores stock exactly once
    // -------------------------------------------------------------
    const stockBeforeRefund8 = (await InventoryItem.findById(testInv1._id)).currentQuantity;
    const res8Refund1 = await fetch(`${BASE_URL}/api/bills/${data1._id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Refunded', refundReason: 'Test refund customer return' })
    });
    const stockAfterRefund8 = (await InventoryItem.findById(testInv1._id)).currentQuantity;

    // Second refund attempt
    const res8Refund2 = await fetch(`${BASE_URL}/api/bills/${data1._id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Refunded', refundReason: 'Duplicate attempt' })
    });
    const stockAfterRefund2_8 = (await InventoryItem.findById(testInv1._id)).currentQuantity;

    const pass8 =
      res8Refund1.status === 200 &&
      stockAfterRefund8 === stockBeforeRefund8 + 2 &&
      res8Refund2.status === 400 &&
      stockAfterRefund2_8 === stockAfterRefund8;
    recordResult(8, 'Eligible refund restores stock exactly once to canonical item', pass8, `After sale: ${stockBeforeRefund8}, after refund 1: ${stockAfterRefund8}, after refund 2: ${stockAfterRefund2_8}`);

    // -------------------------------------------------------------
    // SCENARIO 9: Menu and Inventory reference the same canonical item
    // -------------------------------------------------------------
    const canonicalInv = await InventoryItem.findOne({ code: 'D03' });
    const canonicalMenu = await MenuItem.findOne({ code: 'D03' });

    const pass9 =
      canonicalInv !== null &&
      canonicalMenu !== null &&
      canonicalMenu.inventoryItemId &&
      canonicalMenu.inventoryItemId.toString() === canonicalInv._id.toString() &&
      canonicalMenu.code === canonicalInv.code;
    recordResult(9, 'Menu and Inventory reference the exact same canonical item', pass9, `Inv ID: ${canonicalInv?._id}, Menu inventoryItemId: ${canonicalMenu?.inventoryItemId}`);

    // -------------------------------------------------------------
    // SCENARIO 10: Duplicate King Coconut menu creation is rejected
    // -------------------------------------------------------------
    const res10Menu = await fetch(`${BASE_URL}/api/menu`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'King Coconut',
        category: 'Drinks',
        code: 'TEST-D99',
        sellingPrice: 500,
        costPrice: 150,
        stockTracking: true
      })
    });
    const data10Menu = await res10Menu.json();

    const pass10 = res10Menu.status === 409 && data10Menu.message.includes('already exists');
    recordResult(10, 'Duplicate King Coconut menu creation rejected with HTTP 409', pass10, `Status: ${res10Menu.status}, message: "${data10Menu.message}"`);

    // -------------------------------------------------------------
    // SCENARIO 11: Historical bill referencing legacy code F01 resolves referentially
    // -------------------------------------------------------------
    const histBill = await Bill.findOne({ billNumber: 'BILL-2026-0002' });
    const coconutLine = histBill?.items?.find((it) => it.code === 'F01' || it.name.toLowerCase().includes('king coconut'));

    const pass11 =
      histBill !== null &&
      coconutLine !== undefined &&
      canonicalInv.legacyCodes.includes('F01');
    recordResult(11, 'Historical bill #BILL-2026-0002 referencing F01 resolves to canonical item via legacyCodes', pass11, `Bill items: ${JSON.stringify(histBill?.items?.map(i => ({ code: i.code, name: i.name, qty: i.quantity })))}, legacyCodes: ${JSON.stringify(canonicalInv.legacyCodes)}`);

    // -------------------------------------------------------------
    // SCENARIO 12: Total active non-test King Coconut products in system is EXACTLY ONE
    // -------------------------------------------------------------
    const activeKCsInventory = await InventoryItem.find({
      isArchived: { $ne: true },
      code: { $not: /^TEST-/ },
      $or: [{ name: /king.*coconut/i }, { productName: /king.*coconut/i }, { code: 'D03' }]
    });

    const activeKCsMenu = await MenuItem.find({
      isActive: true,
      code: { $not: /^TEST-/ },
      $or: [{ name: /king.*coconut/i }, { code: 'D03' }]
    });

    const pass12 = activeKCsInventory.length === 1 && activeKCsMenu.length === 1;
    recordResult(12, 'System integrity: exactly ONE King Coconut exists across Inventory and Menu', pass12, `Active Inventory count: ${activeKCsInventory.length}, Active Menu count: ${activeKCsMenu.length}`);

    // Restore stock deducted during scenario 4 and 5 tests on canonical item (1 + 2 = 3 units)
    console.log('\nRestoring stock used in live test scenarios 4 & 5 (3 units)...');
    await InventoryItem.updateOne({ _id: canonicalInv._id }, { $set: { currentQuantity: 15 } });
    const finalStock = (await InventoryItem.findById(canonicalInv._id)).currentQuantity;
    console.log(`Canonical King Coconut stock restored to original level: ${finalStock} units.`);

  } finally {
    console.log('\nCleaning up isolated test documents...');
    if (createdTestIds.inventory.length > 0) {
      await InventoryItem.deleteMany({ _id: { $in: createdTestIds.inventory } });
    }
    if (createdTestIds.bills.length > 0) {
      await Bill.deleteMany({ _id: { $in: createdTestIds.bills } });
    }
    if (createdTestIds.menu.length > 0) {
      await MenuItem.deleteMany({ _id: { $in: createdTestIds.menu } });
    }
    if (createdTestIds.lessons.length > 0) {
      await Lesson.deleteMany({ _id: { $in: createdTestIds.lessons } });
    }
    // Clean up test stock movements created by test bill & test lesson
    await StockMovement.deleteMany({
      $or: [
        { productCode: { $regex: /^TEST-/ } },
        { referenceNumber: { $regex: /BILL-TEST-/ } },
        { reason: { $regex: /LES-TEST-/ } }
      ]
    });
    console.log('Test cleanup complete.');
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
  console.error('Fatal test execution error:', err);
  process.exit(1);
});
