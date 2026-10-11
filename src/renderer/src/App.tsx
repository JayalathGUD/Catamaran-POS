
import { useMemo, useState } from "react";
import "./assets/main.css";

type Page =
  | "Dashboard"
  | "POS Billing"
  | "Tables"
  | "Menu Management"
  | "Orders"
  | "Inventory"
  | "Expenses"
  | "Reports"
  | "Settings";

type Product = {
  id: number;
  name: string;
  category: string;
  price: number;
  stock: number;
  emoji: string;
  available: boolean;
};

type CartItem = Product & { qty: number };

const initialProducts: Product[] = [
  { id: 1, name: "Classic Burger", category: "Food", price: 1250, stock: 24, emoji: "🍔", available: true },
  { id: 2, name: "Chicken Burger", category: "Food", price: 1650, stock: 18, emoji: "🍔", available: true },
  { id: 3, name: "Seafood Rice", category: "Food", price: 2200, stock: 12, emoji: "🍛", available: true },
  { id: 4, name: "French Fries", category: "Sides", price: 750, stock: 30, emoji: "🍟", available: true },
  { id: 5, name: "Club Sandwich", category: "Food", price: 1450, stock: 15, emoji: "🥪", available: true },
  { id: 6, name: "Fresh Lime Juice", category: "Drinks", price: 650, stock: 20, emoji: "🍋", available: true },
  { id: 7, name: "Mango Juice", category: "Drinks", price: 700, stock: 16, emoji: "🥭", available: true },
  { id: 8, name: "Iced Coffee", category: "Drinks", price: 850, stock: 14, emoji: "🧋", available: true },
  { id: 9, name: "Chocolate Brownie", category: "Desserts", price: 900, stock: 10, emoji: "🍫", available: true },
  { id: 10, name: "Seafood Platter", category: "Food", price: 4200, stock: 6, emoji: "🦞", available: true },
  { id: 11, name: "Chicken Kottu", category: "Food", price: 1800, stock: 11, emoji: "🍜", available: true },
  { id: 12, name: "Mineral Water", category: "Drinks", price: 250, stock: 40, emoji: "💧", available: true },
];

const navigation: { label: Page; icon: string; section: string }[] = [
  { label: "Dashboard", icon: "▦", section: "OVERVIEW" },
  { label: "POS Billing", icon: "▣", section: "OVERVIEW" },
  { label: "Tables", icon: "▤", section: "RESTAURANT" },
  { label: "Menu Management", icon: "☷", section: "RESTAURANT" },
  { label: "Orders", icon: "▧", section: "RESTAURANT" },
  { label: "Inventory", icon: "▥", section: "MANAGEMENT" },
  { label: "Expenses", icon: "↗", section: "MANAGEMENT" },
  { label: "Reports", icon: "▨", section: "MANAGEMENT" },
  { label: "Settings", icon: "⚙", section: "SYSTEM" },
];

const initialOrders = [
  { id: "ORD-1048", customer: "Walk-in Customer", items: 3, total: 3450, type: "Dine In", status: "Completed", time: "10:42 AM" },
  { id: "ORD-1047", customer: "Walk-in Customer", items: 2, total: 1900, type: "Takeaway", status: "Preparing", time: "10:36 AM" },
  { id: "ORD-1046", customer: "Table 04", items: 4, total: 5200, type: "Dine In", status: "Completed", time: "10:21 AM" },
  { id: "ORD-1045", customer: "Walk-in Customer", items: 1, total: 850, type: "Takeaway", status: "Cancelled", time: "10:12 AM" },
  { id: "ORD-1044", customer: "Table 02", items: 3, total: 2800, type: "Dine In", status: "Completed", time: "09:58 AM" },
];

const initialTables = Array.from({ length: 12 }, (_, i) => ({
  number: i + 1,
  seats: i < 4 ? 2 : i < 9 ? 4 : 6,
  status: [2, 4, 7, 10].includes(i + 1) ? "Occupied" : [5, 9].includes(i + 1) ? "Reserved" : "Available",
}));

const money = (value: number) =>
  "Rs. " + value.toLocaleString("en-LK", { maximumFractionDigits: 2 });

function App() {
  const [page, setPage] = useState<Page>("Dashboard");
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orders, setOrders] = useState(initialOrders);
  const [tables, setTables] = useState(initialTables);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [orderType, setOrderType] = useState("Dine In");
  const [tableNumber, setTableNumber] = useState("04");
  const [payment, setPayment] = useState("Cash");
  const [discount, setDiscount] = useState("0");
  const [notice, setNotice] = useState("");
  const [orderFilter, setOrderFilter] = useState("All");
  const [menuFilter, setMenuFilter] = useState("All");
  const [expenseName, setExpenseName] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenses, setExpenses] = useState([
    { name: "Vegetable & food supplies", category: "Supplies", amount: 12500, date: "Today" },
    { name: "Cleaning materials", category: "Operations", amount: 2800, date: "Today" },
    { name: "Gas refill", category: "Utilities", amount: 4500, date: "Yesterday" },
  ]);
  const [settings, setSettings] = useState({
    restaurant: "Catamaran Surf Club",
    location: "Dewata Beach, Galle",
    currency: "LKR (Rs.)",
    receiptFooter: "Thank you for visiting us!",
    sound: true,
    compact: false,
  });

  const categories = ["All", ...Array.from(new Set(products.map((p) => p.category)))];

  const filteredProducts = useMemo(
    () =>
      products.filter(
        (p) =>
          p.available &&
          (category === "All" || p.category === category) &&
          p.name.toLowerCase().includes(search.toLowerCase()),
      ),
    [products, category, search],
  );

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const discountValue = Math.min(subtotal, Math.max(0, Number(discount) || 0));
  const total = Math.max(0, subtotal - discountValue);
  const todayExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

  function addToCart(product: Product) {
    setCart((current) => {
      const existing = current.find((item) => item.id === product.id);
      if (existing) {
        return current.map((item) =>
          item.id === product.id ? { ...item, qty: item.qty + 1 } : item,
        );
      }
      return [...current, { ...product, qty: 1 }];
    });
  }

  function changeQty(id: number, amount: number) {
    setCart((current) =>
      current
        .map((item) => (item.id === id ? { ...item, qty: item.qty + amount } : item))
        .filter((item) => item.qty > 0),
    );
  }

  function completeOrder() {
    if (cart.length === 0) {
      setNotice("Add at least one item before completing the order.");
      return;
    }
    const id = `ORD-${1049 + orders.length - initialOrders.length}`;
    setOrders((current) => [
      {
        id,
        customer: orderType === "Dine In" ? `Table ${tableNumber}` : "Walk-in Customer",
        items: cart.reduce((sum, item) => sum + item.qty, 0),
        total,
        type: orderType,
        status: "Completed",
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
      ...current,
    ]);
    setNotice(`Demo order ${id} completed successfully.`);
    setCart([]);
    setDiscount("0");
  }

  function addProduct() {
    const name = window.prompt("Enter menu item name:");
    if (!name?.trim()) return;
    const priceText = window.prompt("Enter price in LKR:", "1000");
    const price = Number(priceText);
    if (!Number.isFinite(price) || price <= 0) {
      setNotice("Enter a valid price to add this demo item.");
      return;
    }
    setProducts((current) => [
      ...current,
      {
        id: Math.max(0, ...current.map((p) => p.id)) + 1,
        name: name.trim(),
        category: "Food",
        price,
        stock: 10,
        emoji: "🍽️",
        available: true,
      },
    ]);
    setNotice(`${name.trim()} added to the demo menu.`);
  }

  function addExpense() {
    const amount = Number(expenseAmount);
    if (!expenseName.trim() || !Number.isFinite(amount) || amount <= 0) {
      setNotice("Enter an expense name and a valid amount.");
      return;
    }
    setExpenses((current) => [
      { name: expenseName.trim(), category: "General", amount, date: "Today" },
      ...current,
    ]);
    setExpenseName("");
    setExpenseAmount("");
    setNotice("Demo expense added.");
  }

  function toggleAvailability(id: number) {
    setProducts((current) =>
      current.map((p) => (p.id === id ? { ...p, available: !p.available } : p)),
    );
  }

  function renderDashboard() {
    return (
      <>
        <div className="welcome-row">
          <div>
            <div className="eyebrow">SUNDAY, OCTOBER 11, 2026 · DEMO VIEW</div>
            <h2>Good afternoon! <span className="wave">☀</span></h2>
            <p className="muted">Here’s what’s happening at your restaurant today.</p>
          </div>
          <button className="btn btn-primary" onClick={() => setPage("POS Billing")}>＋ New Order</button>
        </div>

        <div className="stats-grid">
          <StatCard icon="↗" tone="teal" label="Today's Revenue" value="Rs. 48,250" change="+12.8%" foot="vs. previous day" />
          <StatCard icon="▣" tone="blue" label="Total Orders" value="36" change="+8.2%" foot="vs. previous day" />
          <StatCard icon="◷" tone="orange" label="Average Order" value="Rs. 1,340" change="+4.6%" foot="per transaction" />
          <StatCard icon="♧" tone="purple" label="Low Stock Items" value={String(products.filter((p) => p.stock <= 10).length)} change="Needs attention" foot="check inventory" />
        </div>

        <div className="dashboard-grid">
          <section className="panel revenue-panel">
            <div className="panel-heading">
              <div><h3>Revenue Overview</h3><p className="muted">Sales performance for this week</p></div>
              <select className="small-select" defaultValue="This week">
                <option>This week</option><option>This month</option><option>This year</option>
              </select>
            </div>
            <div className="revenue-total">{money(284650)} <span className="growth">↗ 12.8%</span></div>
            <div className="chart">
              {[42, 65, 51, 82, 59, 94, 73].map((height, i) => (
                <div className="chart-column" key={i}>
                  <div className={`chart-bar ${i === 5 ? "highlight" : ""}`} style={{ height: `${height}%` }}>
                    {i === 5 && <span className="chart-tooltip">Rs. 48.2k</span>}
                  </div>
                  <span>{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i]}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-heading"><div><h3>Popular Items</h3><p className="muted">Top-selling menu items</p></div><button className="text-button" onClick={() => setPage("Menu Management")}>View menu →</button></div>
            <div className="popular-list">
              {products.slice(0, 4).map((p, i) => (
                <div className="popular-item" key={p.id}>
                  <div className="popular-rank">{String(i + 1).padStart(2, "0")}</div>
                  <div className="food-icon">{p.emoji}</div>
                  <div className="popular-info"><strong>{p.name}</strong><span>{[42, 35, 28, 24][i]} orders sold</span></div>
                  <strong className="popular-price">{money(p.price)}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="panel recent-panel">
            <div className="panel-heading"><div><h3>Recent Orders</h3><p className="muted">Latest restaurant activity</p></div><button className="text-button" onClick={() => setPage("Orders")}>All orders →</button></div>
            <OrderTable orders={orders.slice(0, 4)} />
          </section>

          <section className="panel quick-panel">
            <div className="panel-heading"><div><h3>Quick Actions</h3><p className="muted">Common tasks at a glance</p></div></div>
            <div className="quick-grid">
              <QuickAction icon="▣" title="New Order" desc="Start a customer bill" onClick={() => setPage("POS Billing")} />
              <QuickAction icon="☷" title="Add Menu Item" desc="Update your menu" onClick={addProduct} />
              <QuickAction icon="▤" title="Manage Tables" desc="View seating status" onClick={() => setPage("Tables")} />
              <QuickAction icon="▨" title="View Reports" desc="Check performance" onClick={() => setPage("Reports")} />
            </div>
          </section>
        </div>
      </>
    );
  }

  function renderPOS() {
    return (
      <div className="pos-layout">
        <section className="menu-browser">
          <div className="pos-title-row">
            <div><h2>Menu</h2><p className="muted">Choose items to add to the order.</p></div>
            <span className="demo-pill">DEMO MENU</span>
          </div>
          <div className="search-field"><span>⌕</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search food, drinks..." /><kbd>⌘ K</kbd></div>
          <div className="category-row">
            {categories.map((c) => <button key={c} className={`category-chip ${category === c ? "selected" : ""}`} onClick={() => setCategory(c)}>{c}</button>)}
          </div>
          <div className="product-grid">
            {filteredProducts.map((p) => (
              <button className="pos-product" key={p.id} onClick={() => addToCart(p)}>
                <div className="product-art"><span>{p.emoji}</span><span className="add-circle">＋</span></div>
                <div className="product-details"><span className="product-category">{p.category}</span><strong>{p.name}</strong><span className="product-price">{money(p.price)}</span></div>
              </button>
            ))}
            {filteredProducts.length === 0 && <div className="empty-state">No matching items found.</div>}
          </div>
        </section>

        <aside className="cart-panel">
          <div className="cart-heading"><div><h3>Current Order</h3><p className="muted">Order #{1049 + orders.length - initialOrders.length}</p></div><button className="icon-button" title="Clear order" onClick={() => setCart([])}>⌫</button></div>
          <div className="order-type-row">
            {["Dine In", "Takeaway"].map((type) => <button key={type} className={`order-type ${orderType === type ? "selected" : ""}`} onClick={() => setOrderType(type)}>{type === "Dine In" ? "♧" : "♧"} {type}</button>)}
          </div>
          {orderType === "Dine In" && <label className="field-label">Table number<select value={tableNumber} onChange={(e) => setTableNumber(e.target.value)}>{tables.map((t) => <option key={t.number} value={String(t.number).padStart(2, "0")}>Table {String(t.number).padStart(2, "0")}</option>)}</select></label>}
          <div className="cart-items">
            {cart.length === 0 ? <div className="cart-empty"><span>🛍️</span><strong>Your order is empty</strong><p>Select items from the menu to get started.</p></div> : cart.map((item) => (
              <div className="cart-item" key={item.id}>
                <div className="cart-food-icon">{item.emoji}</div>
                <div className="cart-item-info"><strong>{item.name}</strong><span>{money(item.price)}</span><div className="quantity-stepper"><button onClick={() => changeQty(item.id, -1)}>−</button><span>{item.qty}</span><button onClick={() => changeQty(item.id, 1)}>＋</button></div></div>
                <strong className="line-total">{money(item.price * item.qty)}</strong>
              </div>
            ))}
          </div>
          <div className="cart-summary">
            <div><span>Subtotal</span><strong>{money(subtotal)}</strong></div>
            <div className="discount-row"><label htmlFor="discount">Discount (Rs.)</label><input id="discount" type="number" min="0" max={subtotal} value={discount} onChange={(e) => setDiscount(e.target.value)} /></div>
            <div className="total-row"><span>Total</span><strong>{money(total)}</strong></div>
            <p className="field-label">Payment method</p>
            <div className="payment-row">{["Cash", "Card"].map((method) => <button key={method} className={`payment-option ${payment === method ? "selected" : ""}`} onClick={() => setPayment(method)}>{method === "Cash" ? "▤" : "▣"} {method}</button>)}</div>
            <button className="checkout-button" onClick={completeOrder}>Complete Order <span>→</span></button>
            <p className="checkout-note">Demo only · No real payment is processed</p>
          </div>
        </aside>
      </div>
    );
  }

  function renderTables() {
    return (
      <>
        <div className="welcome-row"><div><h2>Table Management</h2><p className="muted">Manage seating and table availability.</p></div><span className="demo-pill">12 TABLES</span></div>
        <div className="stats-grid three-stats">
          <StatCard icon="✓" tone="teal" label="Available" value={String(tables.filter((t) => t.status === "Available").length)} foot="Ready for guests" />
          <StatCard icon="♧" tone="orange" label="Occupied" value={String(tables.filter((t) => t.status === "Occupied").length)} foot="Currently serving" />
          <StatCard icon="◷" tone="purple" label="Reserved" value={String(tables.filter((t) => t.status === "Reserved").length)} foot="Booked tables" />
        </div>
        <div className="table-grid">
          {tables.map((t) => (
            <button key={t.number} className={`restaurant-table ${t.status.toLowerCase()}`} onClick={() => {
              const next = t.status === "Available" ? "Occupied" : t.status === "Occupied" ? "Reserved" : "Available";
              setTables((current) => current.map((x) => x.number === t.number ? { ...x, status: next } : x));
              setNotice(`Table ${String(t.number).padStart(2, "0")} marked ${next}.`);
            }}>
              <div className="table-card-top"><span>TABLE</span><span className="table-dot" /></div>
              <strong className="table-number">{String(t.number).padStart(2, "0")}</strong>
              <span className="table-seats">♧ {t.seats} seats</span>
              <span className="table-status">{t.status}</span>
              <span className="table-hint">Click to change status</span>
            </button>
          ))}
        </div>
        <p className="helper-note">Demo behavior: click a table to cycle between Available, Occupied and Reserved.</p>
      </>
    );
  }

  function renderMenuManagement() {
    const shown = products.filter((p) =>
      (menuFilter === "All" || p.category === menuFilter) &&
      p.name.toLowerCase().includes(search.toLowerCase()),
    );
    return (
      <>
        <div className="welcome-row"><div><h2>Menu Management</h2><p className="muted">Manage your food and beverage catalogue.</p></div><button className="btn btn-primary" onClick={addProduct}>＋ Add Menu Item</button></div>
        <div className="stats-grid three-stats">
          <StatCard icon="☷" tone="teal" label="Total Items" value={String(products.length)} foot="Across all categories" />
          <StatCard icon="✓" tone="blue" label="Available Items" value={String(products.filter((p) => p.available).length)} foot="Visible in POS billing" />
          <StatCard icon="◷" tone="orange" label="Unavailable" value={String(products.filter((p) => !p.available).length)} foot="Hidden from new orders" />
        </div>
        <section className="panel table-panel">
          <div className="table-toolbar"><div className="search-field compact-search"><span>⌕</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search menu items..." /></div><select className="small-select" value={menuFilter} onChange={(e) => setMenuFilter(e.target.value)}>{categories.map((c) => <option key={c}>{c}</option>)}</select></div>
          <div className="responsive-table"><table><thead><tr><th>Menu Item</th><th>Category</th><th>Price</th><th>Stock</th><th>Availability</th><th>Action</th></tr></thead><tbody>
            {shown.map((p) => <tr key={p.id}><td><div className="table-product"><span className="food-icon">{p.emoji}</span><strong>{p.name}</strong></div></td><td><span className="category-label">{p.category}</span></td><td><strong>{money(p.price)}</strong></td><td>{p.stock}</td><td><span className={`status-badge ${p.available ? "success" : "danger"}`}>{p.available ? "Available" : "Hidden"}</span></td><td><button className="btn btn-small btn-secondary" onClick={() => toggleAvailability(p.id)}>{p.available ? "Disable" : "Enable"}</button></td></tr>)}
          </tbody></table></div>
          <p className="helper-note">Demo menu changes are held in memory only. Restarting the app resets them.</p>
        </section>
      </>
    );
  }

  function renderOrders() {
    const shown = orders.filter((o) => orderFilter === "All" || o.status === orderFilter);
    return (
      <>
        <div className="welcome-row"><div><h2>Orders</h2><p className="muted">Track and review restaurant orders.</p></div><button className="btn btn-primary" onClick={() => setPage("POS Billing")}>＋ New Order</button></div>
        <div className="stats-grid three-stats">
          <StatCard icon="▣" tone="teal" label="All Orders" value={String(orders.length)} foot="Demo order history" />
          <StatCard icon="✓" tone="blue" label="Completed" value={String(orders.filter((o) => o.status === "Completed").length)} foot="Successfully closed" />
          <StatCard icon="◷" tone="orange" label="Preparing" value={String(orders.filter((o) => o.status === "Preparing").length)} foot="In progress" />
        </div>
        <section className="panel table-panel">
          <div className="table-toolbar"><div><h3>Order History</h3><p className="muted">Review recent transactions</p></div><select className="small-select" value={orderFilter} onChange={(e) => setOrderFilter(e.target.value)}>{["All", "Completed", "Preparing", "Cancelled"].map((f) => <option key={f}>{f}</option>)}</select></div>
          <OrderTable orders={shown} />
        </section>
      </>
    );
  }

  function renderInventory() {
    return (
      <>
        <div className="welcome-row"><div><h2>Inventory</h2><p className="muted">Keep track of stock and items that need attention.</p></div><button className="btn btn-primary" onClick={() => setNotice("Inventory adjustment form can be connected in the next UI iteration.")}>＋ Stock Adjustment</button></div>
        <div className="stats-grid three-stats">
          <StatCard icon="▥" tone="teal" label="Tracked Items" value={String(products.length)} foot="Demo inventory" />
          <StatCard icon="!" tone="orange" label="Low Stock" value={String(products.filter((p) => p.stock <= 10).length)} foot="10 units or fewer" />
          <StatCard icon="✓" tone="blue" label="In Stock" value={String(products.filter((p) => p.stock > 10).length)} foot="More than 10 units" />
        </div>
        <section className="panel table-panel"><div className="table-toolbar"><div><h3>Stock Overview</h3><p className="muted">Current demo quantities</p></div><span className="demo-pill">SAMPLE DATA</span></div>
          <div className="responsive-table"><table><thead><tr><th>Item</th><th>Category</th><th>Quantity</th><th>Stock Level</th><th>Status</th><th>Action</th></tr></thead><tbody>
            {products.map((p) => <tr key={p.id}><td><div className="table-product"><span className="food-icon">{p.emoji}</span><strong>{p.name}</strong></div></td><td>{p.category}</td><td><strong>{p.stock} units</strong></td><td><div className="stock-track"><span className={p.stock <= 10 ? "low" : ""} style={{ width: `${Math.min(100, p.stock * 2.5)}%` }} /></div></td><td><span className={`status-badge ${p.stock <= 10 ? "warning" : "success"}`}>{p.stock <= 10 ? "Low Stock" : "In Stock"}</span></td><td><button className="btn btn-small btn-secondary" onClick={() => setProducts((current) => current.map((x) => x.id === p.id ? { ...x, stock: x.stock + 5 } : x))}>＋ 5 units</button></td></tr>)}
          </tbody></table></div>
        </section>
      </>
    );
  }

  function renderExpenses() {
    return (
      <>
        <div className="welcome-row"><div><h2>Expenses</h2><p className="muted">Record and review daily operating costs.</p></div><span className="demo-pill">DEMO DATA</span></div>
        <div className="stats-grid three-stats"><StatCard icon="↗" tone="orange" label="Recorded Expenses" value={money(todayExpenses)} foot="Current demo list" /><StatCard icon="▤" tone="teal" label="Entries" value={String(expenses.length)} foot="Expense records" /><StatCard icon="◷" tone="purple" label="Average Expense" value={money(expenses.length ? Math.round(todayExpenses / expenses.length) : 0)} foot="Per entry" /></div>
        <div className="two-column-content">
          <section className="panel form-panel"><h3>Add Expense</h3><p className="muted">Enter a sample expense to preview the workflow.</p><form onSubmit={(e) => { e.preventDefault(); addExpense(); }}><label className="field-label">Expense description<input value={expenseName} onChange={(e) => setExpenseName(e.target.value)} placeholder="e.g. Fresh vegetables" /></label><label className="field-label">Amount (LKR)<input type="number" min="1" value={expenseAmount} onChange={(e) => setExpenseAmount(e.target.value)} placeholder="Enter amount" /></label><button className="btn btn-primary" type="submit">＋ Add Expense</button></form></section>
          <section className="panel"><div className="panel-heading"><div><h3>Expense Categories</h3><p className="muted">Example allocation</p></div></div><div className="expense-category"><div><span className="category-dot teal-dot" />Supplies</div><strong>48%</strong></div><div className="progress-track"><span style={{ width: "48%" }} /></div><div className="expense-category"><div><span className="category-dot blue-dot" />Utilities</div><strong>28%</strong></div><div className="progress-track blue-progress"><span style={{ width: "28%" }} /></div><div className="expense-category"><div><span className="category-dot orange-dot" />Operations</div><strong>24%</strong></div><div className="progress-track orange-progress"><span style={{ width: "24%" }} /></div></section>
        </div>
        <section className="panel table-panel"><div className="table-toolbar"><div><h3>Recent Expenses</h3><p className="muted">Latest demo entries</p></div></div><div className="responsive-table"><table><thead><tr><th>Description</th><th>Category</th><th>Date</th><th>Amount</th></tr></thead><tbody>{expenses.map((e, i) => <tr key={`${e.name}-${i}`}><td><strong>{e.name}</strong></td><td><span className="category-label">{e.category}</span></td><td>{e.date}</td><td><strong>{money(e.amount)}</strong></td></tr>)}</tbody></table></div></section>
      </>
    );
  }

  function renderReports() {
    const paymentTotal = orders.reduce((sum, o) => sum + o.total, 0);
    return (
      <>
        <div className="welcome-row"><div><h2>Reports & Analytics</h2><p className="muted">A quick overview of sample restaurant performance.</p></div><button className="btn btn-secondary" onClick={() => setNotice("Report export will be implemented in a later step.")}>⇩ Export Report</button></div>
        <div className="stats-grid three-stats"><StatCard icon="↗" tone="teal" label="Order Value Total" value={money(paymentTotal)} foot="Visible order history" /><StatCard icon="▣" tone="blue" label="Orders Recorded" value={String(orders.length)} foot="Sample transactions" /><StatCard icon="↗" tone="purple" label="Expenses Recorded" value={money(todayExpenses)} foot="Sample expenses" /></div>
        <div className="dashboard-grid report-grid">
          <section className="panel revenue-panel"><div className="panel-heading"><div><h3>Weekly Sales</h3><p className="muted">Illustrative sales chart</p></div><span className="demo-pill">SAMPLE</span></div><div className="revenue-total">Rs. 284,650 <span className="growth">↗ 12.8%</span></div><div className="chart tall-chart">{[48, 62, 43, 77, 56, 92, 69].map((height, i) => <div className="chart-column" key={i}><div className={`chart-bar ${i === 5 ? "highlight" : ""}`} style={{ height: `${height}%` }} /><span>{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i]}</span></div>)}</div></section>
          <section className="panel"><div className="panel-heading"><div><h3>Payment Methods</h3><p className="muted">Illustrative breakdown</p></div></div><div className="payment-breakdown"><div className="donut"><div><strong>100%</strong><span>Demo</span></div></div><div className="payment-legend"><div><span className="category-dot teal-dot" />Cash <strong>65%</strong></div><div><span className="category-dot blue-dot" />Card <strong>35%</strong></div></div></div></section>
          <section className="panel"><div className="panel-heading"><div><h3>Top Menu Items</h3><p className="muted">Example ranking</p></div></div>{products.slice(0, 5).map((p, i) => <div className="report-item" key={p.id}><span className="food-icon">{p.emoji}</span><span>{p.name}</span><strong>{[42, 35, 28, 24, 19][i]} sold</strong></div>)}</section>
          <section className="panel"><div className="panel-heading"><div><h3>Report Notes</h3><p className="muted">Before using real figures</p></div></div><div className="note-box">These charts and figures are sample UI data. They are not calculated from real restaurant transactions.</div><div className="note-box">When the UI is approved, we can define the real report calculations and connect them to local storage or a database.</div></section>
        </div>
      </>
    );
  }

  function renderSettings() {
    return (
      <>
        <div className="welcome-row"><div><h2>Settings</h2><p className="muted">Customize the POS experience for your restaurant.</p></div><span className="demo-pill">LOCAL DEMO</span></div>
        <div className="settings-layout">
          <nav className="settings-nav"><div className="settings-nav-item active">▣ General</div><div className="settings-nav-item">▤ Receipt</div><div className="settings-nav-item">♧ Orders</div><div className="settings-nav-item">⚙ Preferences</div></nav>
          <section className="panel settings-panel"><div className="settings-section-heading"><div><h3>Restaurant Information</h3><p className="muted">Details shown around your POS interface.</p></div><span className="settings-icon">♧</span></div>
            <label className="field-label">Restaurant name<input value={settings.restaurant} onChange={(e) => setSettings({ ...settings, restaurant: e.target.value })} /></label>
            <label className="field-label">Location / address<input value={settings.location} onChange={(e) => setSettings({ ...settings, location: e.target.value })} /></label>
            <label className="field-label">Currency<select value={settings.currency} onChange={(e) => setSettings({ ...settings, currency: e.target.value })}><option>LKR (Rs.)</option><option>USD ($)</option><option>EUR (€)</option></select></label>
            <div className="settings-divider" /><div className="settings-section-heading"><div><h3>POS Preferences</h3><p className="muted">Demo preferences for this session.</p></div></div>
            <div className="setting-toggle-row"><div><strong>Interface sounds</strong><p className="muted">Enable sound feedback for actions.</p></div><button className={`toggle ${settings.sound ? "on" : ""}`} onClick={() => setSettings({ ...settings, sound: !settings.sound })}><span /></button></div>
            <div className="setting-toggle-row"><div><strong>Compact layout</strong><p className="muted">Use a tighter interface layout.</p></div><button className={`toggle ${settings.compact ? "on" : ""}`} onClick={() => setSettings({ ...settings, compact: !settings.compact })}><span /></button></div>
            <div className="settings-divider" /><label className="field-label">Receipt footer message<input value={settings.receiptFooter} onChange={(e) => setSettings({ ...settings, receiptFooter: e.target.value })} /></label>
            <button className="btn btn-primary" onClick={() => setNotice("Demo settings updated for this session.")}>Save Preferences</button><p className="helper-note">Settings are not saved permanently yet.</p>
          </section>
        </div>
      </>
    );
  }

  const pageDescriptions: Record<Page, string> = {
    Dashboard: "Restaurant overview",
    "POS Billing": "Fast and simple order entry",
    Tables: "Seating and table status",
    "Menu Management": "Food and beverage catalogue",
    Orders: "Order history and status",
    Inventory: "Stock and supplies",
    Expenses: "Operating cost tracking",
    Reports: "Sales insights and summaries",
    Settings: "Restaurant preferences",
  };

  function renderPage() {
    switch (page) {
      case "Dashboard": return renderDashboard();
      case "POS Billing": return renderPOS();
      case "Tables": return renderTables();
      case "Menu Management": return renderMenuManagement();
      case "Orders": return renderOrders();
      case "Inventory": return renderInventory();
      case "Expenses": return renderExpenses();
      case "Reports": return renderReports();
      case "Settings": return renderSettings();
    }
  }

  return (
    <div className={`app-shell ${settings.compact ? "compact-mode" : ""}`}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><span>CS</span><i>✦</i></div>
          <div className="brand-copy"><strong>CATAMARAN</strong><span>SURF CLUB · POS</span></div>
        </div>
        <div className="sidebar-restaurant"><span className="restaurant-avatar">C</span><div><strong>{settings.restaurant}</strong><span>Restaurant workspace</span></div><span className="workspace-dots">•••</span></div>
        <nav className="side-nav">
          {(["OVERVIEW", "RESTAURANT", "MANAGEMENT", "SYSTEM"] as const).map((section) => (
            <div className="nav-section" key={section}>
              <span className="nav-section-label">{section}</span>
              {navigation.filter((item) => item.section === section).map((item) => (
                <button key={item.label} className={`nav-link ${page === item.label ? "active" : ""}`} onClick={() => { setPage(item.label); setNotice(""); }}>
                  <span className="nav-icon">{item.icon}</span><span>{item.label}</span>{item.label === "Inventory" && products.some((p) => p.stock <= 10) && <span className="nav-alert">!</span>}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="offline-status"><span className="online-dot" /><div><strong>Offline-ready UI</strong><span>Local desktop interface</span></div></div>
          <div className="user-profile"><div className="user-avatar">A</div><div><strong>Administrator</strong><span>Restaurant Manager</span></div><button className="profile-more" onClick={() => setPage("Settings")}>•••</button></div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb"><span>Catamaran POS</span><span className="crumb-slash">/</span><strong>{page}</strong></div>
          <div className="topbar-right"><div className="offline-badge"><span className="online-dot" /> Offline mode</div><div className="topbar-divider" /><button className="top-icon" title="Notifications" onClick={() => setNotice("No new notifications in this demo.")}>♧<i /></button><div className="top-date"><span>LOCAL WORKSPACE</span><strong>Sunday, 11 October</strong></div><div className="top-avatar">A</div></div>
        </header>

        <div className="page-content">
          {page !== "POS Billing" && <div className="page-intro"><div><span className="page-kicker">CATAMARAN SURF CLUB</span><h1>{page}</h1><p>{pageDescriptions[page]}</p></div><span className="local-tag"><span className="online-dot" /> DEMO WORKSPACE</span></div>}
          {notice && <div className="notice-banner"><span>✓</span>{notice}<button onClick={() => setNotice("")}>×</button></div>}
          {renderPage()}
          <footer className="app-footer"><span>© 2026 Catamaran Surf Club POS</span><span><span className="online-dot" /> Local demo · No database connected</span></footer>
        </div>
      </main>
    </div>
  );
}

function StatCard({ icon, tone, label, value, change, foot }: {
  icon: string; tone: string; label: string; value: string; change?: string; foot: string;
}) {
  return <div className="stat-card"><div className="stat-top"><span className={`stat-icon ${tone}`}>{icon}</span>{change && <span className={`stat-change ${change.startsWith("+") ? "positive" : ""}`}>{change}</span>}</div><span className="stat-label">{label}</span><strong className="stat-value">{value}</strong><span className="stat-foot">{foot}</span></div>;
}

function QuickAction({ icon, title, desc, onClick }: { icon: string; title: string; desc: string; onClick: () => void }) {
  return <button className="quick-action" onClick={onClick}><span className="quick-icon">{icon}</span><span className="quick-text"><strong>{title}</strong><small>{desc}</small></span><span className="quick-arrow">↗</span></button>;
}

function OrderTable({ orders }: { orders: { id: string; customer: string; items: number; total: number; type: string; status: string; time: string }[] }) {
  return <div className="responsive-table"><table><thead><tr><th>Order ID</th><th>Customer / Table</th><th>Items</th><th>Total</th><th>Status</th><th>Time</th></tr></thead><tbody>{orders.map((o) => <tr key={o.id}><td><strong className="order-id">{o.id}</strong></td><td>{o.customer}</td><td>{o.items}</td><td><strong>{money(o.total)}</strong></td><td><span className={`status-badge ${o.status === "Completed" ? "success" : o.status === "Preparing" ? "warning" : "danger"}`}>{o.status}</span></td><td className="time-cell">{o.time}</td></tr>)}</tbody></table>{orders.length === 0 && <div className="empty-state">No orders match this filter.</div>}</div>;
}

export default App;
