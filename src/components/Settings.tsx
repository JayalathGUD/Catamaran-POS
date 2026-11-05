import React, { useState } from 'react'
import logoImg from '../assets/logo.png'
import { NavigationPage, PosSettings } from '../types'
import { usePosSettings } from '../utils/settingsStore'
import {
  IconCheck,
  IconClock,
  IconPrinter,
  IconRotateCcw,
  IconSettings,
  IconUser
} from './Icons'

interface SettingsProps {
  onNavigate?: (page: NavigationPage) => void
}

export const Settings: React.FC<SettingsProps> = ({ onNavigate }) => {
  const { settings, saveSettings, isLoading } = usePosSettings()

  // Form state initialized with currently active settings
  const [formData, setFormData] = useState<PosSettings>({ ...settings })
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [previewTab, setPreviewTab] = useState<'customer' | 'kitchen'>('customer')

  // Keep form data in sync if settings load from backend
  React.useEffect(() => {
    setFormData({ ...settings })
  }, [settings])

  const showToast = (msg: string): void => {
    setToastMessage(msg)
    setTimeout(() => {
      setToastMessage(null)
    }, 4000)
  }

  const handleChange = (field: keyof PosSettings, value: unknown): void => {
    setFormData((prev) => ({
      ...prev,
      [field]: value
    }))
  }

  const handleSave = async (e?: React.FormEvent): Promise<void> => {
    if (e) e.preventDefault()
    try {
      const saved = await saveSettings(formData)
      setFormData(saved)
      showToast(`Settings saved successfully! Cashier name updated to "${saved.cashierName}".`)
    } catch {
      showToast('Failed to save settings. Please check network connection.')
    }
  }

  const cashierPresets = [
    'Kasun P.',
    'Amila Perera',
    'Ruwan Silva',
    'Nipuna K.',
    'Main Cashier',
    'Bar Supervisor'
  ]

  return (
    <div className="pos-settings-page">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="settings-toast-banner" role="alert">
          <IconCheck size={18} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Page Header */}
      <div className="settings-page-header">
        <div className="settings-header-left">
          <div className="settings-icon-badge">
            <IconSettings size={22} />
          </div>
          <div>
            <div style={{ marginBottom: '4px' }}>
              <span className="system-location-tag">⚙️ Catamaran POS Configuration</span>
            </div>
            <h1 className="settings-title">System &amp; POS Settings</h1>
            <p className="settings-subtitle">
              Manage the active Cashier Name, receipt branding, 80mm thermal printer parameters, and business metadata.
            </p>
          </div>
        </div>

        <div className="settings-header-actions">
          <button
            type="button"
            className="btn-save-settings"
            onClick={() => handleSave()}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <IconRotateCcw size={16} style={{ animation: 'spin 1s linear infinite' }} />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <IconCheck size={16} />
                <span>Save Settings</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Grid: Form on Left (60%), Live 80mm Thermal Preview on Right (40%) */}
      <div className="settings-layout-grid">
        {/* ========================================================
           LEFT: Configuration Sections
           ======================================================== */}
        <div className="settings-form-col">
          {/* Section 1: Active Cashier Configuration */}
          <section className="settings-card settings-card-primary">
            <div className="settings-card-header">
              <div className="card-header-icon user-icon-box">
                <IconUser size={18} />
              </div>
              <div>
                <h2 className="card-title">Cashier &amp; Shift Identity (මුදල් අයකැමිගේ නම)</h2>
                <p className="card-desc">
                  Enter the active cashier’s name. This exact name will automatically print on all customer receipts and kitchen tickets (KOT).
                </p>
              </div>
            </div>

            <div className="settings-card-body">
              <div className="settings-field-group">
                <label htmlFor="cashier-name-input" className="settings-label">
                  Active Cashier Name <span className="text-required">*</span>
                </label>
                <div className="settings-input-wrapper">
                  <span className="input-prefix-icon">
                    <IconUser size={16} />
                  </span>
                  <input
                    id="cashier-name-input"
                    type="text"
                    className="settings-text-input"
                    placeholder="e.g. Kasun P. or Amila Perera"
                    value={formData.cashierName}
                    onChange={(e) => handleChange('cashierName', e.target.value)}
                    required
                  />
                </div>
                <span className="settings-field-tip">
                  💡 This name prints under <strong>SERVER / CASHIER</strong> on 80mm thermal receipts and kitchen tickets.
                </span>

                {/* Quick Presets */}
                <div className="cashier-presets-row">
                  <span className="presets-label">Quick Presets:</span>
                  <div className="presets-chips">
                    {cashierPresets.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        className={`preset-chip ${formData.cashierName === preset ? 'active' : ''}`}
                        onClick={() => handleChange('cashierName', preset)}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Section 2: Restaurant Identity & Bill Header */}
          <section className="settings-card">
            <div className="settings-card-header">
              <div className="card-header-icon restaurant-icon-box">
                <IconPrinter size={18} />
              </div>
              <div>
                <h2 className="card-title">Restaurant Receipt Header &amp; Branding</h2>
                <p className="card-desc">
                  Customize the business branding printed at the top of 80mm thermal paper rolls.
                </p>
              </div>
            </div>

            <div className="settings-card-body">
              <div className="settings-fields-row">
                <div className="settings-field-group">
                  <label htmlFor="restaurant-name-input" className="settings-label">
                    Restaurant Trade Name
                  </label>
                  <input
                    id="restaurant-name-input"
                    type="text"
                    className="settings-text-input"
                    value={formData.restaurantName}
                    onChange={(e) => handleChange('restaurantName', e.target.value)}
                  />
                </div>

                <div className="settings-field-group">
                  <label htmlFor="restaurant-tagline-input" className="settings-label">
                    Tagline / Subheading
                  </label>
                  <input
                    id="restaurant-tagline-input"
                    type="text"
                    className="settings-text-input"
                    value={formData.restaurantTagline}
                    onChange={(e) => handleChange('restaurantTagline', e.target.value)}
                  />
                </div>
              </div>

              <div className="settings-fields-row" style={{ marginTop: '14px' }}>
                <div className="settings-field-group">
                  <label htmlFor="restaurant-phone-input" className="settings-label">
                    Hotline / Telephone Numbers
                  </label>
                  <input
                    id="restaurant-phone-input"
                    type="text"
                    className="settings-text-input"
                    value={formData.restaurantPhone}
                    onChange={(e) => handleChange('restaurantPhone', e.target.value)}
                  />
                </div>

                <div className="settings-field-group">
                  <label htmlFor="restaurant-address-input" className="settings-label">
                    Location / Address
                  </label>
                  <input
                    id="restaurant-address-input"
                    type="text"
                    className="settings-text-input"
                    value={formData.restaurantAddress}
                    onChange={(e) => handleChange('restaurantAddress', e.target.value)}
                  />
                </div>
              </div>

              <div className="settings-fields-row" style={{ marginTop: '14px' }}>
                <div className="settings-field-group">
                  <label htmlFor="restaurant-website-input" className="settings-label">
                    Official Website URL (බිල්පතේ මුද්‍රණය වන වෙබ් ලිපිනය)
                  </label>
                  <input
                    id="restaurant-website-input"
                    type="text"
                    className="settings-text-input"
                    placeholder="https://www.catamaransurfclubdewata.com"
                    value={formData.restaurantWebsite ?? ''}
                    onChange={(e) => handleChange('restaurantWebsite', e.target.value)}
                  />
                  <span className="settings-field-tip">
                    🌐 Prints on the 80mm thermal receipt footer and PDF downloads.
                  </span>
                </div>

                <div className="settings-field-group">
                  <label htmlFor="instagram-handle-input" className="settings-label">
                    Instagram Handle
                  </label>
                  <input
                    id="instagram-handle-input"
                    type="text"
                    className="settings-text-input"
                    placeholder="@catamaranbeachrestaurant"
                    value={formData.instagramHandle ?? ''}
                    onChange={(e) => handleChange('instagramHandle', e.target.value)}
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Section 3: 80mm Thermal Printer Defaults & Footer Credits */}
          <section className="settings-card">
            <div className="settings-card-header">
              <div className="card-header-icon printer-icon-box">
                <IconClock size={18} />
              </div>
              <div>
                <h2 className="card-title">Billing &amp; Thermal Printer Defaults</h2>
                <p className="card-desc">
                  Default parameters applied when cashiers ring up food and drinks.
                </p>
              </div>
            </div>

            <div className="settings-card-body">
              <div className="settings-fields-row">
                <div className="settings-field-group">
                  <label htmlFor="service-charge-input" className="settings-label">
                    Default Service Charge (%)
                  </label>
                  <input
                    id="service-charge-input"
                    type="number"
                    className="settings-text-input"
                    min="0"
                    max="100"
                    value={formData.defaultServiceCharge}
                    onChange={(e) => handleChange('defaultServiceCharge', Number(e.target.value) || 0)}
                  />
                </div>

                <div className="settings-field-group">
                  <label htmlFor="payment-method-select" className="settings-label">
                    Default Payment Method
                  </label>
                  <select
                    id="payment-method-select"
                    className="settings-select-input"
                    value={formData.defaultPaymentMethod}
                    onChange={(e) => handleChange('defaultPaymentMethod', e.target.value as 'Cash' | 'Card')}
                  >
                    <option value="Cash">Cash (Recommended)</option>
                    <option value="Card">Card (Visa / Mastercard)</option>
                  </select>
                </div>
              </div>

              {/* Auto print toggle */}
              <div className="settings-checkbox-item" style={{ marginTop: '16px' }}>
                <label className="checkbox-container">
                  <input
                    type="checkbox"
                    checked={formData.autoPrintReceipt}
                    onChange={(e) => handleChange('autoPrintReceipt', e.target.checked)}
                  />
                  <span className="checkbox-custom" />
                  <span className="checkbox-label-text">
                    <strong>Auto-trigger 80mm Print Dialog upon Bill Settlement</strong>
                    <small>When enabled, clicking "Settle &amp; Print Bill" pops open the printer prompt immediately.</small>
                  </span>
                </label>
              </div>

              {/* Software Developer Credit */}
              <div className="settings-field-group" style={{ marginTop: '16px' }}>
                <label htmlFor="software-credit-input" className="settings-label">
                  Software Developer Credit (Footer)
                </label>
                <input
                  id="software-credit-input"
                  type="text"
                  className="settings-text-input"
                  value={formData.softwareCredit}
                  onChange={(e) => handleChange('softwareCredit', e.target.value)}
                />
              </div>
            </div>
          </section>

          {/* Bottom Save Action */}
          <div className="settings-bottom-actions">
            <button
              type="button"
              className="btn-save-settings btn-save-large"
              onClick={() => handleSave()}
              disabled={isLoading}
            >
              <IconCheck size={18} />
              <span>Save All Settings</span>
            </button>
            {onNavigate && (
              <button
                type="button"
                className="btn-back-pos"
                onClick={() => onNavigate('POS Billing')}
              >
                Go to POS Terminal
              </button>
            )}
          </div>
        </div>

        {/* ========================================================
           RIGHT: Live 80mm Thermal Preview
           ======================================================== */}
        <div className="settings-preview-col">
          <div className="settings-preview-sticky">
            <div className="preview-card-header">
              <span className="preview-kicker">Live Real-Time Simulation</span>
              <h3 className="preview-title">80mm Thermal Receipt Preview</h3>
              <p className="preview-sub">
                Notice how changing the cashier name on the left updates the receipt below instantaneously:
              </p>

              {/* Preview Tab switcher */}
              <div className="preview-tab-row">
                <button
                  type="button"
                  className={`preview-tab-pill ${previewTab === 'customer' ? 'active' : ''}`}
                  onClick={() => setPreviewTab('customer')}
                >
                  Customer Bill
                </button>
                <button
                  type="button"
                  className={`preview-tab-pill ${previewTab === 'kitchen' ? 'active' : ''}`}
                  onClick={() => setPreviewTab('kitchen')}
                >
                  Kitchen KOT
                </button>
              </div>
            </div>

            {/* Simulated 80mm Paper */}
            <div
              className="preview-paper-container"
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}
            >
              <div
                className="thermal-paper-80mm pro-receipt-paper"
                style={{
                  width: '380px',
                  maxWidth: '100%',
                  margin: '0 auto',
                  backgroundColor: '#ffffff',
                  height: 'auto',
                  minHeight: 'fit-content',
                  flexShrink: 0
                }}
              >
                {previewTab === 'customer' ? (
                  /* Customer Bill Preview */
                  <div className="customer-ticket-content">
                    {/* Header */}
                    <div className="t-center t-header pro-brand-header">
                      <div className="pro-receipt-logo-wrap">
                        <img
                          src={logoImg}
                          alt="Restaurant Logo"
                          className="pro-receipt-logo"
                        />
                      </div>
                      <h1 className="pro-restaurant-name">{formData.restaurantName || 'CATAMARAN BEACH RESTAURANT'}</h1>
                      <span className="pro-restaurant-tagline">{formData.restaurantTagline || 'BEACHFRONT DINING · BAR · SURF'}</span>
                      <span className="t-branch">{formData.restaurantAddress || 'DEWATA BEACH, GALLE, SRI LANKA'}</span>
                      <span className="t-hotline">TEL: {formData.restaurantPhone || '+94 91 224 8890'}</span>
                    </div>

                    <div className="t-rule-double" />

                    <div className="t-center pro-receipt-banner">
                      <span className="official-receipt-title">*** OFFICIAL DINING BILL ***</span>
                    </div>

                    <div className="t-rule-dash" />

                    {/* Metadata showing dynamic cashier name */}
                    <div className="t-meta-block">
                      <div className="t-flex">
                        <span className="t-meta-k">BILL NO:</span>
                        <strong className="t-meta-v t-bill-no">BILL-2026-0015</strong>
                      </div>
                      <div className="t-flex">
                        <span className="t-meta-k">DATE &amp; TIME:</span>
                        <span className="t-meta-v">03 Nov 2026 06:45 PM</span>
                      </div>
                      <div className="t-flex" style={{ backgroundColor: '#fef3c7', padding: '2px 4px', borderRadius: '3px' }}>
                        <span className="t-meta-k">SERVER / CASHIER:</span>
                        <strong className="t-meta-v" style={{ color: '#92400e', fontWeight: 900 }}>
                          {formData.cashierName || 'Kasun P.'}
                        </strong>
                      </div>
                      <div className="t-flex">
                        <span className="t-meta-k">ORDER TYPE:</span>
                        <strong className="t-meta-v t-badge-pill">DINE-IN</strong>
                      </div>
                      <div className="t-flex">
                        <span className="t-meta-k">TABLE / GUEST:</span>
                        <strong className="t-meta-v">TABLE 04</strong>
                      </div>
                    </div>

                    <div className="t-rule-dash" />

                    {/* Sample Items */}
                    <table className="t-table pro-items-table">
                      <thead>
                        <tr>
                          <th className="t-th-item">ITEM</th>
                          <th className="t-th-qty">QTY</th>
                          <th className="t-th-rate">PRICE</th>
                          <th className="t-th-amt">TOTAL</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="t-td-item">
                            <div className="t-item-name">DEVILLED PRAWNS (L)</div>
                          </td>
                          <td className="t-td-qty">2</td>
                          <td className="t-td-rate">1,600</td>
                          <td className="t-td-amt">3,200</td>
                        </tr>
                        <tr>
                          <td className="t-td-item">
                            <div className="t-item-name">SEAFOOD FRIED RICE</div>
                          </td>
                          <td className="t-td-qty">1</td>
                          <td className="t-td-rate">1,500</td>
                          <td className="t-td-amt">1,500</td>
                        </tr>
                        <tr>
                          <td className="t-td-item">
                            <div className="t-item-name">FRESH KING COCONUT</div>
                          </td>
                          <td className="t-td-qty">2</td>
                          <td className="t-td-rate">500</td>
                          <td className="t-td-amt">1,000</td>
                        </tr>
                      </tbody>
                    </table>

                    <div className="t-rule-dash" />

                    {/* Summary */}
                    <div className="t-summary-block">
                      <div className="t-flex">
                        <span>SUBTOTAL:</span>
                        <span>Rs. 5,700.00</span>
                      </div>
                      <div className="t-flex">
                        <span>SERVICE CHARGE ({formData.defaultServiceCharge}%):</span>
                        <span>Rs. 570.00</span>
                      </div>

                      <div className="t-rule-double" />

                      <div className="t-flex t-total-line pro-grand-total">
                        <strong>GRAND TOTAL:</strong>
                        <strong>Rs. 6,270.00</strong>
                      </div>

                      <div className="t-rule-double" />

                      {/* Payment & Tendered */}
                      <div className="pro-payment-tender-box">
                        <div className="t-flex t-tender-row">
                          <span className="t-tender-lbl">PAYMENT METHOD:</span>
                          <strong className="t-tender-val">{formData.defaultPaymentMethod.toUpperCase()}</strong>
                        </div>
                        <div className="t-flex t-tender-row t-highlight-tendered">
                          <span className="t-tender-lbl">CUSTOMER TENDERED (දෙන මුදල):</span>
                          <strong className="t-tender-val">Rs. 7,000.00</strong>
                        </div>
                        <div className="t-flex t-tender-row t-highlight-change">
                          <span className="t-tender-lbl">CHANGE RETURNED (ඉතිරි මුදල):</span>
                          <strong className="t-tender-val t-change-val">Rs. 730.00</strong>
                        </div>
                      </div>
                    </div>

                    <div className="t-rule-dash" />

                    {/* Footer */}
                    <div className="t-center t-footer pro-receipt-footer">
                      <div className="pro-item-count">Total Items: 3 &middot; Total Units: 5</div>
                      <span className="pro-thankyou-msg">THANK YOU FOR DINING WITH US!</span>
                      <span className="pro-vibe">FRESH SEAFOOD &middot; COCKTAILS &middot; GOOD VIBES</span>
                      <span className="pro-ig">Follow Us on Instagram: {formData.instagramHandle || '@catamaranbeachrestaurant'}</span>
                      {formData.restaurantWebsite && (
                        <span className="pro-web" style={{ display: 'block', wordBreak: 'break-all', fontSize: '9px', fontWeight: 600 }}>
                          {formData.restaurantWebsite}
                        </span>
                      )}
                      <span className="pro-visit-again">Please Visit Us Again</span>
                      <span className="t-paper-cut">[ - - - - - - - - - THANK YOU - - - - - - - - - ]</span>

                      <div className="pro-software-credit">
                        {formData.softwareCredit || 'Software by Nexion Solution'}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Kitchen Ticket Preview */
                  <div className="kot-ticket-content">
                    <div className="t-center kot-header">
                      <div className="kot-badge-title">*** KITCHEN ORDER TICKET (KOT) ***</div>
                      <h2 className="kot-restaurant-name">{formData.restaurantName || 'CATAMARAN BEACH RESTAURANT'}</h2>
                      <div className="kot-order-badge-row">
                        <span className="kot-order-type-badge">DINE-IN · TABLE 04</span>
                      </div>
                    </div>

                    <div className="t-rule-double" />

                    <div className="kot-meta-block">
                      <div className="t-flex">
                        <span className="kot-meta-k">KOT REF / BILL:</span>
                        <strong className="kot-meta-v kot-bold-num">KOT-2026-0015</strong>
                      </div>
                      <div className="t-flex">
                        <span className="kot-meta-k">DATE &amp; TIME:</span>
                        <span className="kot-meta-v">03 Nov 2026 06:45 PM</span>
                      </div>
                      <div className="t-flex" style={{ backgroundColor: '#fef3c7', padding: '2px 4px', borderRadius: '3px' }}>
                        <span className="kot-meta-k">SERVER:</span>
                        <strong className="kot-meta-v" style={{ color: '#92400e', fontWeight: 900 }}>
                          {formData.cashierName || 'Kasun P.'}
                        </strong>
                      </div>
                      <div className="t-flex">
                        <span className="kot-meta-k">TABLE / GUEST:</span>
                        <strong className="kot-meta-v kot-guest-highlight">TABLE 04</strong>
                      </div>
                    </div>

                    <div className="t-rule-double" />

                    <div className="kot-items-section">
                      <div className="kot-items-header">
                        <span className="kot-th-qty">QTY</span>
                        <span className="kot-th-name">ITEM DESCRIPTION</span>
                      </div>
                      <div className="t-rule-dash" />

                      <div className="kot-items-list">
                        <div className="kot-item-row">
                          <span className="kot-item-qty"><strong>2</strong>x</span>
                          <div className="kot-item-info">
                            <span className="kot-item-name">DEVILLED PRAWNS (L)</span>
                          </div>
                        </div>
                        <div className="kot-item-row">
                          <span className="kot-item-qty"><strong>1</strong>x</span>
                          <div className="kot-item-info">
                            <span className="kot-item-name">SEAFOOD FRIED RICE</span>
                          </div>
                        </div>
                        <div className="kot-item-row">
                          <span className="kot-item-qty"><strong>2</strong>x</span>
                          <div className="kot-item-info">
                            <span className="kot-item-name">FRESH KING COCONUT</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="t-rule-double" />

                    <div className="kot-summary">
                      <div className="t-flex">
                        <span>TOTAL ITEMS:</span>
                        <strong>3 dishes</strong>
                      </div>
                      <div className="t-flex">
                        <span>TOTAL QUANTITY:</span>
                        <strong>5 portions</strong>
                      </div>
                    </div>

                    <div className="t-rule-dash" />

                    <div className="t-center kot-footer">
                      <div className="kot-instruction-box">*** PLEASE PREPARE FRESH &amp; HOT ***</div>
                      <span className="kot-sent-note">Order Sent to Kitchen</span>
                      <span className="t-paper-cut">[ - - - - - - - KITCHEN COPY - - - - - - - ]</span>

                      <div className="pro-software-credit">
                        {formData.softwareCredit || 'Software by Nexion Solution'}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
