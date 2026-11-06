import React from 'react'
import { useSoftwareUpdate } from '../utils/updateStore'
import { IconCheck, IconX, IconRefresh } from './Icons'

const IconExternalLink: React.FC<{ size?: number }> = ({ size = 14 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
)

interface SoftwareUpdateBannerProps {
  onNavigate?: (page: any) => void
}

export const SoftwareUpdateBanner: React.FC<SoftwareUpdateBannerProps> = ({ onNavigate }) => {
  const [updateState, { restartAndInstall, dismissBanner, resetUpdate }] = useSoftwareUpdate()

  const shouldShow =
    !updateState.isDismissed &&
    (updateState.status === 'available' ||
      updateState.status === 'downloading' ||
      updateState.status === 'downloaded')

  if (!shouldShow) return null

  const isDownloaded = updateState.status === 'downloaded'
  const isDownloading = updateState.status === 'downloading'
  const isAvailable = updateState.status === 'available'

  const targetVersion = updateState.latestVersion || 'New Version'

  return (
    <div
      className={`software-update-top-banner ${isDownloaded ? 'banner-downloaded' : isDownloading ? 'banner-downloading' : 'banner-available'}`}
      role="alert"
      aria-live="polite"
    >
      <div className="update-banner-inner">
        {/* Left: Icon & High-Visibility Status Badge */}
        <div className="update-banner-left">
          <div className="update-pulse-icon-container">
            {isDownloaded ? (
              <span className="update-emoji-icon">🎉</span>
            ) : isDownloading ? (
              <span className="update-spinner-icon">
                <IconRefresh size={20} className="spin-animation" />
              </span>
            ) : (
              <span className="update-emoji-icon">🚀</span>
            )}
            <span className="update-ping-circle" />
          </div>

          <div className="update-banner-text-group">
            <div className="update-banner-title-row">
              <span className="update-banner-tag">
                {isDownloaded ? 'UPDATE READY' : isDownloading ? 'DOWNLOADING' : 'SOFTWARE UPDATE AVAILABLE'}
              </span>
              <strong className="update-banner-title">
                {isDownloaded
                  ? `Software Update v${targetVersion} is Ready to Install!`
                  : isDownloading
                  ? `Downloading Software Update v${targetVersion}... (${updateState.percent ?? 0}%)`
                  : `New Software Update Available (v${targetVersion})`}
              </strong>
              {updateState.isSimulated && (
                <span className="update-simulated-pill" title="Test notification simulation">
                  SIMULATION PREVIEW
                </span>
              )}
            </div>

            <p className="update-banner-description">
              {isDownloaded ? (
                <>
                  The update package has been downloaded and verified successfully. Click <strong>Restart & Install Update Now</strong> to apply the update immediately.
                </>
              ) : isDownloading ? (
                <>
                  Update packages are downloading in the background. Please keep the application running. (
                  <strong>{updateState.percent ?? 0}%</strong> completed)
                </>
              ) : (
                <>
                  A new version of Catamaran POS has arrived! Update now to access the latest features, high-speed receipt printing, and terminal optimizations.
                </>
              )}
            </p>

            {/* Live Progress Bar for Download State */}
            {isDownloading && (
              <div className="update-download-progress-track">
                <div
                  className="update-download-progress-fill"
                  style={{ width: `${Math.min(100, Math.max(8, updateState.percent ?? 0))}%` }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Right: Primary Call to Action & Dismiss */}
        <div className="update-banner-actions">
          {isDownloaded ? (
            <button
              type="button"
              className="btn-update-cta btn-update-restart-now"
              onClick={restartAndInstall}
              title="Click to restart terminal and install update"
            >
              <IconCheck size={18} />
              <span>Restart & Install Update Now</span>
            </button>
          ) : isDownloading ? (
            <div className="update-downloading-indicator">
              <span className="download-percent-pill">{updateState.percent ?? 0}%</span>
              <span className="download-text">Downloading...</span>
            </div>
          ) : (
            <button
              type="button"
              className="btn-update-cta btn-update-install-now"
              onClick={restartAndInstall}
              title="Click to install and update software"
            >
              <span className="btn-icon">⚡</span>
              <span>Install Update Now</span>
            </button>
          )}

          {updateState.releaseUrl && !isDownloaded && !isDownloading && (
            <a
              href={updateState.releaseUrl}
              target="_blank"
              rel="noreferrer"
              className="btn-update-link"
              title="View Release Details on GitHub"
            >
              <span>Release Notes</span>
              <IconExternalLink size={14} />
            </a>
          )}

          {updateState.isSimulated ? (
            <button
              type="button"
              className="btn-update-dismiss-icon"
              onClick={resetUpdate}
              title="Close simulation test"
            >
              <IconX size={18} />
            </button>
          ) : (
            <button
              type="button"
              className="btn-update-dismiss-icon"
              onClick={dismissBanner}
              title="Dismiss notification (Click update badge in topbar to reopen)"
            >
              <IconX size={18} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
