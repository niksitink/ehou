// Environment detection and conditional logging system
class Logger {
    constructor() {
        this.isDev = this.detectEnvironment();
        this.debugMode = false;
        
        // Initialize debug mode from storage for dev environment
        if (this.isDev) {
            this.initDebugMode();
        }
    }

    // Detect environment based on manifest name
    detectEnvironment() {
        try {
            // Check if we're in a Chrome extension context
            if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest) {
                const manifest = chrome.runtime.getManifest();
                const isDev = manifest.name.includes('(DEV)') || manifest.name.includes('DEV');            
                return isDev;
            }
            
            // Fallback: check for development indicators
            const fallbackDev = window.location.hostname === 'localhost' || 
                   window.location.hostname === '127.0.0.1' ||
                   window.location.protocol === 'file:';
            return fallbackDev;
        } catch (error) {
            // Default to production if detection fails
            return false;
        }
    }

    // Initialize debug mode from storage (dev only)
    async initDebugMode() {
        if (!this.isDev) return;
        
        try {
            const result = await chrome.storage.local.get(['debugMode']);
            this.debugMode = result.debugMode || false;
        } catch (error) {
            this.debugMode = false;
        }
    }

    // Set debug mode (dev only)
    async setDebugMode(enabled) {
        if (!this.isDev) return false;
        
        this.debugMode = enabled;
        try {
            await chrome.storage.local.set({debugMode: this.debugMode});
        } catch (error) {
            console.warn('Failed to save debug mode to storage:', error);
        }
        return this.debugMode;
    }

    // Toggle debug mode (dev only)
    async toggleDebugMode() {
        if (!this.isDev) return false;
        
        return await this.setDebugMode(!this.debugMode);
    }

    // Conditional log function
    log(...args) {
        if (this.isDev) {
            console.log(...args);
        }
    }

    // Conditional log with emoji prefix
    logWithEmoji(emoji, ...args) {
        if (this.isDev) {
            console.log(emoji, ...args);
        }
    }

    // Debug log (only when debug mode is enabled)
    debugLog(...args) {
        if (this.isDev && this.debugMode) {
            console.log(...args);
        }
    }

    // Debug log with emoji prefix
    debugLogWithEmoji(emoji, ...args) {
        if (this.isDev && this.debugMode) {
            console.log(emoji, ...args);
        }
    }

    // Error log (always shown)
    error(...args) {
        console.error(...args);
    }

    // Warning log (always shown)
    warn(...args) {
        console.warn(...args);
    }

    // Info log (dev only)
    info(...args) {
        if (this.isDev) {
            console.info(...args);
        }
    }

    // Get current environment
    getEnvironment() {
        return this.isDev ? 'development' : 'production';
    }

    // Get debug mode status
    getDebugMode() {
        return this.debugMode;
    }

    // Check if logging is enabled
    isLoggingEnabled() {
        return this.isDev;
    }

    // Check if debug logging is enabled
    isDebugLoggingEnabled() {
        return this.isDev && this.debugMode;
    }
}

// Create global logger instance
const logger = new Logger();

// Expose logger functions globally for easy access
if (typeof window !== 'undefined') {
    window.logger = logger;
    window.toggleDebugMode = () => logger.toggleDebugMode();
    window.setDebugMode = (enabled) => logger.setDebugMode(enabled);
    window.getDebugMode = () => logger.getDebugMode();
    window.getEnvironment = () => logger.getEnvironment();
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = logger;
}

// For Chrome extension context
if (typeof self !== 'undefined') {
    self.logger = logger;
}
