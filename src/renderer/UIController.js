// Import manager classes
const NotificationManager = require('./managers/NotificationManager');
const EditorManager = require('./managers/EditorManager');
const TabManager = require('./managers/TabManager');
const SearchManager = require('./managers/SearchManager');
const FileOperationsManager = require('./managers/FileOperationsManager');

// Import utilities
const fileTypeUtils = require('./utils/fileTypeUtils');

/**
 * Main UI Controller - Coordinates all managers and components
 */
class UIController {
  constructor() {
    // Initialize managers
    this.notificationManager = new NotificationManager();
    this.editorManager = new EditorManager();
    this.tabManager = new TabManager(this.editorManager, this.notificationManager);
    this.searchManager = new SearchManager(this.editorManager, this.notificationManager);
    this.fileOpsManager = new FileOperationsManager(this.tabManager, this.notificationManager);

    // State
    this.isResizing = false;
    this.resizeType = null;
    this.activeMenu = null;

    this.init();
  }

  init() {
    this.setupEventListeners();
    this.setupKeyboardShortcuts();
    this.setupResizing();
    this.setupMenus();
    this.setupUIComponents();

    // Connect managers
    this.connectManagers();

    // Initialize with explorer view and welcome screen
    this.showExplorer();
    this.tabManager.showWelcomeScreen();
  }

  /**
   * Connect managers and set up inter-manager communication
   */
  connectManagers() {
    // Set up tab manager callbacks
    this.tabManager.onLoadFullFile = (filePath) => {
      this.fileOpsManager.loadFullFile(filePath);
    };

    // Set up search manager callbacks
    this.searchManager.openSearchResult = async (filePath, lineNumber) => {
      await this.openSearchResult(filePath, lineNumber);
    };

    // Update search manager with workspace path when workspace changes
    this.searchManager.setWorkspacePath(this.fileOpsManager.getCurrentWorkspacePath());

    // Set up editor content change tracking
    this.editorManager.editor.addEventListener('input', () => {
      if (this.tabManager.activeTabId) {
        const newContent = this.editorManager.getContent();
        this.tabManager.handleContentChange(this.tabManager.activeTabId, newContent);
      }
    });
  }

  /**
   * Setup event listeners for UI components
   */
  setupEventListeners() {
    // Close dialogs when clicking outside
    document.addEventListener('click', (e) => {
      const searchWidget = document.getElementById('search-widget');
      const gotoDialog = document.getElementById('goto-dialog');
      
      if (searchWidget.classList.contains('visible') && 
          !searchWidget.contains(e.target)) {
        this.searchManager.closeSearchWidget();
      }
      
      if (gotoDialog.classList.contains('visible') && 
          !gotoDialog.contains(e.target)) {
        this.searchManager.closeGoToLineDialog();
      }
    });

    // Close menus when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.menu-item')) {
        this.hideAllMenus();
      }
    });
  }

  /**
   * Setup keyboard shortcuts
   */
  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      const searchWidget = document.getElementById('search-widget');
      const gotoDialog = document.getElementById('goto-dialog');
      const isSearchVisible = searchWidget.classList.contains('visible');
      const isGotoVisible = gotoDialog.classList.contains('visible');

      // Handle Enter key
      if (e.key === 'Enter') {
        if (isSearchVisible) {
          e.preventDefault();
          this.searchManager.searchNext();
        } else if (isGotoVisible) {
          e.preventDefault();
          this.searchManager.performGoToLine();
        }
      }
      
      // Handle Escape key
      if (e.key === 'Escape') {
        if (isSearchVisible) {
          e.preventDefault();
          this.searchManager.closeSearchWidget();
        } else if (isGotoVisible) {
          e.preventDefault();
          this.searchManager.closeGoToLineDialog();
        }
      }

      // Handle F3/Shift+F3 for search navigation
      if (e.key === 'F3' && isSearchVisible) {
        e.preventDefault();
        if (e.shiftKey) {
          this.searchManager.searchPrev();
        } else {
          this.searchManager.searchNext();
        }
      }

      // File operations
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        this.fileOpsManager.saveFile();
      }
      
      if (e.ctrlKey && e.key === 'o') {
        e.preventDefault();
        this.fileOpsManager.openFile();
      }
      
      if (e.ctrlKey && e.shiftKey && e.key === 'O') {
        e.preventDefault();
        this.fileOpsManager.openWorkspace();
      }
      
      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault();
        this.tabManager.createNewFile();
      }
      
      if (e.ctrlKey && e.shiftKey && e.key === 'S') {
        e.preventDefault();
        this.fileOpsManager.saveAsFile();
      }
      
      // UI navigation
      if (e.ctrlKey && e.key === 'b') {
        e.preventDefault();
        this.toggleSidebar();
      }
      
      if (e.altKey && e.key === 'z') {
        e.preventDefault();
        this.editorManager.toggleWordWrap();
      }
      
      if (e.shiftKey && e.altKey && e.key === 'F') {
        e.preventDefault();
        const formatted = this.editorManager.formatCode();
        if (this.tabManager.activeTabId) {
          this.tabManager.handleContentChange(this.tabManager.activeTabId, formatted);
        }
      }
      
      if (e.ctrlKey && e.key === 'w') {
        e.preventDefault();
        if (this.tabManager.activeTabId) {
          this.tabManager.closeTab(e, this.tabManager.activeTabId);
        }
      }
      
      if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        this.searchManager.showFindDialog();
      }
      
      if (e.ctrlKey && e.key === 'g') {
        e.preventDefault();
        this.searchManager.showGoToLineDialog();
      }
      
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault();
        this.tabManager.switchToNextTab();
      }
      
      if (e.ctrlKey && e.key === '`') {
        e.preventDefault();
        this.toggleToolsPanel();
      }
      
      if (e.ctrlKey && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        this.showSearch();
      }
      
      if (e.ctrlKey && e.shiftKey && e.key === 'E') {
        e.preventDefault();
        this.showExplorer();
      }
    });
  }

  /**
   * Setup resizing functionality
   */
  setupResizing() {
    const sidebar = document.getElementById('sidebar');
    const toolsPanel = document.getElementById('toolsPanel');

    const startResize = (e, type) => {
      this.isResizing = true;
      this.resizeType = type;
      
      if (type === 'sidebar') {
        sidebar.style.transition = 'none';
      } else if (type === 'toolsPanel') {
        toolsPanel.style.transition = 'none';
      }
      
      document.addEventListener('mousemove', this.doResize.bind(this));
      document.addEventListener('mouseup', this.stopResize.bind(this));
      e.preventDefault();
      
      document.body.style.userSelect = 'none';
    };

    window.initSidebarResize = (e) => startResize(e, 'sidebar');
    window.initToolsPanelResize = (e) => startResize(e, 'toolsPanel');
  }

  doResize(e) {
    if (!this.isResizing) return;
    
    const sidebar = document.getElementById('sidebar');
    const toolsPanel = document.getElementById('toolsPanel');
    
    requestAnimationFrame(() => {
      if (this.resizeType === 'sidebar') {
        const containerRect = sidebar.parentElement.getBoundingClientRect();
        const newWidth = e.clientX - containerRect.left;
        const minWidth = 180;
        const maxWidth = window.innerWidth * 0.5;
        
        if (newWidth >= minWidth && newWidth <= maxWidth) {
          sidebar.style.width = newWidth + 'px';
        }
      } else if (this.resizeType === 'toolsPanel') {
        const containerRect = toolsPanel.parentElement.getBoundingClientRect();
        const newWidth = containerRect.right - e.clientX;
        const minWidth = 200;
        const maxWidth = window.innerWidth * 0.6;
        
        if (newWidth >= minWidth && newWidth <= maxWidth) {
          toolsPanel.style.width = newWidth + 'px';
        }
      }
    });
  }

  stopResize() {
    this.isResizing = false;
    
    const sidebar = document.getElementById('sidebar');
    const toolsPanel = document.getElementById('toolsPanel');
    
    if (this.resizeType === 'sidebar') {
      sidebar.style.transition = '';
    } else if (this.resizeType === 'toolsPanel') {
      toolsPanel.style.transition = '';
    }
    
    document.body.style.userSelect = '';
    
    document.removeEventListener('mousemove', this.doResize.bind(this));
    document.removeEventListener('mouseup', this.stopResize.bind(this));
    
    this.resizeType = null;
  }

  /**
   * Setup menu functionality
   */
  setupMenus() {
    window.toggleMenu = (menuId) => {
      const menu = document.getElementById(menuId);
      const dropdown = menu.querySelector('.dropdown-menu');
      
      if (this.activeMenu && this.activeMenu !== menuId) {
        this.hideAllMenus();
      }
      
      if (dropdown.classList.contains('show')) {
        this.hideAllMenus();
      } else {
        dropdown.classList.add('show');
        menu.classList.add('active');
        this.activeMenu = menuId;
      }
    };

    window.hideAllMenus = () => this.hideAllMenus();
  }

  hideAllMenus() {
    document.querySelectorAll('.dropdown-menu').forEach(menu => {
      menu.classList.remove('show');
    });
    document.querySelectorAll('.menu-item').forEach(item => {
      item.classList.remove('active');
    });
    this.activeMenu = null;
  }

  /**
   * Setup UI component functions
   */
  setupUIComponents() {
    // Activity bar functions
    window.showExplorer = () => this.showExplorer();
    window.showSearch = () => this.showSearch();

    // File operations
    window.createNewFile = () => this.tabManager.createNewFile();
    window.openFile = () => this.fileOpsManager.openFile();
    window.openWorkspace = () => this.openWorkspace();
    window.saveFile = () => this.fileOpsManager.saveFile();
    window.saveAsFile = () => this.fileOpsManager.saveAsFile();
    window.closeCurrentTab = () => {
      if (this.tabManager.activeTabId) {
        this.tabManager.closeTab(new Event('click'), this.tabManager.activeTabId);
      }
    };

    // Editor operations
    window.formatCode = () => {
      const formatted = this.editorManager.formatCode();
      if (this.tabManager.activeTabId) {
        this.tabManager.handleContentChange(this.tabManager.activeTabId, formatted);
      }
    };
    window.toggleWordWrap = () => this.editorManager.toggleWordWrap();

    // Search operations
    window.showFindDialog = () => this.searchManager.showFindDialog();
    window.closeSearchWidget = () => this.searchManager.closeSearchWidget();
    window.searchNext = () => this.searchManager.searchNext();
    window.searchPrev = () => this.searchManager.searchPrev();
    window.showGoToLineDialog = () => this.searchManager.showGoToLineDialog();
    window.closeGoToLineDialog = () => this.searchManager.closeGoToLineDialog();
    window.performGoToLine = () => this.searchManager.performGoToLine();

    // UI navigation
    window.toggleSidebar = () => this.toggleSidebar();
    window.toggleToolsPanel = () => this.toggleToolsPanel();
    window.showToolsPanel = () => this.showToolsPanel();
    window.hideToolsPanel = () => this.hideToolsPanel();

    // CTrace helpers
    const stripAnsi = (input) => {
      if (!input || typeof input !== 'string') return input;
      const ansiRegex = /\x1b\[[0-9;]*m/g;
      return input.replace(ansiRegex, '');
    };

    window.runCTrace = async () => {
      const outEl = document.getElementById('ctrace-output');
      this.showToolsPanel();
      if (!outEl) {
        this.notificationManager.showError('CTrace output panel not found');
        return;
      }

      const active = this.tabManager.getActiveTab();
      const currentFilePath = active && active.filePath ? active.filePath : null;
      if (!currentFilePath) {
        outEl.textContent = 'No active file to analyze. Open a file first.';
        this.notificationManager.showWarning('Open a file to analyze with CTrace');
        return;
      }

      outEl.textContent = `Running ctrace on: ${currentFilePath}`;
      try {
        let args = [];
        args.push(`--input=${currentFilePath}`);
        args.push("--static");
        args.push("--sarif-format");
        const result = await window.ipcRenderer.invoke('run-ctrace', args);
        if (result && result.success) {
          outEl.textContent = stripAnsi(result.output || '(no output)');
          this.notificationManager.showSuccess('CTrace completed successfully');
        } else {
          const details = (result && (result.stderr || result.output || result.error)) || 'Unknown error';
          outEl.textContent = `Error running ctrace:\n${stripAnsi(details)}`;
          this.notificationManager.showError('Failed to run CTrace');
        }
        // Auto-scroll to bottom
        outEl.scrollTop = outEl.scrollHeight;
      } catch (err) {
        outEl.textContent = `Exception: ${err.message}`;
        this.notificationManager.showError('Error invoking CTrace');
      }
    };

    window.clearCTraceOutput = () => {
      const outEl = document.getElementById('ctrace-output');
      if (outEl) outEl.textContent = '';
    };

    window.copyCTraceOutput = () => {
      const outEl = document.getElementById('ctrace-output');
      if (!outEl) return;
      const text = outEl.textContent || '';
      try {
        // Prefer Electron clipboard if available via require
        const { clipboard } = require('electron');
        clipboard.writeText(text);
        this.notificationManager.showSuccess('Output copied to clipboard');
      } catch (_) {
        if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text)
            .then(() => this.notificationManager.showSuccess('Output copied to clipboard'))
            .catch(() => this.notificationManager.showError('Failed to copy output'));
        } else {
          this.notificationManager.showError('Clipboard not available');
        }
      }
    };

    // Tab manager reference for global access
    window.tabManager = this.tabManager;
    window.searchManager = this.searchManager;
  }

  /**
   * Activity bar management
   */
  setActiveActivity(activityId) {
    document.querySelectorAll('.activity-item').forEach(item => {
      item.classList.remove('active');
    });
    const element = document.getElementById(activityId);
    if (element) {
      element.classList.add('active');
    }
  }

  showExplorer() {
    this.setActiveActivity('explorer-activity');
    const sidebarTitle = document.getElementById('sidebar-title');
    const explorerView = document.getElementById('explorer-view');
    const searchView = document.getElementById('search-view');
    const sidebar = document.getElementById('sidebar');
    
    if (sidebarTitle) sidebarTitle.textContent = 'Explorer';
    if (explorerView) explorerView.style.display = 'block';
    if (searchView) searchView.style.display = 'none';
    if (sidebar && sidebar.style.display === 'none') {
      sidebar.style.display = 'flex';
    }
  }

  showSearch() {
    this.setActiveActivity('search-activity');
    const sidebarTitle = document.getElementById('sidebar-title');
    const explorerView = document.getElementById('explorer-view');
    const searchView = document.getElementById('search-view');
    const sidebar = document.getElementById('sidebar');
    const searchInput = document.getElementById('sidebar-search-input');
    
    if (sidebarTitle) sidebarTitle.textContent = 'Search';
    if (explorerView) explorerView.style.display = 'none';
    if (searchView) searchView.style.display = 'block';
    if (sidebar && sidebar.style.display === 'none') {
      sidebar.style.display = 'flex';
    }
    setTimeout(() => searchInput && searchInput.focus(), 100);
  }

  /**
   * Sidebar toggle
   */
  toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    if (sidebar.style.width === '0px' || sidebar.style.display === 'none') {
      sidebar.style.width = '280px';
      sidebar.style.display = 'flex';
    } else {
      sidebar.style.width = '0px';
      setTimeout(() => {
        sidebar.style.display = 'none';
      }, 200);
    }
  }

  /**
   * Tools panel management
   */
  showToolsPanel() {
    const toolsPanel = document.getElementById('toolsPanel');
    if (toolsPanel) {
      toolsPanel.style.display = 'flex';
      toolsPanel.offsetHeight; // Force reflow
      toolsPanel.classList.add('active');
    }
  }

  hideToolsPanel() {
    const toolsPanel = document.getElementById('toolsPanel');
    if (toolsPanel) {
      toolsPanel.classList.remove('active');
      setTimeout(() => {
        if (!toolsPanel.classList.contains('active')) {
          toolsPanel.style.display = 'none';
        }
      }, 300);
    }
  }

  toggleToolsPanel() {
    const toolsPanel = document.getElementById('toolsPanel');
    if (toolsPanel) {
      if (toolsPanel.classList.contains('active')) {
        this.hideToolsPanel();
      } else {
        this.showToolsPanel();
      }
    }
  }

  /**
   * Open workspace and update search manager
   */
  async openWorkspace() {
    const result = await this.fileOpsManager.openWorkspace();
    if (result && result.success) {
      this.searchManager.setWorkspacePath(result.folderPath);
    }
  }

  /**
   * Open search result with proper line navigation
   * @param {string} filePath - File path
   * @param {number} lineNumber - Line number
   */
  async openSearchResult(filePath, lineNumber) {
    console.log('Opening search result:', filePath, 'at line', lineNumber);
    
    try {
      const normalizedPath = filePath.replace(/\\\\/g, '\\');
      
      const result = await window.ipcRenderer.invoke('read-file', normalizedPath);
      console.log('Search result read result:', result);
      
      if (result.success) {
        let tabId;
        
        if (result.warning === 'encoding') {
          console.log('Search result: Encoding warning detected, showing dialog...');
          const userChoice = await this.notificationManager.showEncodingWarningDialog();
          console.log('Search result: User choice:', userChoice);
          
          if (userChoice === 'no') {
            console.log('Search result: User chose not to open file');
            return;
          } else if (userChoice === 'yes') {
            console.log('Search result: User chose to open file anyway');
            const forceResult = await window.ipcRenderer.invoke('force-open-file', normalizedPath);
            console.log('Search result: Force open result:', forceResult);
            
            if (forceResult.success) {
              tabId = this.fileOpsManager.openFileInTab(normalizedPath, forceResult.content, forceResult.fileName, {
                isPartial: forceResult.isPartial,
                totalSize: forceResult.totalSize,
                loadedSize: forceResult.loadedSize,
                encodingWarning: forceResult.encodingWarning
              });
              
              this.notificationManager.showWarning(`Opened ${forceResult.fileName} at line ${lineNumber} with encoding warnings`);
            } else {
              this.notificationManager.showError('Failed to open file: ' + forceResult.error);
              return;
            }
          }
        } else {
          console.log('Search result: No warnings, opening file normally');
          tabId = this.fileOpsManager.openFileInTab(normalizedPath, result.content, result.fileName, {
            isPartial: result.isPartial,
            totalSize: result.totalSize,
            loadedSize: result.loadedSize,
            encodingWarning: result.encodingWarning
          });
          
          this.notificationManager.showSuccess(`Opened ${result.fileName} at line ${lineNumber}`);
        }
        
        // Switch to explorer view and wait for editor to be ready
        this.showExplorer();
        
        // Wait for the tab to switch and editor to update, then jump to line
        setTimeout(() => {
          this.editorManager.jumpToLine(lineNumber);
        }, 200);
        
      } else {
        this.notificationManager.showError('Error opening file: ' + (result.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error opening search result:', error);
      this.notificationManager.showError('Error opening search result: ' + error.message);
    }
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.uiController = new UIController();
});

module.exports = UIController;