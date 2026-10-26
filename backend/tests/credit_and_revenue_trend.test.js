require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');

const Bill = require('../models/Bill');
const Rental = require('../models/Rental');
const Lesson = require('../models/Lesson');
const Payment = require('../models/Payment');
const Surfboard = require('../models/Surfboard');

const BASE_URL = 'http://127.0.0.1:5000';

const results = [];

function recordResult(testNum, name, passed, details) {
  results.push({ testNum, name, passed, details });
  console.log(`${passed ? '✓ PASS' : '✗ FAIL'} [Test ${testNum}] ${name}`);
  if (details) {
    console.log(`       ${details}`);
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('Dashboard Revenue Chart & Credit Management Tests');
  console.log('====================================================\n');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB for test verification.\n');

  const createdTestIds = {
    bills: [],
    rentals: [],
    lessons: [],
    payments: [],
    surfboards: []
  };

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Dashboard daily revenue trend returns real data for period
    // -------------------------------------------------------------------------
    const resTrend7 = await fetch(`${BASE_URL}/api/dashboard/revenue-trend?period=7days`);
    const trend7 = await resTrend7.json();
    const test1Passed =
      resTrend7.status === 200 &&
      Array.isArray(trend7.trend) &&
      trend7.trend.length === 7 &&
      typeof trend7.summary.totalSales === 'number' &&
      typeof trend7.summary.totalCollections === 'number';
    recordResult(
      1,
      'Dashboard daily line chart returns real data for selected period (7days)',
      test1Passed,
      `Returned ${trend7.trend?.length} days, Total Sales: Rs. ${trend7.summary?.totalSales}, Collections: Rs. ${trend7.summary?.totalCollections}`
    );

    // -------------------------------------------------------------------------
    // TEST 2: Empty date ranges return a valid empty result
    // -------------------------------------------------------------------------
    // Provide inverted range
    const resEmpty = await fetch(
      `${BASE_URL}/api/dashboard/revenue-trend?period=custom&startDate=2026-12-30&endDate=2026-12-01`
    );
    const emptyData = await resEmpty.json();
    const test2Passed =
      resEmpty.status === 200 &&
      Array.isArray(emptyData.trend) &&
      emptyData.trend.length === 0 &&
      emptyData.summary.totalSales === 0;
    recordResult(
      2,
      'Empty or inverted date ranges return a valid empty result without error',
      test2Passed,
      `Trend length: ${emptyData.trend?.length}, Total Sales: ${emptyData.summary?.totalSales}`
    );

    // -------------------------------------------------------------------------
    // TEST 3: Daily chart totals agree with backend reporting calculations
    // -------------------------------------------------------------------------
    const sumCalculated = trend7.trend.reduce((s, it) => s + it.salesAmount, 0);
    const sumReported = trend7.summary.totalSales;
    const collCalculated = trend7.trend.reduce((s, it) => s + it.cashCollected, 0);
    const collReported = trend7.summary.totalCollections;
    const test3Passed = sumCalculated === sumReported && collCalculated === collReported;
    recordResult(
      3,
      'Daily chart totals agree with backend reporting calculations',
      test3Passed,
      `Sales check: ${sumCalculated} === ${sumReported}, Collections check: ${collCalculated} === ${collReported}`
    );

    // -------------------------------------------------------------------------
    // TEST 4: An open unpaid restaurant bill is not counted as collected cash
    // -------------------------------------------------------------------------
    const openBillPayload = {
      billNumber: `BILL-TEST-${Date.now()}-OPEN`,
      customerName: 'Test Open Bill Guest',
      status: 'Open',
      orderType: 'Dine-in',
      paymentMethod: 'Cash',
      items: [{ name: 'Test Drink', quantity: 2, unitPrice: 500, total: 1000 }],
      total: 1000,
      subtotal: 1000
    };
    const resOpenBill = await fetch(`${BASE_URL}/api/bills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(openBillPayload)
    });
    const createdOpenBill = await resOpenBill.json();
    if (createdOpenBill._id) createdTestIds.bills.push(createdOpenBill._id);

    const testOpenPayment = await Payment.findOne({ sourceId: createdOpenBill._id });
    const test4Passed =
      resOpenBill.status === 201 &&
      createdOpenBill.status === 'Open' &&
      createdOpenBill.paymentStatus === 'Unpaid' &&
      createdOpenBill.totalPaid === 0 &&
      testOpenPayment === null;
    recordResult(
      4,
      'An open unpaid restaurant bill is not counted as collected cash and has no Payment record',
      test4Passed,
      `Bill status: ${createdOpenBill.status}, paymentStatus: ${createdOpenBill.paymentStatus}, Payment record exists: ${!!testOpenPayment}`
    );

    // -------------------------------------------------------------------------
    // TEST 5 & 14: A rental can be marked returned while remaining unpaid
    // -------------------------------------------------------------------------
    // Create a temporary test board
    const testBoard = await Surfboard.create({
      name: `Test Board ${Date.now()}`,
      category: 'Soft-top Foamies',
      length: '8ft',
      finSetup: 'Thruster',
      condition: 'Good',
      status: 'Available'
    });
    createdTestIds.surfboards.push(testBoard._id);

    // Start a rental
    const resStartRental = await fetch(`${BASE_URL}/api/rentals/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        boardId: testBoard._id.toString(),
        boardName: testBoard.name,
        customerName: 'Test Credit Rental Customer',
        customerContact: '0770000001',
        hourlyRate: 1000,
        agreedHourlyRate: 1000
      })
    });
    const startedRental = await resStartRental.json();
    if (startedRental._id) createdTestIds.rentals.push(startedRental._id);

    // Mark as returned with paymentStatus: 'Unpaid'
    const resReturnUnpaid = await fetch(`${BASE_URL}/api/rentals/return/${startedRental._id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        returnDate: '2026-10-23',
        returnTime: '01:00 PM',
        durationMinutes: 60,
        totalCharged: 1000,
        conditionOnReturn: 'Available',
        paymentStatus: 'Unpaid',
        paymentMethod: 'Cash',
        notes: 'Customer promises to pay tomorrow'
      })
    });
    const returnedUnpaidRental = await resReturnUnpaid.json();

    // Check board status is Available again
    const updatedBoard = await Surfboard.findById(testBoard._id);
    const rentalPayDoc = await Payment.findOne({ sourceId: startedRental._id });

    const test5Passed =
      resReturnUnpaid.status === 200 &&
      returnedUnpaidRental.status === 'Completed' &&
      returnedUnpaidRental.paymentStatus === 'Unpaid' &&
      returnedUnpaidRental.totalPaid === 0 &&
      returnedUnpaidRental.balanceDue === 1000 &&
      updatedBoard.status === 'Available' &&
      rentalPayDoc === null;
    recordResult(
      5,
      'A rental can be marked returned while remaining unpaid (board released, no payment recorded)',
      test5Passed,
      `Rental status: ${returnedUnpaidRental.status}, paymentStatus: ${returnedUnpaidRental.paymentStatus}, balanceDue: Rs. ${returnedUnpaidRental.balanceDue}, Board status: ${updatedBoard.status}`
    );

    // -------------------------------------------------------------------------
    // TEST 6: A completed lesson can remain unpaid
    // -------------------------------------------------------------------------
    const resLesson = await fetch(`${BASE_URL}/api/lessons/walkin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: 'Test Unpaid Student',
        studentCount: 1,
        lessonType: 'Private',
        pricingMode: 'Per Person',
        unitPrice: 5000,
        durationMinutes: 60,
        paymentStatus: 'Unpaid',
        paymentMethod: 'Cash',
        startDate: '2026-10-23',
        startTime: '10:00 AM'
      })
    });
    const createdLesson = await resLesson.json();
    if (createdLesson._id) createdTestIds.lessons.push(createdLesson._id);

    // Complete lesson without paying
    const resCompleteLesson = await fetch(`${BASE_URL}/api/lessons/${createdLesson._id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'Completed'
      })
    });
    const completedLesson = await resCompleteLesson.json();
    const lessonPayDoc = await Payment.findOne({ sourceId: createdLesson._id });

    const test6Passed =
      resCompleteLesson.status === 200 &&
      completedLesson.status === 'Completed' &&
      completedLesson.paymentStatus === 'Unpaid' &&
      completedLesson.balanceDue === 5000 &&
      lessonPayDoc === null;
    recordResult(
      6,
      'A completed surf lesson can remain unpaid (completion does not imply payment)',
      test6Passed,
      `Lesson status: ${completedLesson.status}, paymentStatus: ${completedLesson.paymentStatus}, balanceDue: Rs. ${completedLesson.balanceDue}`
    );

    // -------------------------------------------------------------------------
    // TEST 7: Partial rental payment leaves the correct outstanding balance
    // -------------------------------------------------------------------------
    // Pay Rs. 400 towards the Rs. 1000 rental
    const resPartialRentalPay = await fetch(`${BASE_URL}/api/rentals/${startedRental._id}/payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: 400,
        paymentMethod: 'Cash',
        cashier: 'Test Cashier',
        notes: 'Partial deposit payment'
      })
    });
    const partialRentalRes = await resPartialRentalPay.json();
    const updatedRentalAfterPartial = partialRentalRes.rental || partialRentalRes;
    if (partialRentalRes.payment?._id) createdTestIds.payments.push(partialRentalRes.payment._id);

    const test7Passed =
      resPartialRentalPay.status === 200 &&
      updatedRentalAfterPartial.paymentStatus === 'Partially Paid' &&
      updatedRentalAfterPartial.totalPaid === 400 &&
      updatedRentalAfterPartial.balanceDue === 600;
    recordResult(
      7,
      'Partial rental payment leaves the correct outstanding balance (400 paid, 600 due)',
      test7Passed,
      `paymentStatus: ${updatedRentalAfterPartial.paymentStatus}, totalPaid: ${updatedRentalAfterPartial.totalPaid}, balanceDue: ${updatedRentalAfterPartial.balanceDue}`
    );

    // -------------------------------------------------------------------------
    // TEST 8: Partial lesson payment leaves the correct outstanding balance
    // -------------------------------------------------------------------------
    // Pay Rs. 2000 towards the Rs. 5000 lesson
    const resPartialLessonPay = await fetch(`${BASE_URL}/api/lessons/${createdLesson._id}/payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: 2000,
        paymentMethod: 'Card',
        cashier: 'Test Cashier',
        notes: 'Partial advance'
      })
    });
    const partialLessonRes = await resPartialLessonPay.json();
    const updatedLessonAfterPartial = await Lesson.findById(createdLesson._id);

    const test8Passed =
      resPartialLessonPay.status === 200 &&
      updatedLessonAfterPartial.paymentStatus === 'Partially Paid' &&
      updatedLessonAfterPartial.totalPaid === 2000 &&
      updatedLessonAfterPartial.balanceDue === 3000;
    recordResult(
      8,
      'Partial lesson payment leaves the correct outstanding balance (2000 paid, 3000 due)',
      test8Passed,
      `paymentStatus: ${updatedLessonAfterPartial.paymentStatus}, totalPaid: ${updatedLessonAfterPartial.totalPaid}, balanceDue: ${updatedLessonAfterPartial.balanceDue}`
    );

    // -------------------------------------------------------------------------
    // TEST 9: Full payment clears the balance to zero and marks as Paid
    // -------------------------------------------------------------------------
    // Pay remaining Rs. 600 on rental
    const resFullRentalPay = await fetch(`${BASE_URL}/api/rentals/${startedRental._id}/payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: 600,
        paymentMethod: 'Cash',
        cashier: 'Test Cashier',
        notes: 'Final settlement'
      })
    });
    const fullRentalRes = await resFullRentalPay.json();
    const fullyPaidRental = fullRentalRes.rental || fullRentalRes;
    if (fullRentalRes.payment?._id) createdTestIds.payments.push(fullRentalRes.payment._id);

    const test9Passed =
      resFullRentalPay.status === 200 &&
      fullyPaidRental.paymentStatus === 'Paid' &&
      fullyPaidRental.totalPaid === 1000 &&
      fullyPaidRental.balanceDue === 0;
    recordResult(
      9,
      'Full payment clears the balance to zero and sets paymentStatus to Paid',
      test9Passed,
      `paymentStatus: ${fullyPaidRental.paymentStatus}, totalPaid: ${fullyPaidRental.totalPaid}, balanceDue: ${fullyPaidRental.balanceDue}`
    );

    // -------------------------------------------------------------------------
    // TEST 10: Outstanding payments screen shows active credit transactions
    // -------------------------------------------------------------------------
    const resOutstanding = await fetch(`${BASE_URL}/api/credit/outstanding`);
    const outstandingData = await resOutstanding.json();
    const lessonFoundInOutstanding = outstandingData.items.find(
      (it) => it.sourceId === createdLesson._id.toString()
    );
    const rentalFoundInOutstanding = outstandingData.items.find(
      (it) => it.sourceId === startedRental._id.toString()
    );

    const test10Passed =
      resOutstanding.status === 200 &&
      lessonFoundInOutstanding &&
      lessonFoundInOutstanding.balanceDue === 3000 &&
      !rentalFoundInOutstanding; // fully paid rental should no longer be in outstanding list!
    recordResult(
      10,
      'Outstanding credit screen lists unpaid & partially paid items, removes fully paid items',
      test10Passed,
      `Lesson in credit list: ${!!lessonFoundInOutstanding} (Balance: ${lessonFoundInOutstanding?.balanceDue}), Fully paid rental excluded: ${!rentalFoundInOutstanding}`
    );

    // -------------------------------------------------------------------------
    // TEST 11: Overpayment amounts greater than balance are rejected
    // -------------------------------------------------------------------------
    // Lesson remaining balance is 3000; attempt to pay 4000
    const resOverpay = await fetch(`${BASE_URL}/api/lessons/${createdLesson._id}/payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: 4000,
        paymentMethod: 'Cash'
      })
    });
    const overpayData = await resOverpay.json();
    const test11Passed = resOverpay.status === 400 && overpayData.message.includes('exceeds');
    recordResult(
      11,
      'Payment amounts greater than the outstanding balance are safely rejected',
      test11Passed,
      `Status: ${resOverpay.status}, Error Message: "${overpayData.message}"`
    );

    // -------------------------------------------------------------------------
    // TEST 12: Duplicate payment requests (idempotency) do not double-count cash
    // -------------------------------------------------------------------------
    const idemKey = `IDEM-TEST-${Date.now()}`;
    // First submission
    const resIdem1 = await fetch(`${BASE_URL}/api/credit/Lesson/${createdLesson._id}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: 1000,
        paymentMethod: 'Cash',
        idempotencyKey: idemKey
      })
    });
    const idem1Data = await resIdem1.json();

    // Duplicate submission with same idempotencyKey
    const resIdem2 = await fetch(`${BASE_URL}/api/credit/Lesson/${createdLesson._id}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: 1000,
        paymentMethod: 'Cash',
        idempotencyKey: idemKey
      })
    });
    const idem2Data = await resIdem2.json();

    const lessonAfterIdem = await Lesson.findById(createdLesson._id);
    const paymentDocsCount = await Payment.countDocuments({ idempotencyKey: idemKey });

    const test12Passed =
      resIdem1.status === 200 &&
      resIdem2.status === 200 &&
      paymentDocsCount === 1 &&
      lessonAfterIdem.totalPaid === 3000 && // 2000 initial + 1000 once (NOT 4000!)
      lessonAfterIdem.balanceDue === 2000;
    recordResult(
      12,
      'Duplicate payment requests with idempotency key do not double-count cash',
      test12Passed,
      `Payment records created: ${paymentDocsCount}, Total paid: ${lessonAfterIdem.totalPaid}, Balance due: ${lessonAfterIdem.balanceDue}`
    );

    // -------------------------------------------------------------------------
    // TEST 13: Customer credit payment history is traceable
    // -------------------------------------------------------------------------
    const resHistory = await fetch(`${BASE_URL}/api/credit/Lesson/${createdLesson._id}/history`);
    const historyData = await resHistory.json();
    const test13Passed =
      resHistory.status === 200 &&
      Array.isArray(historyData) &&
      historyData.length === 2 && // 2000 partial payment + 1000 idempotent payment
      historyData[0].amount === 2000 &&
      historyData[1].amount === 1000;
    recordResult(
      13,
      'Every payment is completely traceable in customer credit payment history',
      test13Passed,
      `Found ${historyData.length} payment history entries, Total history amount: Rs. ${historyData.reduce((s, p) => s + p.amount, 0)}`
    );

    // -------------------------------------------------------------------------
    // TEST 14: Historical data preservation check
    // -------------------------------------------------------------------------
    // Ensure all 8 original bills, 7 original rentals, 5 original lessons are unmodified
    const billCount = await Bill.countDocuments({ billNumber: { $not: /^BILL-TEST/ } });
    const rentalCount = await Rental.countDocuments({ customerName: { $not: /^Test/ } });
    const lessonCount = await Lesson.countDocuments({ customerName: { $not: /^Test/ } });

    const test14Passed = billCount >= 8 && rentalCount >= 7 && lessonCount >= 5;
    recordResult(
      14,
      'Historical production data is preserved and not altered or deleted',
      test14Passed,
      `Original bills: ${billCount}, rentals: ${rentalCount}, lessons: ${lessonCount}`
    );
  } finally {
    console.log('\nCleaning up isolated test fixtures...');
    if (createdTestIds.bills.length > 0) {
      await Bill.deleteMany({ _id: { $in: createdTestIds.bills } });
    }
    if (createdTestIds.rentals.length > 0) {
      await Rental.deleteMany({ _id: { $in: createdTestIds.rentals } });
    }
    if (createdTestIds.lessons.length > 0) {
      await Lesson.deleteMany({ _id: { $in: createdTestIds.lessons } });
    }
    if (createdTestIds.surfboards.length > 0) {
      await Surfboard.deleteMany({ _id: { $in: createdTestIds.surfboards } });
    }
    // Clean up test payments
    await Payment.deleteMany({
      $or: [
        { customerName: { $regex: /^Test/ } },
        { sourceReference: { $regex: /TEST/ } },
        { notes: { $regex: /Test/ } }
      ]
    });
    console.log('Cleanup complete.');
    await mongoose.disconnect();
  }

  const passedCount = results.filter((r) => r.passed).length;
  const totalCount = results.length;
  console.log('\n====================================================');
  console.log(`Backend Test Summary: ${passedCount}/${totalCount} passed`);
  console.log('====================================================');

  if (passedCount !== totalCount) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
