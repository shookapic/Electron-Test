// ctrace-gui Professional UI Logic
// Enhanced with multiple tabs, resizable panels, and improved search functionality

const { ipcRenderer } = require('electron');

document.addEventListener('DOMContentLoaded', function () {
  // File type detection based on file name (copied from index.html for DRY)
  function detectFileType(filename) {
    if (!filename) return "Plain Text";
    const lower = filename.toLowerCase();
    if (lower === "cmakelists.txt" || lower.endsWith(".cmake")) return "CMake";
    if (lower.endsWith(".c")) return "C";
    if (lower.endsWith(".cpp") || lower.endsWith(".cc") || lower.endsWith(".cxx")) return "C++";
    if (lower.endsWith(".h") || lower.endsWith(".hpp") || lower.endsWith(".hh") || lower.endsWith(".hxx")) return "C/C++ Header";
    if (lower.endsWith(".js")) return "JavaScript";
    if (lower.endsWith(".ts")) return "TypeScript";
    if (lower.endsWith(".py")) return "Python";
    if (lower.endsWith(".json")) return "JSON";
    if (lower.endsWith(".md")) return "Markdown";
    if (lower.endsWith(".txt")) return "Plain Text";
    return "Plain Text";
  }

  function updateFileTypeStatus(filename) {
    const type = detectFileType(filename);
    const el = document.getElementById("fileType");
    if (el) el.textContent = type;
  }
  const editor = document.getElementById('editor');
  const gutter = document.getElementById('gutter');
  const lineCounter = document.getElementById('lineCounter');
  const toolsPanel = document.getElementById('toolsPanel');
  const sidebar = document.getElementById('sidebar');
  const sidebarTitle = document.getElementById('sidebar-title');
  const explorerView = document.getElementById('explorer-view');
  const searchView = document.getElementById('search-view');
  const searchInput = document.getElementById('sidebar-search-input');
  const searchResults = document.getElementById('search-results');
  const fileTree = document.getElementById('file-tree');
  const workspaceFolder = document.getElementById('workspace-folder');
  const noWorkspace = document.getElementById('no-workspace');
  const workspaceName = document.getElementById('workspace-name');
  const tabsContainer = document.getElementById('tabs-container');
  const welcomeScreen = document.getElementById('welcome-screen');
  const editorArea = document.getElementById('editor-area');

  // State management
  // Make TAB key insert tab character in editor
  if (editor) {
    editor.addEventListener('keydown', function(e) {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        // Insert tab character at cursor
        editor.setRangeText('\t', start, end, 'end');
        // Update gutter and status bar
        updateGutter();
        updateStatusBar();
      }
    });
  }
  let isResizing = false;
  let resizeType = null;
  let currentWorkspacePath = null;
  let searchTimeout = null;
  let tabIdCounter = 0;
  let activeTabId = null;
  let openTabs = new Map(); // Store tab data: id -> {filePath, content, modified, fileName}

  // Don't initialize default tab - start with welcome screen

  // Enhanced gutter line numbers with proper formatting (like VS Code)
  function updateGutter() {
    if (!editor || !gutter) return;
    
    const lines = editor.value.split('\n').length;
    const maxDigits = Math.max(2, lines.toString().length);
    let gutterContent = '';
    
    // Create line numbers vertically (one per line)
    for (let i = 1; i <= lines; i++) {
      gutterContent += i.toString().padStart(maxDigits, ' ') + '\n';
    }
    
    // Remove the last newline and set content
    gutter.textContent = gutterContent.slice(0, -1);
    
    // Update gutter width based on content
    const charWidth = 8; // Approximate character width in monospace font
    gutter.style.width = Math.max(60, (maxDigits + 2) * charWidth) + 'px';
  }

  // Enhanced status bar with cursor position tracking
  function updateStatusBar() {
    if (!editor) return;
    
    const value = editor.value;
    const selectionStart = editor.selectionStart;
    const selectionEnd = editor.selectionEnd;
    
    // Calculate line and column correctly
    const beforeCursor = value.substring(0, selectionStart);
    const lines = beforeCursor.split('\n');
    const line = lines.length;
    const col = lines[lines.length - 1].length + 1;
    
    if (selectionStart !== selectionEnd) {
      const selectedLength = Math.abs(selectionEnd - selectionStart);
      const selectedText = value.substring(Math.min(selectionStart, selectionEnd), Math.max(selectionStart, selectionEnd));
      const selectedLines = selectedText.split('\n').length - 1;
      lineCounter.textContent = `Ln ${line}, Col ${col} (${selectedLength} chars, ${selectedLines + 1} lines selected)`;
    } else {
      lineCounter.textContent = `Ln ${line}, Col ${col}`;
    }
    
    // Update file status indicator
    const fileStatusElement = document.getElementById('fileStatus');
    const fileTypeElement = document.getElementById('fileType');
    if (fileStatusElement && activeTabId) {
      const currentTab = openTabs.get(activeTabId);
      if (currentTab && currentTab.fileInfo) {
        const { fileInfo, fileName } = currentTab;
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
          fileStatusElement.onclick = () => loadFullFile(currentTab.filePath);
        } else {
          statusText = 'UTF-8';
          statusStyle = '';
          fileStatusElement.onclick = null;
          fileStatusElement.title = '';
        }
        fileStatusElement.textContent = statusText;
        fileStatusElement.style.cssText = statusStyle;
        // Update file type in status bar
        if (fileTypeElement) updateFileTypeStatus(fileName);
      } else {
        fileStatusElement.textContent = 'UTF-8';
        fileStatusElement.style.cssText = '';
        fileStatusElement.onclick = null;
        fileStatusElement.title = '';
        if (fileTypeElement) updateFileTypeStatus("");
      }
    } else if (fileTypeElement) {
      updateFileTypeStatus("");
    }
  }

  // Load full file function
  async function loadFullFile(filePath) {
    if (!filePath || !activeTabId) return;
    
    try {
      showNotification('Loading full file...', 'info');
      const result = await ipcRenderer.invoke('force-load-full-file', filePath);
      
      if (result.success) {
        const currentTab = openTabs.get(activeTabId);
        if (currentTab) {
          // Update tab content and file info
          currentTab.content = result.content;
          currentTab.fileInfo = {
            ...currentTab.fileInfo,
            isPartial: false,
            loadedSize: result.totalSize,
            totalSize: result.totalSize
          };
          
          // Update editor content
          editor.value = result.content;
          updateGutter();
          updateStatusBar();
          
          // Update tab appearance to remove warning
          const tabElement = document.querySelector(`[data-tab-id="${activeTabId}"]`);
          if (tabElement) {
            const tabLabel = tabElement.querySelector('.tab-label');
            if (tabLabel) {
              tabLabel.innerHTML = currentTab.fileName; // Remove warning indicator
            }
          }
          
          showNotification(`Full file loaded (${Math.round(result.totalSize / 1024)}KB)`, 'success');
        }
      } else {
        showNotification('Failed to load full file: ' + result.error, 'error');
      }
    } catch (error) {
      console.error('Error loading full file:', error);
      showNotification('Error loading full file', 'error');
    }
  }

  // Sync gutter scroll with editor
  function syncScroll() {
    if (gutter && editor) {
      gutter.scrollTop = editor.scrollTop;
    }
  }

  // Mark tab as modified
  function markTabModified(tabId) {
    const tab = openTabs.get(tabId);
    if (tab && !tab.modified) {
      tab.modified = true;
      const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`);
      if (tabElement) {
        tabElement.classList.add('modified');
      }
    }
  }

  // Mark tab as clean
  function markTabClean(tabId) {
    const tab = openTabs.get(tabId);
    if (tab && tab.modified) {
      tab.modified = false;
      const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`);
      if (tabElement) {
        tabElement.classList.remove('modified');
      }
    }
  }

  // Menu management
  let activeMenu = null;

  window.toggleMenu = function(menuId) {
    const menu = document.getElementById(menuId);
    const dropdown = menu.querySelector('.dropdown-menu');
    
    if (activeMenu && activeMenu !== menuId) {
      hideAllMenus();
    }
    
    if (dropdown.classList.contains('show')) {
      hideAllMenus();
    } else {
      dropdown.classList.add('show');
      menu.classList.add('active');
      activeMenu = menuId;
    }
  };

  window.hideAllMenus = function() {
    document.querySelectorAll('.dropdown-menu').forEach(menu => {
      menu.classList.remove('show');
    });
    document.querySelectorAll('.menu-item').forEach(item => {
      item.classList.remove('active');
    });
    activeMenu = null;
  };

  // Close menus when clicking outside
  document.addEventListener('click', function(e) {
    if (!e.target.closest('.menu-item')) {
      hideAllMenus();
    }
  });

  // Additional menu functions
  window.saveAsFile = async function() {
    try {
      if (!activeTabId) {
        showNotification('No file to save', 'warning');
        return;
      }
      
      const currentTab = openTabs.get(activeTabId);
      if (!currentTab) return;
      
      currentTab.content = editor.value;
      
      const result = await ipcRenderer.invoke('save-file-as', currentTab.content);
      if (result.success) {
        currentTab.filePath = result.filePath;
        currentTab.fileName = result.fileName;
        
        // Update tab label
        const tabElement = document.querySelector(`[data-tab-id="${activeTabId}"]`);
        if (tabElement) {
          const labelElement = tabElement.querySelector('.tab-label');
          if (labelElement) {
            labelElement.textContent = result.fileName;
          }
          tabElement.setAttribute('data-file-path', result.filePath);
        }
        
        markTabClean(activeTabId);
        showNotification(`File saved as "${result.fileName}"`, 'success');
      } else if (!result.canceled) {
        showNotification('Failed to save file: ' + result.error, 'error');
      }
    } catch (error) {
      showNotification('Error saving file: ' + error.message, 'error');
    }
  };

  window.closeCurrentTab = function() {
    if (activeTabId) {
      const event = new Event('click');
      closeTab(event, activeTabId);
    }
  };

  window.goToLine = function() {
    if (!activeTabId) {
      showNotification('No file open', 'warning');
      return;
    }
    
    const lineNumber = prompt('Go to line:', '1');
    if (lineNumber && !isNaN(lineNumber)) {
      jumpToLine(parseInt(lineNumber));
    }
  };

  // Show/hide welcome screen and editor
  function showWelcomeScreen() {
    welcomeScreen.style.display = 'flex';
    editorArea.style.display = 'none';
    tabsContainer.style.display = 'none';
  }

  function showEditor() {
    welcomeScreen.style.display = 'none';
    editorArea.style.display = 'flex';
    tabsContainer.style.display = 'flex';
  }

  // Initialize editor functionality
  if (editor && gutter && lineCounter) {
    const updateAll = () => {
      updateGutter();
      updateStatusBar();
    };

    // Enhanced input handler with modification tracking
    editor.addEventListener('input', (e) => {
      updateAll();
      
      // Update current tab content and mark as modified
      const currentTab = openTabs.get(activeTabId);
      if (currentTab) {
        const newContent = editor.value;
        if (currentTab.content !== newContent) {
          currentTab.content = newContent;
          markTabModified(activeTabId);
        }
      }
    });

    editor.addEventListener('scroll', syncScroll);
    editor.addEventListener('click', updateStatusBar);
    editor.addEventListener('keyup', updateStatusBar);
    editor.addEventListener('select', updateStatusBar);
    
    // Handle cursor movement with arrow keys, page up/down, etc.
    editor.addEventListener('selectionchange', updateStatusBar);
    
    // Initialize
    updateAll();
  }

  // Activity bar management
  function setActiveActivity(activityId) {
    document.querySelectorAll('.activity-item').forEach(item => {
      item.classList.remove('active');
    });
    const element = document.getElementById(activityId);
    if (element) {
      element.classList.add('active');
    }
  }

  // Show explorer view
  window.showExplorer = function() {
    setActiveActivity('explorer-activity');
    sidebarTitle.textContent = 'Explorer';
    explorerView.style.display = 'block';
    searchView.style.display = 'none';
    if (sidebar.style.display === 'none') {
      sidebar.style.display = 'flex';
    }
  };

  // Show search view
  window.showSearch = function() {
    setActiveActivity('search-activity');
    sidebarTitle.textContent = 'Search';
    explorerView.style.display = 'none';
    searchView.style.display = 'block';
    if (sidebar.style.display === 'none') {
      sidebar.style.display = 'flex';
    }
    setTimeout(() => searchInput && searchInput.focus(), 100);
  };

  // Tools panel with optimized animations
  window.showToolsPanel = function () {
    toolsPanel.style.display = 'flex';
    // Force reflow
    toolsPanel.offsetHeight;
    toolsPanel.classList.add('active');
  };

  window.hideToolsPanel = function () {
    toolsPanel.classList.remove('active');
    setTimeout(() => {
      if (!toolsPanel.classList.contains('active')) {
        toolsPanel.style.display = 'none';
      }
    }, 300);
  };

  // Sidebar toggle
  window.toggleSidebar = function () {
    if (sidebar.style.width === '0px' || sidebar.style.display === 'none') {
      sidebar.style.width = '280px';
      sidebar.style.display = 'flex';
    } else {
      sidebar.style.width = '0px';
      setTimeout(() => {
        sidebar.style.display = 'none';
      }, 200);
    }
  };

  // Tab management
  function createTab(fileName, filePath = null, content = '', fileInfo = {}) {
    // Show editor area if this is the first tab
    if (openTabs.size === 0) {
      showEditor();
    }
    
    const tabId = 'tab_' + (++tabIdCounter);
    
    // Create tab data
    openTabs.set(tabId, {
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
      <div class="tab-close" onclick="closeTab(event, '${tabId}')">×</div>
    `;
    
    tabElement.addEventListener('click', (e) => {
      if (!e.target.classList.contains('tab-close')) {
        switchToTab(tabId);
      }
    });
    
    tabsContainer.appendChild(tabElement);
    return tabId;
  }

  function switchToTab(tabId) {
    // Save current tab content if we have an active tab
    if (activeTabId && openTabs.has(activeTabId)) {
      const currentTab = openTabs.get(activeTabId);
      currentTab.content = editor.value;
    }

    // Update active tab
    activeTabId = tabId;
    const newTab = openTabs.get(tabId);
    
    if (newTab) {
      // Update editor
      editor.value = newTab.content;
      updateGutter();
      updateStatusBar();
      // Update file type in status bar
      updateFileTypeStatus(newTab.fileName);
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
    }
  }

  window.closeTab = function(event, tabId) {
    event.stopPropagation();
    
    const tab = openTabs.get(tabId);
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
    openTabs.delete(tabId);
    
    // If closing active tab, switch to another tab or show welcome screen
    if (activeTabId === tabId) {
      const remainingTabs = Array.from(openTabs.keys());
      if (remainingTabs.length > 0) {
        switchToTab(remainingTabs[remainingTabs.length - 1]);
      } else {
        // No more tabs, show welcome screen
        activeTabId = null;
        showWelcomeScreen();
      }
    }
  };

  // Open workspace folder
  window.openWorkspace = async function () {
    try {
      const result = await ipcRenderer.invoke('open-folder-dialog');
      
      if (result.success) {
        currentWorkspacePath = result.folderPath;
        const folderName = result.folderPath.split(/[/\\]/).pop();
        
        // Update UI
        workspaceName.textContent = folderName.toUpperCase();
        workspaceFolder.style.display = 'block';
        noWorkspace.style.display = 'none';
        
        // Build and display file tree
        renderFileTree(result.fileTree);
        
        showNotification(`Workspace "${folderName}" opened successfully`, 'success');
      } else if (!result.canceled) {
        showNotification('Failed to open workspace: ' + (result.error || 'Unknown error'), 'error');
      }
    } catch (error) {
      showNotification('Error opening workspace: ' + error.message, 'error');
    }
  };

  // Open single file
  window.openFile = async function () {
    try {
      console.log('Opening file dialog...');
      const result = await ipcRenderer.invoke('open-file-dialog');
      console.log('Open file result:', result);
      
      if (result.success) {
        console.log('File opened successfully, checking for warnings...');
        if (result.warning === 'encoding') {
          console.log('Encoding warning detected, showing dialog...');
          // Show encoding warning dialog
          const userChoice = await showEncodingWarningDialog();
          console.log('User choice:', userChoice);
          if (userChoice === 'no') {
            console.log('User chose not to open file');
            return;
          } else if (userChoice === 'yes') {
            console.log('User chose to open file anyway');
            // Force open the file
            const forceResult = await ipcRenderer.invoke('force-open-file', result.filePath);
            console.log('Force open result:', forceResult);
            if (forceResult.success) {
              openFileInTab(forceResult.filePath, forceResult.content, forceResult.fileName, {
                isPartial: forceResult.isPartial,
                totalSize: forceResult.totalSize,
                loadedSize: forceResult.loadedSize,
                encodingWarning: forceResult.encodingWarning
              });
              showNotification(`File "${forceResult.fileName}" opened with encoding warnings`, 'warning');
            } else {
              showNotification('Failed to open file: ' + forceResult.error, 'error');
            }
          }
        } else {
          console.log('No warnings, opening file normally');
          // Normal file opening
          openFileInTab(result.filePath, result.content, result.fileName, {
            isPartial: result.isPartial,
            totalSize: result.totalSize,
            loadedSize: result.loadedSize
          });
          
          if (result.isPartial) {
            showNotification(`Large file "${result.fileName}" partially loaded (${formatFileSize(result.loadedSize)} of ${formatFileSize(result.totalSize)})`, 'info');
          } else {
            showNotification(`File "${result.fileName}" opened successfully`, 'success');
          }
        }
      } else if (!result.canceled) {
        showNotification('Failed to open file: ' + (result.error || 'Unknown error'), 'error');
      }
    } catch (error) {
      showNotification('Error opening file: ' + error.message, 'error');
    }
  };

  function openFileInTab(filePath, content, fileName, fileInfo = {}) {
    // Check if file is already open
    for (const [tabId, tab] of openTabs) {
      if (tab.filePath === filePath) {
        switchToTab(tabId);
        // Also update file type in status bar
        updateFileTypeStatus(tab.fileName);
        return;
      }
    }
    // Create new tab
    const tabId = createTab(fileName, filePath, content, fileInfo);
    switchToTab(tabId);
    // Also update file type in status bar
    updateFileTypeStatus(fileName);
  }

  // Save file
  window.saveFile = async function () {
    try {
      // If no active tab, create a new one first
      if (!activeTabId) {
        createNewFile();
        // Wait a moment for the editor to be ready
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      const currentTab = openTabs.get(activeTabId);
      if (!currentTab) return;
      
      // Update current tab content from editor
      currentTab.content = editor.value;
      
      if (currentTab.filePath) {
        const result = await ipcRenderer.invoke('save-file', currentTab.filePath, currentTab.content);
        if (result.success) {
          markTabClean(activeTabId);
          showNotification('File saved successfully', 'success');
        } else {
          showNotification('Failed to save file: ' + result.error, 'error');
        }
      } else {
        // Save as new file
        const result = await ipcRenderer.invoke('save-file-as', currentTab.content);
        if (result.success) {
          currentTab.filePath = result.filePath;
          currentTab.fileName = result.fileName;
          
          // Update tab label
          const tabElement = document.querySelector(`[data-tab-id="${activeTabId}"]`);
          if (tabElement) {
            const labelElement = tabElement.querySelector('.tab-label');
            if (labelElement) {
              labelElement.textContent = result.fileName;
            }
            tabElement.setAttribute('data-file-path', result.filePath);
          }
          
          markTabClean(activeTabId);
          showNotification(`File saved as "${result.fileName}"`, 'success');
        } else if (!result.canceled) {
          showNotification('Failed to save file: ' + result.error, 'error');
        }
      }
    } catch (error) {
      showNotification('Error saving file: ' + error.message, 'error');
    }
  };

  // Render file tree
  function renderFileTree(tree, container = fileTree, level = 0) {
    container.innerHTML = '';
    
    tree.forEach(item => {
      const itemElement = document.createElement('div');
      itemElement.style.marginLeft = (level * 16) + 'px';
      
      if (item.type === 'directory') {
        itemElement.className = 'file-tree-item';
        itemElement.innerHTML = `
          <span class="icon">📁</span>
          <span class="name">${item.name}</span>
        `;
        
        let expanded = false;
        let childContainer = null;
        
        itemElement.addEventListener('click', () => {
          if (!expanded && item.children) {
            childContainer = document.createElement('div');
            itemElement.parentNode.insertBefore(childContainer, itemElement.nextSibling);
            renderFileTree(item.children, childContainer, level + 1);
            itemElement.querySelector('.icon').textContent = '📂';
            expanded = true;
          } else if (expanded && childContainer) {
            childContainer.remove();
            itemElement.querySelector('.icon').textContent = '📁';
            expanded = false;
          }
        });
      } else {
        itemElement.className = 'file-tree-item';
        itemElement.setAttribute('data-file-path', item.path);
        const fileIcon = getFileIcon(item.name);
        itemElement.innerHTML = `
          <span class="icon">${fileIcon}</span>
          <span class="name">${item.name}</span>
        `;
        
        itemElement.addEventListener('click', async () => {
          try {
            console.log('Clicking on file tree item:', item.path);
            const result = await ipcRenderer.invoke('read-file', item.path);
            console.log('File tree read result:', result);
            
            if (result.success) {
              // Check if this file has encoding warnings
              if (result.warning === 'encoding') {
                console.log('File tree: Encoding warning detected, showing dialog...');
                const userChoice = await showEncodingWarningDialog();
                console.log('File tree: User choice:', userChoice);
                
                if (userChoice === 'no') {
                  console.log('File tree: User chose not to open file');
                  return;
                } else if (userChoice === 'yes') {
                  console.log('File tree: User chose to open file anyway');
                  // Force open the file
                  const forceResult = await ipcRenderer.invoke('force-open-file', item.path);
                  console.log('File tree: Force open result:', forceResult);
                  
                  if (forceResult.success) {
                    openFileInTab(item.path, forceResult.content, forceResult.fileName, {
                      isPartial: forceResult.isPartial,
                      totalSize: forceResult.totalSize,
                      loadedSize: forceResult.loadedSize,
                      encodingWarning: forceResult.encodingWarning
                    });
                    
                    // Highlight selected file
                    document.querySelectorAll('.file-tree-item').forEach(el => el.classList.remove('selected'));
                    itemElement.classList.add('selected');
                    
                    showNotification(`File "${forceResult.fileName}" opened with encoding warnings`, 'warning');
                  } else {
                    showNotification('Failed to open file: ' + forceResult.error, 'error');
                  }
                }
              } else {
                // Normal file opening - no encoding issues
                console.log('File tree: No warnings, opening file normally');
                openFileInTab(item.path, result.content, result.fileName, {
                  isPartial: result.isPartial,
                  totalSize: result.totalSize,
                  loadedSize: result.loadedSize,
                  encodingWarning: result.encodingWarning
                });
                
                // Highlight selected file
                document.querySelectorAll('.file-tree-item').forEach(el => el.classList.remove('selected'));
                itemElement.classList.add('selected');
              }
            } else {
              showNotification('Failed to open file: ' + result.error, 'error');
            }
          } catch (error) {
            showNotification('Error opening file: ' + error.message, 'error');
          }
        });
      }
      
      container.appendChild(itemElement);
    });
  }

  // Get file icon based on extension
  function getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const iconMap = {
      'js': '🟨',
      'ts': '🔷',
      'html': '🟧',
      'css': '🎨',
      'json': '📋',
      'md': '📝',
      'py': '🐍',
      'cpp': '⚙️',
      'c': '⚙️',
      'h': '📄',
      'java': '☕',
      'php': '🐘',
      'rb': '💎',
      'go': '🐹',
      'rs': '🦀'
    };
    return iconMap[ext] || '📄';
  }

  // Search functionality
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const searchTerm = e.target.value.trim();
      
      if (searchTimeout) {
        clearTimeout(searchTimeout);
      }
      
      if (searchTerm.length >= 2 && currentWorkspacePath) {
        searchTimeout = setTimeout(() => {
          performSearch(searchTerm);
        }, 300);
      } else {
        searchResults.innerHTML = '';
      }
    });
  }

  // Perform search in workspace
  async function performSearch(searchTerm) {
    if (!currentWorkspacePath) {
      searchResults.innerHTML = '<div style="color: #7d8590; padding: 12px; text-align: center;">Open a workspace to search</div>';
      return;
    }

    try {
      searchResults.innerHTML = '<div style="color: #7d8590; padding: 12px; text-align: center;">Searching...</div>';
      
      const result = await ipcRenderer.invoke('search-in-files', searchTerm, currentWorkspacePath);
      
      if (result.success) {
        displaySearchResults(result.results, searchTerm);
      } else {
        searchResults.innerHTML = '<div style="color: #f85149; padding: 12px;">Search failed: ' + result.error + '</div>';
      }
    } catch (error) {
      searchResults.innerHTML = '<div style="color: #f85149; padding: 12px;">Search error: ' + error.message + '</div>';
    }
  }

  // Display search results
  function displaySearchResults(results, searchTerm) {
    if (results.length === 0) {
      searchResults.innerHTML = '<div style="color: #7d8590; padding: 12px; text-align: center;">No results found</div>';
      return;
    }

    const groupedResults = {};
    results.forEach(result => {
      if (!groupedResults[result.file]) {
        groupedResults[result.file] = [];
      }
      groupedResults[result.file].push(result);
    });

    let html = '<div style="display: flex; flex-direction: column; gap: 8px;">';
    
    Object.keys(groupedResults).forEach(file => {
      const fileResults = groupedResults[file];
      const fileName = file.split(/[/\\]/).pop();
      const relativePath = file.replace(currentWorkspacePath, '').replace(/^[/\\]/, '');
      
      // Escape the file path properly for onclick
      const escapedPath = file.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      
      html += `<div class="search-result-item" style="display: flex; flex-direction: column;">`;
      html += `<div class="search-result-file" onclick="openSearchResult('${escapedPath}', ${fileResults[0].line})" style="margin-bottom: 4px;">${fileName}</div>`;
      html += `<div class="search-result-line" style="margin-bottom: 6px;">${relativePath} • ${fileResults.length} result${fileResults.length > 1 ? 's' : ''}</div>`;
      
      // Show each line result individually in vertical layout
      html += '<div style="display: flex; flex-direction: column; gap: 2px;">';
      fileResults.forEach(result => {
        const highlightedContent = result.content.replace(
          new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
          match => `<span class="search-highlight">${match}</span>`
        );
        html += `<div class="search-result-content" onclick="openSearchResult('${escapedPath}', ${result.line}); event.stopPropagation();" style="display: block; margin: 2px 0; padding: 4px 6px; cursor: pointer; border-radius: 3px; background: #161b22; border-left: 2px solid #1f6feb;" onmouseover="this.style.background='#30363d'" onmouseout="this.style.background='#161b22'">`;
        html += `<div style="color: #7d8590; font-size: 10px; margin-bottom: 2px;">Line ${result.line}:</div>`;
        html += `<div style="font-family: monospace; font-size: 11px;">${highlightedContent}</div>`;
        html += `</div>`;
      });
      html += '</div>';
      
      html += '</div>';
    });
    
    html += '</div>';
    searchResults.innerHTML = html;
  }

  // Open search result with proper line navigation
  window.openSearchResult = async function(filePath, lineNumber) {
    console.log('Opening search result:', filePath, 'at line', lineNumber);
    
    try {
      // Normalize the file path
      const normalizedPath = filePath.replace(/\\\\/g, '\\');
      
      const result = await ipcRenderer.invoke('read-file', normalizedPath);
      console.log('Search result read result:', result);
      
      if (result.success) {
        // Check if this file has encoding warnings
        if (result.warning === 'encoding') {
          console.log('Search result: Encoding warning detected, showing dialog...');
          const userChoice = await showEncodingWarningDialog();
          console.log('Search result: User choice:', userChoice);
          
          if (userChoice === 'no') {
            console.log('Search result: User chose not to open file');
            return;
          } else if (userChoice === 'yes') {
            console.log('Search result: User chose to open file anyway');
            // Force open the file
            const forceResult = await ipcRenderer.invoke('force-open-file', normalizedPath);
            console.log('Search result: Force open result:', forceResult);
            
            if (forceResult.success) {
              // Open the file in a tab
              openFileInTab(normalizedPath, forceResult.content, forceResult.fileName, {
                isPartial: forceResult.isPartial,
                totalSize: forceResult.totalSize,
                loadedSize: forceResult.loadedSize,
                encodingWarning: forceResult.encodingWarning
              });
              
              // Switch to explorer view and wait for editor to be ready
              showExplorer();
              
              // Wait a bit longer for the tab to switch and editor to update
              setTimeout(() => {
                jumpToLine(lineNumber);
                showNotification(`Opened ${forceResult.fileName} at line ${lineNumber} with encoding warnings`, 'warning');
              }, 200);
            } else {
              showNotification('Failed to open file: ' + forceResult.error, 'error');
            }
          }
        } else {
          // Normal file opening - no encoding issues
          console.log('Search result: No warnings, opening file normally');
          // Open the file in a tab
          openFileInTab(normalizedPath, result.content, result.fileName, {
            isPartial: result.isPartial,
            totalSize: result.totalSize,
            loadedSize: result.loadedSize,
            encodingWarning: result.encodingWarning
          });
          
          // Switch to explorer view and wait for editor to be ready
          showExplorer();
          
          // Wait a bit longer for the tab to switch and editor to update
          setTimeout(() => {
            jumpToLine(lineNumber);
            showNotification(`Opened ${result.fileName} at line ${lineNumber}`, 'success');
          }, 200);
        }
      } else {
        showNotification('Error opening file: ' + (result.error || 'Unknown error'), 'error');
      }
    } catch (error) {
      console.error('Error opening search result:', error);
      showNotification('Error opening search result: ' + error.message, 'error');
    }
  };

  // Jump to specific line in editor
  function jumpToLine(lineNumber) {
    console.log('Jumping to line:', lineNumber);
    
    const editor = document.getElementById('editor');
    if (!editor) {
      console.error('Editor not found');
      return;
    }
    
    const lines = editor.value.split('\n');
    console.log('Total lines in editor:', lines.length);
    
    if (lineNumber > lines.length) {
      console.warn('Line number exceeds file length');
      return;
    }
    
    let position = 0;
    
    // Calculate character position of the target line
    for (let i = 0; i < lineNumber - 1 && i < lines.length; i++) {
      position += lines[i].length + 1; // +1 for newline character
    }
    
    console.log('Calculated position:', position);
    
    // Set cursor position
    editor.focus();
    editor.setSelectionRange(position, position);
    
    // Calculate and set scroll position
    const lineHeight = 20; // Approximate line height
    const targetScrollTop = Math.max(0, (lineNumber - 10) * lineHeight);
    
    editor.scrollTop = targetScrollTop;
    
    // Update status bar
    updateStatusBar();
    
    // Highlight the line temporarily
    const endOfLinePosition = position + (lines[lineNumber - 1] ? lines[lineNumber - 1].length : 0);
    setTimeout(() => {
      editor.setSelectionRange(position, endOfLinePosition);
    }, 50);
    
    console.log('Successfully jumped to line:', lineNumber);
  }

  // Create new file
  window.createNewFile = function () {
    const fileName = 'untitled-' + (tabIdCounter + 1);
    const tabId = createTab(fileName);
    switchToTab(tabId);
    editor.focus();
  };

  // Enhanced formatting
  window.formatCode = function () {
    const currentTab = openTabs.get(activeTabId);
    if (!currentTab) return;
    
    const lines = editor.value.split('\n');
    let indentLevel = 0;
    const formatted = lines.map(line => {
      const trimmed = line.trim();
      if (trimmed.endsWith('{') || trimmed.endsWith(':')) {
        const result = '  '.repeat(indentLevel) + trimmed;
        indentLevel++;
        return result;
      } else if (trimmed.startsWith('}')) {
        indentLevel = Math.max(0, indentLevel - 1);
        return '  '.repeat(indentLevel) + trimmed;
      } else {
        return '  '.repeat(indentLevel) + trimmed;
      }
    }).join('\n');
    
    editor.value = formatted;
    currentTab.content = formatted;
    markTabModified(activeTabId);
    updateGutter();
    updateStatusBar();
  };

  window.toggleWordWrap = function () {
    editor.style.whiteSpace = editor.style.whiteSpace === 'pre-wrap' ? 'pre' : 'pre-wrap';
  };

  // Tools Panel Functions
  window.toggleToolsPanel = function () {
    const toolsPanel = document.getElementById('toolsPanel');
    if (toolsPanel.classList.contains('active')) {
      hideToolsPanel();
    } else {
      showToolsPanel();
    }
  };

  window.showToolsPanel = function () {
    const toolsPanel = document.getElementById('toolsPanel');
    toolsPanel.classList.add('active');
  };

  window.hideToolsPanel = function () {
    const toolsPanel = document.getElementById('toolsPanel');
    toolsPanel.classList.remove('active');
  };

  // window.showExtensions = function () {
  //   showNotification('Extensions marketplace - Coming soon!', 'info');
  // };

  // Optimized panel resizing functionality
  window.initSidebarResize = function (e) {
    isResizing = true;
    resizeType = 'sidebar';
    startResize(e);
  };

  window.initToolsPanelResize = function (e) {
    isResizing = true;
    resizeType = 'toolsPanel';
    startResize(e);
  };

  function startResize(e) {
    // Disable transitions during resize for better performance
    if (resizeType === 'sidebar') {
      sidebar.style.transition = 'none';
    } else if (resizeType === 'toolsPanel') {
      toolsPanel.style.transition = 'none';
    }
    
    document.addEventListener('mousemove', doResize);
    document.addEventListener('mouseup', stopResize);
    e.preventDefault();
    
    // Prevent text selection during resize
    document.body.style.userSelect = 'none';
  }

  function doResize(e) {
    if (!isResizing) return;
    
    // Use requestAnimationFrame for smooth resizing
    requestAnimationFrame(() => {
      if (resizeType === 'sidebar') {
        const containerRect = sidebar.parentElement.getBoundingClientRect();
        const newWidth = e.clientX - containerRect.left;
        const minWidth = 180;
        const maxWidth = window.innerWidth * 0.5;
        
        if (newWidth >= minWidth && newWidth <= maxWidth) {
          sidebar.style.width = newWidth + 'px';
        }
      } else if (resizeType === 'toolsPanel') {
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

  function stopResize() {
    isResizing = false;
    
    // Re-enable transitions
    if (resizeType === 'sidebar') {
      sidebar.style.transition = '';
    } else if (resizeType === 'toolsPanel') {
      toolsPanel.style.transition = '';
    }
    
    // Re-enable text selection
    document.body.style.userSelect = '';
    
    document.removeEventListener('mousemove', doResize);
    document.removeEventListener('mouseup', stopResize);
    
    resizeType = null;
  }

  // Show notification
  function showNotification(message, type = 'info') {
    const colors = {
      success: '#238636',
      error: '#f85149',
      info: '#1f6feb',
      warning: '#d29922'
    };
    
    const notification = document.createElement('div');
    notification.innerHTML = `
      <div style="position: fixed; top: 20px; right: 20px; background: ${colors[type]}; color: white; padding: 12px 16px; border-radius: 6px; z-index: 1000; box-shadow: 0 4px 12px rgba(0,0,0,0.3); animation: slideIn 0.3s ease; max-width: 400px;">
        ${type === 'success' ? '✓' : type === 'error' ? '✗' : type === 'warning' ? '⚠' : 'ℹ'} ${message}
      </div>
      <style>
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      </style>
    `;
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.remove();
    }, 4000);
  }

  // Keyboard shortcuts
  document.addEventListener('keydown', function(e) {
    // Ctrl+S - Save
    if (e.ctrlKey && e.key === 's') {
      e.preventDefault();
      saveFile();
    }
    
    // Ctrl+O - Open file
    if (e.ctrlKey && e.key === 'o') {
      e.preventDefault();
      openFile();
    }
    
    // Ctrl+Shift+O - Open folder
    if (e.ctrlKey && e.shiftKey && e.key === 'O') {
      e.preventDefault();
      openWorkspace();
    }
    
    // Ctrl+N - New file
    if (e.ctrlKey && e.key === 'n') {
      e.preventDefault();
      createNewFile();
    }
    
    // Ctrl+Shift+S - Save As
    if (e.ctrlKey && e.shiftKey && e.key === 'S') {
      e.preventDefault();
      saveAsFile();
    }
    
    // Ctrl+B - Toggle sidebar
    if (e.ctrlKey && e.key === 'b') {
      e.preventDefault();
      toggleSidebar();
    }
    
    // Alt+Z - Toggle word wrap
    if (e.altKey && e.key === 'z') {
      e.preventDefault();
      toggleWordWrap();
    }
    
    // Shift+Alt+F - Format document
    if (e.shiftKey && e.altKey && e.key === 'F') {
      e.preventDefault();
      formatCode();
    }
    
    // Ctrl+W - Close tab
    if (e.ctrlKey && e.key === 'w') {
      e.preventDefault();
      if (activeTabId) {
        closeTab(e, activeTabId);
      }
    }
    
    // Ctrl+F - Find
    if (e.ctrlKey && e.key === 'f') {
      e.preventDefault();
      showFindDialog();
    }
    
    // Ctrl+G - Go to line
    if (e.ctrlKey && e.key === 'g') {
      e.preventDefault();
      showGoToLineDialog();
    }
    
    // Ctrl+Tab - Next tab
    if (e.ctrlKey && e.key === 'Tab') {
      e.preventDefault();
      const tabIds = Array.from(openTabs.keys());
      if (tabIds.length > 0 && activeTabId) {
        const currentIndex = tabIds.indexOf(activeTabId);
        const nextIndex = (currentIndex + 1) % tabIds.length;
        switchToTab(tabIds[nextIndex]);
      }
    }
    
    // Ctrl+G - Go to line
    if (e.ctrlKey && e.key === 'g') {
      e.preventDefault();
      const lineNumber = prompt('Go to line:', '1');
      if (lineNumber && !isNaN(lineNumber)) {
        jumpToLine(parseInt(lineNumber));
      }
    }
    
    // Ctrl+` - Toggle tools panel
    if (e.ctrlKey && e.key === '`') {
      e.preventDefault();
      if (toolsPanel.classList.contains('active')) {
        hideToolsPanel();
      } else {
        showToolsPanel();
      }
    }
    
    // Ctrl+Shift+F - Search
    if (e.ctrlKey && e.shiftKey && e.key === 'F') {
      e.preventDefault();
      showSearch();
    }
    
    // Ctrl+Shift+E - Explorer
    if (e.ctrlKey && e.shiftKey && e.key === 'E') {
      e.preventDefault();
      showExplorer();
    }
  });

  // Theme and settings
  const autoSaveCheckbox = document.getElementById('autoSave');
  const lineNumbersCheckbox = document.getElementById('lineNumbers');

  if (autoSaveCheckbox) {
    autoSaveCheckbox.addEventListener('change', function() {
      if (this.checked) {
        showNotification('Auto-save enabled', 'success');
        // TODO: Implement auto-save logic
      } else {
        showNotification('Auto-save disabled', 'info');
      }
    });
  }

  if (lineNumbersCheckbox) {
    lineNumbersCheckbox.addEventListener('change', function() {
      gutter.style.display = this.checked ? 'block' : 'none';
    });
  }

  // Search Widget Functions
  let currentSearchMatches = [];
  let currentMatchIndex = -1;
  let searchHighlights = [];

  window.showFindDialog = function() {
    const widget = document.getElementById('search-widget');
    const input = document.getElementById('widget-search-input');
    widget.classList.add('visible');
    input.focus();
    input.select();
  };

  window.closeSearchWidget = function() {
    const widget = document.getElementById('search-widget');
    widget.classList.remove('visible');
    clearSearchHighlights();
    currentSearchMatches = [];
    currentMatchIndex = -1;
    updateSearchResults();
  };

  window.performLiveSearch = function(searchText) {
    clearSearchHighlights();
    currentSearchMatches = [];
    currentMatchIndex = -1;

    if (!searchText.trim() || !activeTabId || !openTabs.has(activeTabId)) {
      updateSearchResults();
      return;
    }

    const editor = document.getElementById('editor');
    const text = editor.value;
    
    if (!text) {
      updateSearchResults();
      return;
    }

    try {
      const regex = new RegExp(searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      let match;
      
      while ((match = regex.exec(text)) !== null) {
        currentSearchMatches.push({
          start: match.index,
          end: match.index + match[0].length,
          text: match[0]
        });
        
        // Prevent infinite loops with zero-length matches
        if (match.index === regex.lastIndex) {
          regex.lastIndex++;
        }
      }

      if (currentSearchMatches.length > 0) {
        currentMatchIndex = 0;
        highlightAllMatches();
        // Don't focus on match during live search - only highlight
      }
    } catch (e) {
      console.warn('Invalid search regex:', e);
    }

    updateSearchResults();
  };

  window.searchNext = function() {
    if (currentSearchMatches.length === 0) return;
    
    currentMatchIndex = (currentMatchIndex + 1) % currentSearchMatches.length;
    highlightAllMatches();
    focusOnCurrentMatch();
    updateSearchResults();
  };

  window.searchPrev = function() {
    if (currentSearchMatches.length === 0) return;
    
    currentMatchIndex = currentMatchIndex <= 0 
      ? currentSearchMatches.length - 1 
      : currentMatchIndex - 1;
    highlightAllMatches();
    focusOnCurrentMatch();
    updateSearchResults();
  };

  function updateSearchResults() {
    const resultsText = document.getElementById('search-results-text');
    const prevBtn = document.getElementById('search-prev');
    const nextBtn = document.getElementById('search-next');

    if (currentSearchMatches.length === 0) {
      resultsText.textContent = 'No results';
      prevBtn.disabled = true;
      nextBtn.disabled = true;
    } else {
      resultsText.textContent = `${currentMatchIndex + 1} of ${currentSearchMatches.length}`;
      prevBtn.disabled = false;
      nextBtn.disabled = false;
    }
  }

  function focusOnCurrentMatch() {
    if (currentMatchIndex >= 0 && currentMatchIndex < currentSearchMatches.length) {
      const editor = document.getElementById('editor');
      const match = currentSearchMatches[currentMatchIndex];
      
      editor.focus();
      editor.setSelectionRange(match.start, match.end);
      
      // Scroll to make the match visible
      const lines = editor.value.substring(0, match.start).split('\n');
      const lineNumber = lines.length;
      const approximateLineHeight = 20;
      const targetScrollTop = (lineNumber - 5) * approximateLineHeight; // Show some context
      
      editor.scrollTop = Math.max(0, targetScrollTop);
      
      // Highlight the selected text with yellow background
      setTimeout(() => {
        if (editor.setSelectionRange) {
          editor.setSelectionRange(match.start, match.end);
        }
      }, 10);
    }
  }

  function highlightAllMatches() {
    // For now, we'll keep it simple and just highlight the current match when navigating
    // Visual highlighting without moving cursor during live search
  }

  window.clearSearchHighlights = function() {
    // Clear any visual highlights
    searchHighlights.forEach(highlight => {
      if (highlight.parentNode) {
        highlight.parentNode.removeChild(highlight);
      }
    });
    searchHighlights = [];
  };

  // Add live search as user types
  const widgetSearchInput = document.getElementById('widget-search-input');
  if (widgetSearchInput) {
    widgetSearchInput.addEventListener('input', function(e) {
      performLiveSearch(e.target.value);
    });
  }

  // Go to Line Dialog Functions
  window.showGoToLineDialog = function() {
    const dialog = document.getElementById('goto-dialog');
    const input = document.getElementById('goto-input');
    
    // Set max value based on current content
    if (activeTabId && openTabs.has(activeTabId)) {
      const editor = document.getElementById('editor');
      const lineCount = editor.value.split('\n').length;
      input.max = lineCount;
    }
    
    dialog.classList.add('visible');
    input.focus();
    input.select();
  };

  window.closeGoToLineDialog = function() {
    const dialog = document.getElementById('goto-dialog');
    dialog.classList.remove('visible');
  };

  window.performGoToLine = function() {
    const input = document.getElementById('goto-input');
    const lineNumber = parseInt(input.value);
    
    if (!lineNumber || lineNumber < 1) {
      showNotification('Please enter a valid line number', 'error');
      return;
    }
    
    if (activeTabId && openTabs.has(activeTabId)) {
      const editor = document.getElementById('editor');
      const lines = editor.value.split('\n');
      
      if (lineNumber > lines.length) {
        showNotification(`Line ${lineNumber} does not exist. Maximum line is ${lines.length}`, 'error');
        return;
      }
      
      // Calculate the position of the line
      let position = 0;
      for (let i = 0; i < lineNumber - 1; i++) {
        position += lines[i].length + 1; // +1 for newline character
      }
      
      // Focus and move cursor to the line
      editor.focus();
      editor.setSelectionRange(position, position);
      editor.scrollTop = (lineNumber - 1) * 20; // Approximate line height
      
      showNotification(`Jumped to line ${lineNumber}`, 'success');
    } else {
      showNotification('No file is currently open', 'error');
    }
    
    closeGoToLineDialog();
  };

  // Handle keyboard events for dialogs and search widget
  document.addEventListener('keydown', function(e) {
    const searchWidget = document.getElementById('search-widget');
    const gotoDialog = document.getElementById('goto-dialog');
    const isSearchVisible = searchWidget.classList.contains('visible');
    const isGotoVisible = gotoDialog.classList.contains('visible');

    // Handle Enter key
    if (e.key === 'Enter') {
      if (isSearchVisible) {
        e.preventDefault();
        searchNext(); // Move to next match on Enter
      } else if (isGotoVisible) {
        e.preventDefault();
        performGoToLine();
      }
    }
    
    // Handle Escape key
    if (e.key === 'Escape') {
      if (isSearchVisible) {
        e.preventDefault();
        closeSearchWidget();
      } else if (isGotoVisible) {
        e.preventDefault();
        closeGoToLineDialog();
      }
    }

    // Handle F3/Shift+F3 for search navigation
    if (e.key === 'F3' && isSearchVisible) {
      e.preventDefault();
      if (e.shiftKey) {
        searchPrev();
      } else {
        searchNext();
      }
    }
  });

  // Close dialogs when clicking outside
  document.addEventListener('click', function(e) {
    const searchWidget = document.getElementById('search-widget');
    const gotoDialog = document.getElementById('goto-dialog');
    
    // Close search widget if clicking outside it
    if (searchWidget.classList.contains('visible') && 
        !searchWidget.contains(e.target)) {
      closeSearchWidget();
    }
    
    // Close goto dialog if clicking outside it
    if (gotoDialog.classList.contains('visible') && 
        !gotoDialog.contains(e.target)) {
      closeGoToLineDialog();
    }
  });

  // Encoding warning dialog function
  window.showEncodingWarningDialog = function() {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
      `;
      
      const dialog = document.createElement('div');
      dialog.style.cssText = `
        background: #1c2128;
        border: 1px solid #30363d;
        border-radius: 6px;
        padding: 24px;
        max-width: 500px;
        color: #f0f6fc;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif;
      `;
      
      dialog.innerHTML = `
        <h3 style="margin: 0 0 16px 0; color: #f85149;">⚠️ Non-UTF8 File Detected</h3>
        <p style="margin: 0 0 20px 0; line-height: 1.5;">The file contains non UTF8 characters it may cause improper display. Open still?</p>
        <div style="display: flex; gap: 12px; justify-content: flex-end;">
          <button id="no-btn" style="
            background: #21262d;
            border: 1px solid #30363d;
            color: #f0f6fc;
            padding: 8px 16px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
          ">No</button>
          <button id="yes-btn" style="
            background: #f85149;
            border: 1px solid #f85149;
            color: #ffffff;
            padding: 8px 16px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
          ">Yes</button>
        </div>
      `;
      
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
      
      const noBtn = dialog.querySelector('#no-btn');
      const yesBtn = dialog.querySelector('#yes-btn');
      
      noBtn.addEventListener('click', () => {
        document.body.removeChild(overlay);
        resolve('no');
      });
      
      yesBtn.addEventListener('click', () => {
        document.body.removeChild(overlay);
        resolve('yes');
      });
      
      // Close on escape key
      const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
          document.body.removeChild(overlay);
          document.removeEventListener('keydown', handleKeyDown);
          resolve('no');
        }
      };
      document.addEventListener('keydown', handleKeyDown);
    });
  };

  // Initialize with explorer view and welcome screen
  showExplorer();
  showWelcomeScreen();
});
