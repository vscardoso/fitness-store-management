/**
 * Loading State Manager
 * Centralized manager for global loading state
 * Uses event emitter pattern for React component subscriptions
 */

type LoadingListener = (state: LoadingState) => void;

interface LoadingState {
  isLoading: boolean;
  message?: string;
  showTimeout: boolean;
}

/**
 * Loading Manager
 * Manages global loading state with request counting
 */
class LoadingManager {
  private listeners: Set<LoadingListener> = new Set();
  private requestCounter = 0;
  private currentMessage?: string;
  private minimumDisplayTimer: NodeJS.Timeout | null = null;
  private timeoutWarningTimer: NodeJS.Timeout | null = null;
  private autoHideTimer: NodeJS.Timeout | null = null;
  private showDelayTimer: NodeJS.Timeout | null = null;
  private isDisplaying = false;
  private showTimeoutWarning = false;

  /**
   * Delay before showing loading (200ms) - avoids flicker for fast requests
   */
  private readonly SHOW_DELAY = 200;

  /**
   * Minimum display time to avoid flicker (300ms)
   */
  private readonly MINIMUM_DISPLAY_TIME = 300;

  /**
   * Show timeout warning after 10 seconds
   */
  private readonly TIMEOUT_WARNING_DELAY = 10000;

  /**
   * Auto-hide after 30 seconds to prevent stuck states
   */
  private readonly AUTO_HIDE_DELAY = 30000;

  /**
   * Show loading with optional message (with delay for fast requests)
   */
  show(message?: string) {
    this.requestCounter++;

    // Only start timers on first request
    if (this.requestCounter === 1) {
      this.currentMessage = message;

      // Delay showing loading to avoid flicker on fast requests
      this.showDelayTimer = setTimeout(() => {
        this.showDelayTimer = null;

        // Only show if still loading (request didn't complete during delay)
        if (this.requestCounter > 0) {
          this.isDisplaying = true;
          this.showTimeoutWarning = false;
          this.notifyListeners();

          // Start minimum display timer
          this.minimumDisplayTimer = setTimeout(() => {
            this.minimumDisplayTimer = null;
          }, this.MINIMUM_DISPLAY_TIME);

          // Start timeout warning timer
          this.timeoutWarningTimer = setTimeout(() => {
            if (this.isDisplaying) {
              this.showTimeoutWarning = true;
              this.notifyListeners();
            }
          }, this.TIMEOUT_WARNING_DELAY);

          // Start auto-hide timer (safety mechanism)
          this.autoHideTimer = setTimeout(() => {
            if (this.isDisplaying) {
              console.warn(
                '⚠️ Loading overlay auto-hidden after 30s. Possible stuck request.'
              );
              this.forceHide();
            }
          }, this.AUTO_HIDE_DELAY);

          if (__DEV__) {
            console.log(
              `🔄 Loading shown (counter: ${this.requestCounter})${message ? `: ${message}` : ''}`
            );
          }
        } else if (__DEV__) {
          console.log(`⚡ Fast request - loading skipped (< ${this.SHOW_DELAY}ms)`);
        }
      }, this.SHOW_DELAY);

      if (__DEV__) {
        console.log(
          `🔄 Loading queued (counter: ${this.requestCounter})${message ? `: ${message}` : ''}`
        );
      }
    } else if (__DEV__) {
      console.log(
        `🔄 Loading increment (counter: ${this.requestCounter})${message ? `: ${message}` : ''}`
      );
    }
  }

  /**
   * Hide loading (with request counter)
   */
  hide() {
    if (this.requestCounter > 0) {
      this.requestCounter--;

      if (__DEV__) {
        console.log(`🔄 Loading decrement (counter: ${this.requestCounter})`);
      }

      // Only hide when all requests complete
      if (this.requestCounter === 0) {
        this.scheduleHide();
      }
    }
  }

  /**
   * Schedule hide with minimum display time
   */
  private scheduleHide() {
    if (this.minimumDisplayTimer) {
      // Wait for minimum display time before hiding
      setTimeout(() => {
        this.performHide();
      }, this.MINIMUM_DISPLAY_TIME);
    } else {
      this.performHide();
    }
  }

  /**
   * Perform the actual hide operation
   */
  private performHide() {
    this.isDisplaying = false;
    this.currentMessage = undefined;
    this.showTimeoutWarning = false;
    this.clearTimers();
    this.notifyListeners();

    if (__DEV__) {
      console.log('✅ Loading completed');
    }
  }

  /**
   * Force hide (used by auto-hide timer)
   */
  private forceHide() {
    this.requestCounter = 0;
    this.performHide();
  }

  /**
   * Clear all timers
   */
  private clearTimers() {
    if (this.showDelayTimer) {
      clearTimeout(this.showDelayTimer);
      this.showDelayTimer = null;
    }
    if (this.minimumDisplayTimer) {
      clearTimeout(this.minimumDisplayTimer);
      this.minimumDisplayTimer = null;
    }
    if (this.timeoutWarningTimer) {
      clearTimeout(this.timeoutWarningTimer);
      this.timeoutWarningTimer = null;
    }
    if (this.autoHideTimer) {
      clearTimeout(this.autoHideTimer);
      this.autoHideTimer = null;
    }
  }

  /**
   * Subscribe to loading state changes
   */
  subscribe(listener: LoadingListener): () => void {
    this.listeners.add(listener);

    // Immediately notify with current state
    listener({
      isLoading: this.isDisplaying,
      message: this.currentMessage,
      showTimeout: this.showTimeoutWarning,
    });

    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notify all listeners of state change
   */
  private notifyListeners() {
    const state: LoadingState = {
      isLoading: this.isDisplaying,
      message: this.currentMessage,
      showTimeout: this.showTimeoutWarning,
    };

    this.listeners.forEach((listener) => {
      try {
        listener(state);
      } catch (error) {
        console.error('Error in loading listener:', error);
      }
    });
  }

  /**
   * Get current loading state (for debugging)
   */
  getState(): LoadingState {
    return {
      isLoading: this.isDisplaying,
      message: this.currentMessage,
      showTimeout: this.showTimeoutWarning,
    };
  }

  /**
   * Get current request counter (for debugging)
   */
  getRequestCount(): number {
    return this.requestCounter;
  }

  /**
   * Reset state (for testing)
   */
  reset() {
    this.requestCounter = 0;
    this.forceHide();
  }
}

/**
 * Singleton instance
 */
export const loadingManager = new LoadingManager();
