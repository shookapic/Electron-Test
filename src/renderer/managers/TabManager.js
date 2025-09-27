/**
 * Tab Manager - Handles tab operations, creation, switching, closing
 */
class TabManager {
  constructor(editorManager, notificationManager) {
    this.editorManager = editorManager;
    this.notificationManager = notificationManager;
    this.tabIdCounter = 0;
    this.activeTabId = null;
    this.openTabs = new Map(); // Store tab data: id -> {filePath, content, modified, fileName, fileInfo}
    this.tabsContainer = document.getElementById('tabs-container');
    this.welcomeScreen = document.getElementById('welcome-screen');
    this.editorArea = document.getElementById('editor-area');
  }

  /**
   * Create a new tab
   * @param {string} fileName - Tab file name
   * @param {string} filePath - File path (optional)
   * @param {string} content - File content
   * @param {Object} fileInfo - File metadata
   * @returns {string} - Tab ID
   */
  createTab(fileName, filePath = null, content = '', fileInfo = {}) {
    // Show editor area if this is the first tab
    if (this.openTabs.size === 0) {
      this.showEditor();
    }
    
    const tabId = 'tab_' + (++this.tabIdCounter);
    
    // Create tab data
    this.openTabs.set(tabId, {
      filePath: filePath,
      content: content,
      modified: false,
      fileName: fileName,
      fileInfo: fileInfo // Store file metadata
    });

    // Create tab element
    const tabElement = document.createElement('div');
    tabElement.className = 'tab';
    tabElement.setAttribute('data-tab-id', tabId);
    tabElement.setAttribute('data-file-path', filePath || '');
    
    // Add warning indicator if file has encoding issues or is partial
    const warningIndicator = (fileInfo.encodingWarning || fileInfo.isPartial) ? 
      `<span class="tab-warning" title="${fileInfo.encodingWarning ? 'Encoding Warning' : ''}${fileInfo.isPartial ? 'File Partially Loaded' : ''}">⚠️</span>` : '';
    
    tabElement.innerHTML = `
      <div class="tab-label">${fileName}${warningIndicator}</div>
      <div class="tab-close" onclick="window.tabManager.closeTab(event, '${tabId}')">×</div>
    `;
    
    tabElement.addEventListener('click', (e) => {
      if (!e.target.classList.contains('tab-close')) {
        this.switchToTab(tabId);
      }
    });
    
    this.tabsContainer.appendChild(tabElement);
    return tabId;
  }

  /**
   * Switch to a specific tab
   * @param {string} tabId - Tab ID to switch to
   */
  switchToTab(tabId) {
    // Save current tab content if we have an active tab
    if (this.activeTabId && this.openTabs.has(this.activeTabId)) {
      const currentTab = this.openTabs.get(this.activeTabId);
      currentTab.content = this.editorManager.getContent();
    }

    // Update active tab
    this.activeTabId = tabId;
    const newTab = this.openTabs.get(tabId);
    
    if (newTab) {
      // Update editor
      this.editorManager.setContent(newTab.content);
      
      // Update tab appearance
      document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
      });
      const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`);
      if (tabElement) {
        tabElement.classList.add('active');
      }
      
      // Update file tree selection
      if (newTab.filePath) {
        document.querySelectorAll('.file-tree-item').forEach(el => el.classList.remove('selected'));
        const fileTreeItem = document.querySelector(`[data-file-path="${newTab.filePath}"]`);
        if (fileTreeItem) {
          fileTreeItem.classList.add('selected');
        }
      }

      // Emit tab switch event for other components
      this.onTabSwitch(newTab);
    }
  }

  /**
   * Close a tab
   * @param {Event} event - Click event
   * @param {string} tabId - Tab ID to close
   */
  closeTab(event, tabId) {
    event.stopPropagation();
    
    const tab = this.openTabs.get(tabId);
    if (!tab) return;
    
    // Check if modified
    if (tab.modified) {
      const result = confirm(`${tab.fileName} has unsaved changes. Do you want to close it anyway?`);
      if (!result) return;
    }
    
    // Remove tab element
    const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`);
    if (tabElement) {
      tabElement.remove();
    }
    
    // Remove from data
    this.openTabs.delete(tabId);
    
    // If closing active tab, switch to another tab or show welcome screen
    if (this.activeTabId === tabId) {
      const remainingTabs = Array.from(this.openTabs.keys());
      if (remainingTabs.length > 0) {
        this.switchToTab(remainingTabs[remainingTabs.length - 1]);
      } else {
        // No more tabs, show welcome screen
        this.activeTabId = null;
        this.showWelcomeScreen();
      }
    }
  }

  /**
   * Mark tab as modified
   * @param {string} tabId - Tab ID
   */
  markTabModified(tabId) {
    const tab = this.openTabs.get(tabId);
    if (tab && !tab.modified) {
      tab.modified = true;
      const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`);
      if (tabElement) {
        tabElement.classList.add('modified');
      }
    }
  }

  /**
   * Mark tab as clean (not modified)
   * @param {string} tabId - Tab ID
   */
  markTabClean(tabId) {
    const tab = this.openTabs.get(tabId);
    if (tab && tab.modified) {
      tab.modified = false;
      const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`);
      if (tabElement) {
        tabElement.classList.remove('modified');
      }
    }
  }

  /**
   * Check if file is already open in a tab
   * @param {string} filePath - File path to check
   * @returns {string|null} - Tab ID if found, null otherwise
   */
  findTabByPath(filePath) {
    for (const [tabId, tab] of this.openTabs) {
      if (tab.filePath === filePath) {
        return tabId;
      }
    }
    return null;
  }

  /**
   * Get current active tab
   * @returns {Object|null} - Active tab data or null
   */
  getActiveTab() {
    return this.activeTabId ? this.openTabs.get(this.activeTabId) : null;
  }

  /**
   * Update tab file info (for file operations)
   * @param {string} tabId - Tab ID
   * @param {string} filePath - New file path
   * @param {string} fileName - New file name
   */
  updateTabFile(tabId, filePath, fileName) {
    const tab = this.openTabs.get(tabId);
    if (tab) {
      tab.filePath = filePath;
      tab.fileName = fileName;
      
      // Update tab label
      const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`);
      if (tabElement) {
        const labelElement = tabElement.querySelector('.tab-label');
        if (labelElement) {
          labelElement.textContent = fileName;
        }
        tabElement.setAttribute('data-file-path', filePath);
      }
    }
  }

  /**
   * Show welcome screen
   */
  showWelcomeScreen() {
    this.welcomeScreen.style.display = 'flex';
    this.editorArea.style.display = 'none';
    this.tabsContainer.style.display = 'none';
  }

  /**
   * Show editor
   */
  showEditor() {
    this.welcomeScreen.style.display = 'none';
    this.editorArea.style.display = 'flex';
    this.tabsContainer.style.display = 'flex';
  }

  /**
   * Handle tab content changes (for modification tracking)
   * @param {string} tabId - Tab ID
   * @param {string} newContent - New content
   */
  handleContentChange(tabId, newContent) {
    const tab = this.openTabs.get(tabId);
    if (tab && tab.content !== newContent) {
      tab.content = newContent;
      this.markTabModified(tabId);
    }
  }

  /**
   * Callback for when tab switches (for other components to listen to)
   * @param {Object} tabData - Tab data
   */
  onTabSwitch(tabData) {
    // Update file type in status bar if file type utils are available
    if (window.updateFileTypeStatus) {
      window.updateFileTypeStatus(tabData.fileName);
    }
    
    // Update file status
    this.updateFileStatus(tabData);
  }

  /**
   * Update file status indicator
   * @param {Object} tabData - Tab data
   */
  updateFileStatus(tabData) {
    const fileStatusElement = document.getElementById('fileStatus');
    if (fileStatusElement && tabData.fileInfo) {
      const { fileInfo } = tabData;
      let statusText = 'UTF-8';
      let statusStyle = '';
      
      if (fileInfo.encodingWarning) {
        statusText = '⚠️ Non-UTF8';
        statusStyle = 'color: #f85149; cursor: pointer;';
        fileStatusElement.title = 'File may contain non-UTF8 characters';
      } else if (fileInfo.isPartial) {
        const loadedKB = Math.round(fileInfo.loadedSize / 1024);
        const totalKB = Math.round(fileInfo.totalSize / 1024);
        statusText = `📄 Partial (${loadedKB}KB/${totalKB}KB)`;
        statusStyle = 'color: #f0883e; cursor: pointer;';
        fileStatusElement.title = 'Click to load full file';
        fileStatusElement.onclick = () => this.onLoadFullFile(tabData.filePath);
      } else {
        statusText = 'UTF-8';
        statusStyle = '';
        fileStatusElement.onclick = null;
        fileStatusElement.title = '';
      }
      
      fileStatusElement.textContent = statusText;
      fileStatusElement.style.cssText = statusStyle;
    }
  }

  /**
   * Callback for loading full file (to be implemented by parent)
   * @param {string} filePath - File path to load
   */
  onLoadFullFile(filePath) {
    // This will be set by the main UI controller
    console.log('Load full file requested for:', filePath);
  }

  /**
   * Create a new untitled file tab
   * @returns {string} - New tab ID
   */
  createNewFile() {
    const fileName = 'untitled-' + (this.tabIdCounter + 1);
    const tabId = this.createTab(fileName);
    this.switchToTab(tabId);
    this.editorManager.focus();
    return tabId;
  }

  /**
   * Switch to next tab
   */
  switchToNextTab() {
    const tabIds = Array.from(this.openTabs.keys());
    if (tabIds.length > 0 && this.activeTabId) {
      const currentIndex = tabIds.indexOf(this.activeTabId);
      const nextIndex = (currentIndex + 1) % tabIds.length;
      this.switchToTab(tabIds[nextIndex]);
    }
  }

  /**
   * Get all open tabs count
   * @returns {number} - Number of open tabs
   */
  getTabCount() {
    return this.openTabs.size;
  }
}

module.exports = TabManager;