// Import required Node.js modules
const { ipcRenderer } = require('electron');
const { dialog } = require('@electron/remote');

// Get references to HTML elements
const selectFilesBtn = document.getElementById('selectFiles');
const fileListDiv = document.getElementById('fileList');
const targetHoursInput = document.getElementById('targetHours');
const startBtn = document.getElementById('startBtn');
const progressSection = document.getElementById('progressSection');
const progress1 = document.getElementById('progress1');
const progress1Text = document.getElementById('progress1Text');
const progress2 = document.getElementById('progress2');
const progress2Text = document.getElementById('progress2Text');
const randomSection = document.getElementById('randomSection');
const randomCheckbox = document.getElementById('randomOrder');

// Store selected files
let selectedFiles = [];

// Browse Files button - allows single or multiple selection
selectFilesBtn.addEventListener('click', async () => {
    const result = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections'],
        filters: [
            { name: 'Videos', extensions: ['mp4', 'mkv', 'avi', 'mov', 'webm'] }
        ]
    });

    if (!result.canceled && result.filePaths.length > 0) {
        selectedFiles = result.filePaths;
        
        fileListDiv.innerHTML = selectedFiles
            .map(f => `<div>✓ ${f.split('/').pop()}</div>`)
            .join('');
        
        // Show/hide random checkbox
        if (selectedFiles.length > 1) {
            randomSection.style.display = 'block';
        } else {
            randomSection.style.display = 'none';
        }

        // Reset progress bars when new files are selected
        progressSection.style.display = 'none';  // Hide progress section
        progress1.value = 0;
        progress1Text.textContent = '0%';
        progress2.value = 0;
        progress2Text.textContent = '0%';
        startBtn.disabled = false;  // Re-enable start button
    }
});

// Start Processing button click handler
startBtn.addEventListener('click', () => {
    // Validate: Check if files are selected
    if (selectedFiles.length === 0) {
        alert('Please select video files first!');
        return;
    }

    // Validate: Check target hours
    const hours = parseInt(targetHoursInput.value);
    if (hours <= 0 || hours > 100) {
        alert('Please enter valid hours (1-100)');
        return;
    }

    // Get random setting (only relevant if multiple files)
    const random = selectedFiles.length > 1 ? randomCheckbox.checked : false;

    // Reset progress bars to 0
    progress1.value = 0;
    progress1Text.textContent = '0%';
    progress2.value = 0;
    progress2Text.textContent = '0%';

    // Show progress section
    progressSection.style.display = 'block';
    startBtn.disabled = true;  // Disable start button during processing

    // TODO: Call Python script with these parameters
    console.log('Starting with:', {
        files: selectedFiles,
        hours: hours,
        random: random
    });

    // Simulate progress for now (we'll connect to Python next)
    simulateProgress();
});


// Temporary function to simulate progress (for testing UI)
function simulateProgress() {
    let prog1 = 0;
    let prog2 = 0;

    // Simulate step 1
    const interval1 = setInterval(() => {
        prog1 += 1;
        progress1.value = prog1;
        progress1Text.textContent = prog1 + '%';

        if (prog1 >= 100) {
            clearInterval(interval1);

            // Start step 2 after step 1 completes
            const interval2 = setInterval(() => {
                prog2 += 1;
                progress2.value = prog2;
                progress2Text.textContent = prog2 + '%';

                // Only show complete when actually at 100%
                if (prog2 >= 100) {
                    clearInterval(interval2);
                    alert('Processing complete! ✅');
                    startBtn.disabled = false;  // Re-enable start button
                }
            }, 50);
        }
    }, 100);
}

// Temporary function to simulate progress (for testing UI)
function simulateProgress() {
    let prog1 = 0;
    let prog2 = 0;

    // Simulate step 1
    const interval1 = setInterval(() => {
        prog1 += 1;
        progress1.value = prog1;
        progress1Text.textContent = prog1 + '%';

        if (prog1 === 100) {
            clearInterval(interval1);
            
            // Small delay before starting step 2
            setTimeout(() => {
                // Start step 2 after step 1 completes
                const interval2 = setInterval(() => {
                    prog2 += 1;
                    progress2.value = prog2;
                    progress2Text.textContent = prog2 + '%';

                    if (prog2 === 100) {
                        clearInterval(interval2);
                        // Small delay to ensure UI updates before alert
                        setTimeout(() => {
                            alert('Processing complete! ✅');
                            startBtn.disabled = false;
                        }, 100);
                    }
                }, 50);
            }, 100);
        }
    }, 100);
}