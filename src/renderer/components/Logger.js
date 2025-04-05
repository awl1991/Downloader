// Handles console logging and output visibility
export default class Logger {
    initializeConsoleOutput() {
      const output = document.getElementById('output');
      if (output && !output.innerHTML) {
        output.innerHTML = '<div class="text-gray-500">Console output will appear here.</div>';
      }
    }
  
    logOutput(message, className = '') {
      const output = document.getElementById('output');
      if (output.childElementCount === 1 && output.children[0].classList.contains('text-gray-500')) {
        output.innerHTML = '';
      }
      const div = document.createElement('div');
      div.textContent = message;
      if (className) div.className = className;
      output.appendChild(div);
      output.scrollTop = output.scrollHeight;
      this.highlightToggleButtonIfHidden(output);
    }
  
    highlightToggleButtonIfHidden(output) {
      if (output.classList.contains('hidden')) {
        const toggleButton = document.getElementById('toggleLogs');
        if (toggleButton) {
          toggleButton.classList.add('animate-pulse');
          setTimeout(() => toggleButton.classList.remove('animate-pulse'), 1000);
        }
      }
    }
  
    toggleConsoleVisibility(toggleLogsBtn) {
      const output = document.getElementById('output');
      this.ensureConsoleContent(output);
      const isHidden = window.getComputedStyle(output).display === 'none' || output.classList.contains('hidden');
      this.updateConsoleDisplay(output, toggleLogsBtn, isHidden);
    }
  
    ensureConsoleContent(output) {
      if (!output.innerHTML.trim()) {
        output.innerHTML = '<div class="text-gray-500">Console output will appear here. Click "Show Console Output" to toggle visibility.</div>';
      }
    }
  
    updateConsoleDisplay(output, toggleLogsBtn, isHidden) {
      if (isHidden) {
        output.classList.remove('hidden');
        output.style.display = 'block';
        output.style.height = 'auto';
        output.style.minHeight = '200px';
        output.style.maxHeight = '200px';
        this.logOutput('Console output is now visible', 'text-accent-500');
        toggleLogsBtn.innerHTML = this.getHideConsoleIcon();
      } else {
        output.classList.add('hidden');
        output.style.display = 'none';
        toggleLogsBtn.innerHTML = this.getShowConsoleIcon();
      }
    }
  
    getShowConsoleIcon() {
      return '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" /></svg> Show Console Output';
    }
  
    getHideConsoleIcon() {
      return '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clip-rule="evenodd" /></svg> Hide Console Output';
    }
  }