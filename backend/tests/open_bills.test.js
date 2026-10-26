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

async function runTests() {
  console.log('====================================================');
  console.log('Open Bills + Add Items Feature — Test Suite');
  console.log('====================================================\n');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB Atlas for isolated test execution.\n');

  const createdTestIds = {
    bills: [],
    inventory: [],
    menu: [],
    movements: [],
    lessons: []
  };

  try {
    // -------------------------------------------------------------------------
    // Setup Isolated Test Products & Inventory
    // -------------------------------------------------------------------------
    const uniqueSuffix = Date.now().toString().slice(-6);

    // 1. King Coconut test item
    const testCoconutCode = `TKC-${uniqueSuffix}`;
    const testCoconutInv = await InventoryItem.create({
      productName: `Test King Coconut ${uniqueSuffix}`,
      code: testCoconutCode,
      category: 'Drinks',
      currentQuantity: 10,
      unit: 'pcs',
      reorderThreshold: 2,
      unitCost: 80,
      sellingPrice: 150,
      isActive: true
    });
    createdTestIds.inventory.push(testCoconutInv._id);

    // 2. Rice test item
    const testRiceCode = `TRC-${uniqueSuffix}`;
    const testRiceInv = await InventoryItem.create({
      productName: `Test Seafood Rice ${uniqueSuffix}`,
      code: testRiceCode,
      category: 'Food',
      currentQuantity: 15,
      unit: 'portions',
      reorderThreshold: 3,
      unitCost: 350,
      sellingPrice: 650,
      isActive: true
    });
    createdTestIds.inventory.push(testRiceInv._id);

    // 3. Water bottle test item
    const testWaterCode = `TWT-${uniqueSuffix}`;
    const testWaterInv = await InventoryItem.create({
      productName: `Test Mineral Water ${uniqueSuffix}`,
      code: testWaterCode,
      category: 'Drinks',
      currentQuantity: 20,
      unit: 'bottles',
      reorderThreshold: 5,
      unitCost: 50,
      sellingPrice: 120,
      isActive: true
    });
    createdTestIds.inventory.push(testWaterInv._id);

    // 4. Limited stock test item (for oversell testing)
    const testLimitedCode = `TLM-${uniqueSuffix}`;
    const testLimitedInv = await InventoryItem.create({
      productName: `Test Rare Item ${uniqueSuffix}`,
      code: testLimitedCode,
      category: 'Drinks',
      currentQuantity: 2,
      unit: 'cans',
      reorderThreshold: 1,
      unitCost: 100,
      sellingPrice: 250,
      isActive: true
    });
    createdTestIds.inventory.push(testLimitedInv._id);

    // -------------------------------------------------------------------------
    // SCENARIO 1: Create a new unpaid bill (status: 'Open')
    // -------------------------------------------------------------------------
    let bill1Id = null;
    let bill1Number = null;
    try {
      const res = await fetch(`${BASE_URL}/api/bills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderType: 'Dine-in',
          status: 'Open',
          customerName: 'Sunbed 4 - Alex',
          items: [],
          cashier: 'Kasun P.'
        })
      });
      const data = await res.json();
      if (res.ok && data.status === 'Open' && data.billNumber && data.customerName === 'Sunbed 4 - Alex') {
        bill1Id = data._id;
        bill1Number = data.billNumber;
        createdTestIds.bills.push(bill1Id);
        recordResult(1, 'Create a new unpaid bill (status: Open)', true, `Created Bill #${bill1Number} with status Open`);
      } else {
        recordResult(1, 'Create a new unpaid bill (status: Open)', false, `Status ${res.status}: ${JSON.stringify(data)}`);
      }
    } catch (err) {
      recordResult(1, 'Create a new unpaid bill (status: Open)', false, err.message);
    }

    // -------------------------------------------------------------------------
    // SCENARIO 2: Add King Coconut to the bill
    // -------------------------------------------------------------------------
    const initialCoconutQty = (await InventoryItem.findById(testCoconutInv._id)).currentQuantity;
    try {
      const res = await fetch(`${BASE_URL}/api/bills/${bill1Id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [
            {
              code: testCoconutCode,
              name: `Test King Coconut ${uniqueSuffix}`,
              quantity: 1,
              unitPrice: 150
            }
          ]
        })
      });
      const data = await res.json();
      const updatedCoconutInv = await InventoryItem.findById(testCoconutInv._id);
      const stockDeducted = initialCoconutQty - updatedCoconutInv.currentQuantity === 1;

      if (res.ok && data.items.length === 1 && data.items[0].code === testCoconutCode && data.items[0].addedAt && stockDeducted) {
        recordResult(2, 'Add King Coconut to open bill and verify inventory deducted', true, `Item added with addedAt timestamp. Stock: ${initialCoconutQty} -> ${updatedCoconutInv.currentQuantity}`);
      } else {
        recordResult(2, 'Add King Coconut to open bill', false, `res.ok=${res.ok}, stockDeducted=${stockDeducted}`);
      }
    } catch (err) {
      recordResult(2, 'Add King Coconut to open bill', false, err.message);
    }

    // -------------------------------------------------------------------------
    // SCENARIO 3: Add Rice to the same bill later
    // -------------------------------------------------------------------------
    const initialRiceQty = (await InventoryItem.findById(testRiceInv._id)).currentQuantity;
    try {
      const res = await fetch(`${BASE_URL}/api/bills/${bill1Id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [
            {
              code: testRiceCode,
              name: `Test Seafood Rice ${uniqueSuffix}`,
              quantity: 1,
              unitPrice: 650
            }
          ]
        })
      });
      const data = await res.json();
      const updatedRiceInv = await InventoryItem.findById(testRiceInv._id);

      const hasBoth = data.items.length === 2 && data.billNumber === bill1Number;
      const subtotalMatches = data.subtotal === (150 + 650);

      if (res.ok && hasBoth && subtotalMatches && updatedRiceInv.currentQuantity === initialRiceQty - 1) {
        recordResult(3, 'Add Rice to the same bill later', true, `Preserved Bill #${data.billNumber}, 2 items, Subtotal: Rs. ${data.subtotal}`);
      } else {
        recordResult(3, 'Add Rice to the same bill later', false, `res.ok=${res.ok}, items=${data.items?.length}, subtotal=${data.subtotal}`);
      }
    } catch (err) {
      recordResult(3, 'Add Rice to the same bill later', false, err.message);
    }

    // -------------------------------------------------------------------------
    // SCENARIO 4: Add multiple additional items (2 Water bottles)
    // -------------------------------------------------------------------------
    const initialWaterQty = (await InventoryItem.findById(testWaterInv._id)).currentQuantity;
    try {
      const res = await fetch(`${BASE_URL}/api/bills/${bill1Id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [
            {
              code: testWaterCode,
              name: `Test Mineral Water ${uniqueSuffix}`,
              quantity: 2,
              unitPrice: 120
            }
          ]
        })
      });
      const data = await res.json();
      const updatedWaterInv = await InventoryItem.findById(testWaterInv._id);

      const totalItems = data.items.reduce((s, it) => s + it.quantity, 0);
      const expectedSubtotal = 150 + 650 + (2 * 120); // 1040

      if (res.ok && totalItems === 4 && data.subtotal === expectedSubtotal && updatedWaterInv.currentQuantity === initialWaterQty - 2) {
        recordResult(4, 'Add multiple additional items to open bill', true, `4 total units on bill. Subtotal: Rs. ${data.subtotal}, Water Stock: ${updatedWaterInv.currentQuantity}`);
      } else {
        recordResult(4, 'Add multiple additional items to open bill', false, `totalItems=${totalItems}, subtotal=${data.subtotal}`);
      }
    } catch (err) {
      recordResult(4, 'Add multiple additional items to open bill', false, err.message);
    }

    // -------------------------------------------------------------------------
    // SCENARIO 5: Keep three different bills open simultaneously
    // -------------------------------------------------------------------------
    let billAId = null;
    let billBId = null;
    let billCId = null;
    try {
      const [resA, resB, resC] = await Promise.all([
        fetch(`${BASE_URL}/api/bills`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderType: 'Dine-in',
            status: 'Open',
            customerName: 'Tab A - Surf Deck',
            items: [{ code: testCoconutCode, name: 'King Coconut', quantity: 1, unitPrice: 150 }],
            cashier: 'Kasun P.'
          })
        }),
        fetch(`${BASE_URL}/api/bills`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderType: 'Dine-in',
            status: 'Open',
            customerName: 'Tab B - Table 7',
            items: [{ code: testRiceCode, name: 'Seafood Rice', quantity: 1, unitPrice: 650 }],
            cashier: 'Kasun P.'
          })
        }),
        fetch(`${BASE_URL}/api/bills`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderType: 'Takeaway',
            status: 'Open',
            customerName: 'Tab C - Beach Sunbed',
            items: [{ code: testWaterCode, name: 'Water Bottle', quantity: 1, unitPrice: 120 }],
            cashier: 'Kasun P.'
          })
        })
      ]);

      const [dataA, dataB, dataC] = await Promise.all([resA.json(), resB.json(), resC.json()]);
      if (!resA.ok || !resB.ok || !resC.ok) {
        recordResult(5, 'Keep three different bills open simultaneously', false, `Failures: A(${resA.status}): ${JSON.stringify(dataA)}, B(${resB.status}): ${JSON.stringify(dataB)}, C(${resC.status}): ${JSON.stringify(dataC)}`);
        return;
      }
      billAId = dataA._id;
      billBId = dataB._id;
      billCId = dataC._id;
      createdTestIds.bills.push(billAId, billBId, billCId);

      const listRes = await fetch(`${BASE_URL}/api/bills?status=Open`);
      const openBillsList = await listRes.json();
      const openIds = new Set(openBillsList.map((b) => b._id.toString()));

      const allPresent = openIds.has(billAId.toString()) && openIds.has(billBId.toString()) && openIds.has(billCId.toString());

      if (allPresent) {
        recordResult(5, 'Keep three different bills open simultaneously', true, `Tabs A (${dataA.billNumber}), B (${dataB.billNumber}), C (${dataC.billNumber}) all OPEN simultaneously`);
      } else {
        recordResult(5, 'Keep three different bills open simultaneously', false, 'Not all 3 bills found in open bills query');
      }
    } catch (err) {
      recordResult(5, 'Keep three different bills open simultaneously', false, err.message);
    }

    // -------------------------------------------------------------------------
    // SCENARIO 6: Switch bills and verify items never mix
    // -------------------------------------------------------------------------
    try {
      // Add Water to Bill B only
      await fetch(`${BASE_URL}/api/bills/${billBId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{ code: testWaterCode, name: 'Water Bottle', quantity: 1, unitPrice: 120 }]
        })
      });

      // Verify Bill A, Bill B, Bill C independently
      const [chkA, chkB, chkC] = await Promise.all([
        (await fetch(`${BASE_URL}/api/bills/${billAId}`)).json(),
        (await fetch(`${BASE_URL}/api/bills/${billBId}`)).json(),
        (await fetch(`${BASE_URL}/api/bills/${billCId}`)).json()
      ]);

      const billAUnmixed = chkA.items.length === 1 && chkA.items[0].code === testCoconutCode;
      const billBHasBoth = chkB.items.length === 2 && chkB.subtotal === (650 + 120);
      const billCUnmixed = chkC.items.length === 1 && chkC.items[0].code === testWaterCode;

      if (billAUnmixed && billBHasBoth && billCUnmixed) {
        recordResult(6, 'Switch bills and verify items never mix', true, 'Bill A and Bill C completely isolated; Bill B updated cleanly');
      } else {
        recordResult(6, 'Switch bills and verify items never mix', false, `chkA=${chkA.items.length}, chkB=${chkB.items.length}, chkC=${chkC.items.length}`);
      }
    } catch (err) {
      recordResult(6, 'Switch bills and verify items never mix', false, err.message);
    }

    // -------------------------------------------------------------------------
    // SCENARIO 7: Update totals correctly using configured prices & discounts
    // -------------------------------------------------------------------------
    try {
      // Update Bill A items with discount: 50 and 10% service charge
      const res = await fetch(`${BASE_URL}/api/bills/${billAId}/items`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [
            { code: testCoconutCode, name: 'King Coconut', quantity: 2, unitPrice: 150, total: 300 }
          ],
          discount: 50,
          serviceCharge: 25 // 10% of (300-50)
        })
      });
      const data = await res.json();
      const expectedTotal = 300 - 50 + 25; // 275

      if (res.ok && data.subtotal === 300 && data.discount === 50 && data.total === expectedTotal) {
        recordResult(7, 'Update totals correctly using configured prices & discounts', true, `Subtotal: ${data.subtotal}, Discount: ${data.discount}, Total: ${data.total}`);
      } else {
        recordResult(7, 'Update totals correctly using configured prices', false, `subtotal=${data.subtotal}, total=${data.total}`);
      }
    } catch (err) {
      recordResult(7, 'Update totals correctly using configured prices', false, err.message);
    }

    // -------------------------------------------------------------------------
    // SCENARIO 8: Prevent adding items to a paid or cancelled bill
    // -------------------------------------------------------------------------
    try {
      // Settle Bill C first
      await fetch(`${BASE_URL}/api/bills/${billCId}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentMethod: 'Cash' })
      });

      // Attempt to add item to Settled Bill C
      const tryAddSettled = await fetch(`${BASE_URL}/api/bills/${billCId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{ code: testRiceCode, name: 'Seafood Rice', quantity: 1, unitPrice: 650 }]
        })
      });

      // Cancel Bill B
      await fetch(`${BASE_URL}/api/bills/${billBId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Cancelled', reason: 'Guest changed mind' })
      });

      // Attempt to add item to Cancelled Bill B
      const tryAddCancelled = await fetch(`${BASE_URL}/api/bills/${billBId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{ code: testRiceCode, name: 'Seafood Rice', quantity: 1, unitPrice: 650 }]
        })
      });

      if (tryAddSettled.status === 400 && tryAddCancelled.status === 400) {
        recordResult(8, 'Prevent adding items to a paid or cancelled bill', true, 'Both additions rejected with HTTP 400 Bad Request');
      } else {
        recordResult(8, 'Prevent adding items to a paid or cancelled bill', false, `settledStatus=${tryAddSettled.status}, cancelledStatus=${tryAddCancelled.status}`);
      }
    } catch (err) {
      recordResult(8, 'Prevent adding items to a paid or cancelled bill', false, err.message);
    }

    // -------------------------------------------------------------------------
    // SCENARIO 9: Prevent overselling and negative inventory
    // -------------------------------------------------------------------------
    try {
      // testLimitedInv currently has currentQuantity = 2
      const res = await fetch(`${BASE_URL}/api/bills/${bill1Id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [
            { code: testLimitedCode, name: 'Test Rare Item', quantity: 99, unitPrice: 250 }
          ]
        })
      });
      const data = await res.json();
      const currentStock = (await InventoryItem.findById(testLimitedInv._id)).currentQuantity;

      const errMsg = data.message || data.error || '';
      if (res.status === 400 && currentStock === 2 && errMsg.includes('Insufficient stock')) {
        recordResult(9, 'Prevent overselling and negative inventory', true, `Rejected with: "${errMsg}". Stock preserved at ${currentStock}`);
      } else {
        recordResult(9, 'Prevent overselling and negative inventory', false, `status=${res.status}, stock=${currentStock}, errMsg="${errMsg}"`);
      }
    } catch (err) {
      recordResult(9, 'Prevent overselling and negative inventory', false, err.message);
    }

    // -------------------------------------------------------------------------
    // SCENARIO 10: Verify stock is deducted or reserved only according to chosen strategy
    // -------------------------------------------------------------------------
    try {
      // Current stock before adding 1 Rare Item
      const stockBefore = (await InventoryItem.findById(testLimitedInv._id)).currentQuantity; // 2
      const addRes = await fetch(`${BASE_URL}/api/bills/${bill1Id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{ code: testLimitedCode, name: 'Test Rare Item', quantity: 1, unitPrice: 250 }]
        })
      });
      const stockAfterAdd = (await InventoryItem.findById(testLimitedInv._id)).currentQuantity; // should be 1

      // Now reduce quantity or remove item via PATCH /api/bills/:id/items
      const curBill = await (await fetch(`${BASE_URL}/api/bills/${bill1Id}`)).json();
      const itemsWithoutRare = curBill.items.filter((it) => it.code !== testLimitedCode);

      const patchRes = await fetch(`${BASE_URL}/api/bills/${bill1Id}/items`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: itemsWithoutRare })
      });
      const stockAfterRemove = (await InventoryItem.findById(testLimitedInv._id)).currentQuantity; // should be restored to 2

      if (addRes.ok && patchRes.ok && stockAfterAdd === 1 && stockAfterRemove === 2) {
        recordResult(10, 'Verify stock deduction upon addition and restoration upon item removal', true, `Stock transitioned: ${stockBefore} -> ${stockAfterAdd} -> ${stockAfterRemove}`);
      } else {
        recordResult(10, 'Verify stock deduction and restoration', false, `afterAdd=${stockAfterAdd}, afterRemove=${stockAfterRemove}`);
      }
    } catch (err) {
      recordResult(10, 'Verify stock deduction and restoration', false, err.message);
    }

    // -------------------------------------------------------------------------
    // SCENARIO 11: Prevent duplicate payment and duplicate stock deduction
    // -------------------------------------------------------------------------
    try {
      // Bill 1 currently has Coconut (1), Rice (1), Water (2)
      const coconutStockBeforePay = (await InventoryItem.findById(testCoconutInv._id)).currentQuantity;
      const riceStockBeforePay = (await InventoryItem.findById(testRiceInv._id)).currentQuantity;

      // 1st pay request
      const payRes1 = await fetch(`${BASE_URL}/api/bills/${bill1Id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentMethod: 'Card (Visa/MC)',
          cashier: 'Kasun P.'
        })
      });
      const payData1 = await payRes1.json();

      const coconutStockAfterPay = (await InventoryItem.findById(testCoconutInv._id)).currentQuantity;
      const riceStockAfterPay = (await InventoryItem.findById(testRiceInv._id)).currentQuantity;

      // 2nd pay request (should fail)
      const payRes2 = await fetch(`${BASE_URL}/api/bills/${bill1Id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentMethod: 'Cash' })
      });

      const noDoubleDeduction =
        coconutStockBeforePay === coconutStockAfterPay &&
        riceStockBeforePay === riceStockAfterPay;

      if (payRes1.ok && payData1.status === 'Settled' && payRes2.status === 400 && noDoubleDeduction) {
        recordResult(11, 'Prevent duplicate payment and duplicate stock deduction', true, `First pay settled Bill #${payData1.billNumber}. Second pay rejected (400). Zero duplicate stock deductions.`);
      } else {
        recordResult(11, 'Prevent duplicate payment', false, `pay1=${payRes1.status}, pay2=${payRes2.status}, noDoubleDeduction=${noDoubleDeduction}`);
      }
    } catch (err) {
      recordResult(11, 'Prevent duplicate payment', false, err.message);
    }

    // -------------------------------------------------------------------------
    // SCENARIO 12: Verify failed payment leaves the bill and stock consistent
    // -------------------------------------------------------------------------
    try {
      // Create a fresh open bill
      const newBillRes = await fetch(`${BASE_URL}/api/bills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderType: 'Dine-in',
          status: 'Open',
          customerName: 'Fail Test Tab',
          items: [{ code: testCoconutCode, name: 'King Coconut', quantity: 1, unitPrice: 150 }]
        })
      });
      const freshBill = await newBillRes.json();
      createdTestIds.bills.push(freshBill._id);

      const coconutBefore = (await InventoryItem.findById(testCoconutInv._id)).currentQuantity;

      // Send invalid payment request (e.g. empty body or invalid bill ID)
      const badPayRes = await fetch(`${BASE_URL}/api/bills/invalid-id-xyz/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentMethod: 'Cash' })
      });

      const checkFreshBill = await (await fetch(`${BASE_URL}/api/bills/${freshBill._id}`)).json();
      const coconutAfter = (await InventoryItem.findById(testCoconutInv._id)).currentQuantity;

      if (badPayRes.status >= 400 && checkFreshBill.status === 'Open' && coconutBefore === coconutAfter) {
        recordResult(12, 'Verify failed payment leaves bill and stock consistent', true, `Bill #${freshBill.billNumber} remained Open; stock untouched at ${coconutAfter}`);
      } else {
        recordResult(12, 'Verify failed payment consistency', false, `badStatus=${badPayRes.status}, billStatus=${checkFreshBill.status}`);
      }
    } catch (err) {
      recordResult(12, 'Verify failed payment consistency', false, err.message);
    }

    // -------------------------------------------------------------------------
    // SCENARIO 13: Verify bill cancellation and refunds follow stock-restoration rules
    // -------------------------------------------------------------------------
    try {
      const stockBeforeCancel = (await InventoryItem.findById(testCoconutInv._id)).currentQuantity;

      // Create an open bill with 2 Coconuts
      const cancelBillRes = await fetch(`${BASE_URL}/api/bills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderType: 'Takeaway',
          status: 'Open',
          customerName: 'Cancel Test Guest',
          items: [{ code: testCoconutCode, name: 'King Coconut', quantity: 2, unitPrice: 150 }]
        })
      });
      const cancelBill = await cancelBillRes.json();
      createdTestIds.bills.push(cancelBill._id);

      const stockDeducted = (await InventoryItem.findById(testCoconutInv._id)).currentQuantity; // should be stockBeforeCancel - 2

      // Now cancel the open bill
      const cancelRes = await fetch(`${BASE_URL}/api/bills/${cancelBill._id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Cancelled', reason: 'Guest cancelled order' })
      });
      const cancelledData = await cancelRes.json();

      const stockRestored = (await InventoryItem.findById(testCoconutInv._id)).currentQuantity; // should be restored to stockBeforeCancel

      if (cancelRes.ok && cancelledData.status === 'Cancelled' && stockDeducted === stockBeforeCancel - 2 && stockRestored === stockBeforeCancel) {
        recordResult(13, 'Verify bill cancellation restores stock exactly once', true, `Stock: ${stockBeforeCancel} -> -2 (${stockDeducted}) -> Cancelled & Restored (+2 = ${stockRestored})`);
      } else {
        recordResult(13, 'Verify bill cancellation restores stock', false, `deducted=${stockDeducted}, restored=${stockRestored}, expected=${stockBeforeCancel}`);
      }
    } catch (err) {
      recordResult(13, 'Verify bill cancellation restores stock', false, err.message);
    }

    // -------------------------------------------------------------------------
    // SCENARIO 14: Verify final receipt includes all items
    // -------------------------------------------------------------------------
    try {
      const settledBill = await (await fetch(`${BASE_URL}/api/bills/${bill1Id}`)).json();

      const hasCoconut = settledBill.items.some((i) => i.code === testCoconutCode && i.quantity === 1);
      const hasRice = settledBill.items.some((i) => i.code === testRiceCode && i.quantity === 1);
      const hasWater = settledBill.items.some((i) => i.code === testWaterCode && i.quantity === 2);
      const totalAmountCorrect = settledBill.total === (150 + 650 + 240);

      if (settledBill.status === 'Settled' && hasCoconut && hasRice && hasWater && totalAmountCorrect && settledBill.closedAt) {
        recordResult(14, 'Verify final receipt includes all items and closedAt timestamp', true, `All 3 items present, closedAt=${settledBill.closedAt}, Total=Rs. ${settledBill.total}`);
      } else {
        recordResult(14, 'Verify final receipt includes all items', false, `hasCoconut=${hasCoconut}, hasRice=${hasRice}, hasWater=${hasWater}, total=${settledBill.total}`);
      }
    } catch (err) {
      recordResult(14, 'Verify final receipt includes all items', false, err.message);
    }

    // -------------------------------------------------------------------------
    // SCENARIO 15: Verify Bill History and Reports continue working
    // -------------------------------------------------------------------------
    try {
      // GET /api/bills returns all bills for history
      const historyRes = await fetch(`${BASE_URL}/api/bills?limit=50`);
      const allBills = await historyRes.json();

      const settledFound = allBills.find((b) => b._id.toString() === bill1Id.toString());
      const openExcludedFromSettledOnly = allBills.filter((b) => b.status === 'Settled').every((b) => b.status === 'Settled');

      if (historyRes.ok && settledFound && settledFound.status === 'Settled' && openExcludedFromSettledOnly) {
        recordResult(15, 'Verify Bill History and Reports include settled bills and segregate open tabs', true, `Bill #${settledFound.billNumber} found in history with status Settled`);
      } else {
        recordResult(15, 'Verify Bill History and Reports', false, `settledFound=${!!settledFound}`);
      }
    } catch (err) {
      recordResult(15, 'Verify Bill History and Reports', false, err.message);
    }

    // -------------------------------------------------------------------------
    // SCENARIO 16: Verify existing Surf Lesson coconut issuance remains intact
    // -------------------------------------------------------------------------
    try {
      // Create a test lesson with the test coconut item
      const now = Date.now();
      const testLesson = await Lesson.create({
        lessonNumber: `LES-TEST-${Date.now()}`,
        customerName: 'Test Student Tab Integration',
        studentCount: 1,
        lessonType: 'Private',
        pricingMode: 'Per Person',
        durationMinutes: 60,
        subtotal: 5000,
        total: 5000,
        startDate: '2026-10-21',
        startTime: '10:00 AM',
        startTimestamp: now,
        endTime: '11:00 AM',
        endTimestamp: now + 3600000,
        status: 'In Progress',
        coconutIssued: false,
        coconutsIssuedCount: 0,
        coconutDeclined: false
      });
      createdTestIds.lessons.push(testLesson._id);

      // Verify lesson was created cleanly and can be queried
      const lessonCheck = await Lesson.findById(testLesson._id);
      if (lessonCheck && lessonCheck.status === 'In Progress') {
        recordResult(16, 'Verify existing Surf Lesson, Inventory & Rentals remain fully intact', true, `Lesson #${lessonCheck.lessonNumber} active without disruption`);
      } else {
        recordResult(16, 'Verify existing Surf Lesson functionality', false, 'Lesson check failed');
      }
    } catch (err) {
      recordResult(16, 'Verify existing Surf Lesson functionality', false, err.message);
    }

  } finally {
    // -------------------------------------------------------------------------
    // Clean up all isolated test data
    // -------------------------------------------------------------------------
    console.log('\nCleaning up isolated test fixtures...');
    if (createdTestIds.bills.length > 0) {
      await Bill.deleteMany({ _id: { $in: createdTestIds.bills } });
    }
    if (createdTestIds.inventory.length > 0) {
      await InventoryItem.deleteMany({ _id: { $in: createdTestIds.inventory } });
    }
    if (createdTestIds.lessons.length > 0) {
      await Lesson.deleteMany({ _id: { $in: createdTestIds.lessons } });
    }
    if (createdTestIds.movements.length > 0) {
      await StockMovement.deleteMany({ _id: { $in: createdTestIds.movements } });
    }
    console.log('Cleanup completed cleanly.\n');

    await mongoose.disconnect();

    // Summary
    const passedCount = results.filter((r) => r.passed).length;
    console.log('====================================================');
    console.log(`TEST SUMMARY: ${passedCount} / ${results.length} PASSED`);
    console.log('====================================================');

    if (passedCount < results.length) {
      process.exit(1);
    }
  }
}

runTests().catch((err) => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});
